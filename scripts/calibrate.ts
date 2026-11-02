/**
 * Matcher calibration on real candidate recordings (research harness; docs/05-matcher-calibration.md).
 *
 *   genuine  = an auto-marked isian matched against ITS OWN recording with that occurrence masked out,
 *              so only other renditions of the same phrase by the same bird can match;
 *   impostor = the same isian matched against recordings of OTHER species.
 *
 * Compares raw path-cost scoring with per-isian cohort normalisation (Z-norm), using disjoint species
 * halves for cohort estimation and evaluation (no leakage). Prints AUC and acceptance at a fixed
 * false-match rate, and the cost/z value where "masuk" (70) should sit.
 *
 * Usage: npm run calibrate [-- --max-clip-sec 60]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRecording, prepareTemplate, SCORE_CONFIG, type PreparedTemplate } from '../src/dsp/analyze';
import { SR } from '../src/dsp/spectrogram';
import type { CandidateFile } from './candidate-types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'review', 'candidates');
const args = process.argv.slice(2);
const MAX_CLIP_SEC = Number(args[args.indexOf('--max-clip-sec') + 1] || 60);
const TARGET_FPR = 0.05;

const decode = (f: string) => {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', join(DIR, f), '-ac', '1', '-ar', String(SR), '-t', String(MAX_CLIP_SEC), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
};

export function auc(gen: number[], imp: number[]): number {
  // Higher score = more similar.
  let s = 0;
  for (const g of gen) for (const i of imp) s += g > i ? 1 : g === i ? 0.5 : 0;
  return s / (gen.length * imp.length || 1);
}

/** Threshold at which ≤ TARGET_FPR of impostors pass, and the share of genuine pairs above it. */
export function atFpr(gen: number[], imp: number[], fpr = TARGET_FPR): { threshold: number; tpr: number } {
  const sorted = [...imp].sort((a, b) => b - a);
  const threshold = sorted[Math.max(0, Math.floor(fpr * sorted.length) - 1)] ?? Infinity;
  return { threshold, tpr: gen.filter((g) => g > threshold).length / (gen.length || 1) };
}

function main() {
  const file: CandidateFile = JSON.parse(readFileSync(join(DIR, 'candidates.json'), 'utf8'));
  // Clean clips only: the matcher is judged on usable material, not on rejected noise.
  const clips = file.candidates.filter((c) => c.auto.A3?.status === 'pass' && c.auto.A4?.status === 'pass' && c.isian.length > 0);
  const species = [...new Set(clips.map((c) => c.species))].sort();
  console.log(`${clips.length} clean clips, ${species.length} species`);
  const audio = new Map(clips.map((c) => [c.id, decode(c.file)]));

  // One template per clip: its most repeated auto-isian (inside the decoded window).
  const tpls: { clip: (typeof clips)[number]; t: PreparedTemplate; s: number; e: number }[] = [];
  for (const c of clips) {
    const i = c.isian.find((x) => x.endSec < MAX_CLIP_SEC);
    if (!i) continue;
    tpls.push({ clip: c, t: prepareTemplate(i.id, audio.get(c.id)!, i.startSec, i.endSec), s: i.startSec, e: i.endSec });
  }
  const saved = { ...SCORE_CONFIG };
  SCORE_CONFIG.costPerfect = 0;
  SCORE_CONFIG.costUnrelated = 1; // similarity = 100·(1 − cost): recover raw cost
  const cost = (sim: number) => 1 - sim / 100;

  // Genuine: own clip with the template occurrence masked.
  const genuine = tpls.map(({ clip, t, s, e }) => {
    const rec = audio.get(clip.id)!.slice();
    rec.fill(0, Math.max(0, Math.floor((s - 0.15) * SR)), Math.min(rec.length, Math.ceil((e + 0.15) * SR)));
    return cost(analyzeRecording(rec, [t]).matches[0].bestSimilarity);
  });
  // Cost matrix: every template against every clip of another species.
  const costs = new Map<string, Map<string, number>>(tpls.map((x) => [x.t.id, new Map()]));
  for (const c of clips) {
    const others = tpls.filter((x) => x.clip.species !== c.species);
    analyzeRecording(audio.get(c.id)!, others.map((o) => o.t)).matches.forEach((m) => costs.get(m.templateId)!.set(c.id, cost(m.bestSimilarity)));
    process.stdout.write('.');
  }
  console.log();

  // Split species into halves: cohort statistics from one half, evaluation impostors from the other.
  const half = new Set(species.filter((_, i) => i % 2 === 0));
  const rows = tpls.map((x, k) => {
    const own = x.clip.species;
    const vs = [...costs.get(x.t.id)!.entries()].map(([clipId, v]) => ({ sp: clips.find((c) => c.id === clipId)!.species, v }));
    const cohortSide = half.has(own) ? (sp: string) => !half.has(sp) : (sp: string) => half.has(sp);
    const cohort = vs.filter((r) => cohortSide(r.sp)).map((r) => r.v);
    const evalImp = vs.filter((r) => !cohortSide(r.sp) && r.sp !== own).map((r) => r.v);
    const mu = cohort.reduce((a, b) => a + b, 0) / (cohort.length || 1);
    const sd = Math.sqrt(cohort.reduce((a, b) => a + (b - mu) ** 2, 0) / (cohort.length || 1)) || 0.05;
    return { id: x.t.id, species: own, frames: x.t.features.frames, gen: genuine[k], imp: evalImp, mu, sd };
  }).filter((r) => r.imp.length > 0);

  const rawGen = rows.map((r) => -r.gen);
  const rawImp = rows.flatMap((r) => r.imp.map((v) => -v));
  const zGen = rows.map((r) => (r.mu - r.gen) / r.sd);
  const zImp = rows.flatMap((r) => r.imp.map((v) => (r.mu - v) / r.sd));
  const raw = { auc: auc(rawGen, rawImp), ...atFpr(rawGen, rawImp) };
  const z = { auc: auc(zGen, zImp), ...atFpr(zGen, zImp) };
  const summary = {
    generatedAt: new Date().toISOString(),
    clips: clips.length, species: species.length, templates: rows.length, impostorPairs: rawImp.length,
    raw: { auc: +raw.auc.toFixed(3), tprAt5pctFpr: +raw.tpr.toFixed(3), masukCost: +(-raw.threshold).toFixed(3) },
    znorm: { auc: +z.auc.toFixed(3), tprAt5pctFpr: +z.tpr.toFixed(3), masukZ: +z.threshold.toFixed(2) },
    // Operating points for the raw score: cost threshold at a given false-match rate, and the share of
    // genuine repeats accepted there. Used to place "masuk" (70) and "mulai mirip" (50).
    operatingPoints: [0.01, 0.02, 0.05, 0.1, 0.2].map((fpr) => {
      const p = atFpr(rawGen, rawImp, fpr);
      return { fpr, cost: +(-p.threshold).toFixed(3), tpr: +p.tpr.toFixed(3) };
    }),
    currentMapping: (() => {
      // FPR / TPR at the cost where the shipped mapping puts "masuk" and "mirip".
      const at = (sim: number) => saved.costUnrelated - (sim / 100) * (saved.costUnrelated - saved.costPerfect);
      return [70, 50].map((sim) => {
        const c = at(sim);
        return { similarity: sim, cost: +c.toFixed(3), fpr: +(rawImp.filter((v) => -v < c).length / rawImp.length).toFixed(3), tpr: +(rawGen.filter((g) => -g < c).length / rawGen.length).toFixed(3) };
      });
    })(),
    genuineCostMedian: +[...rows.map((r) => r.gen)].sort((a, b) => a - b)[Math.floor(rows.length / 2)].toFixed(3),
    impostorCostMedian: +[...rawImp.map((v) => -v)].sort((a, b) => a - b)[Math.floor(rawImp.length / 2)].toFixed(3),
  };
  writeFileSync(join(DIR, 'CALIBRATION.json'), JSON.stringify({ summary, rows: rows.map(({ imp, ...r }) => ({ ...r, impostors: imp.length })) }, null, 1));
  console.log(JSON.stringify(summary, null, 2));
}

if (!process.env.VITEST) main();
