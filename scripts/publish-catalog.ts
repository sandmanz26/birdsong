/**
 * Step 3 of 3 — PUBLISH. The only way audio enters the product.
 *
 * Reads review/candidates/candidates.json + expert approvals in content/curation.json and copies ONLY
 * tracks with zero standard blockers (scripts/standard.ts) into public/catalog/. Packs are published only
 * when they contain enough approved material. Everything else is reported, never silently included.
 *
 * Usage: npm run catalog:publish [-- --curation path] [-- --out dir] [-- --packs path]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalog, CatalogPack, CatalogTrack } from '../src/catalog/types';
import type { Candidate, CandidateFile } from './candidate-types';
import { analyzeRecording, prepareTemplate, SCORE_CONFIG } from '../src/dsp/analyze';
import { SR } from '../src/dsp/spectrogram';
import { LIMITS, publishBlockers, speciesTotalOk, STANDARD_VERSION, type Approval } from './standard';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (n: string) => (args.indexOf(`--${n}`) >= 0 ? args[args.indexOf(`--${n}`) + 1] : undefined);
const CAND_DIR = join(ROOT, 'review', 'candidates');
const CURATION = arg('curation') ?? join(ROOT, 'content', 'curation.json');
const OUT = arg('out') ?? join(ROOT, 'public', 'catalog');
const PACKS = arg('packs') ?? join(ROOT, 'content', 'packs.json');
const WITH_COHORT = args.includes('--cohort');

export interface PackDef { id: string; target: string[]; nameId: string; nameEn: string; descId: string; descEn: string; species: string[]; preset: CatalogPack['preset'] }
interface RegistrySpecies { id: string; nameId: string; nameEn: string; roles: string[]; recommendedIsian?: string[] }

/** Clips published per species (the curator orders them by approving). */
const MAX_CLIPS_PER_SPECIES = 6;
/** …and at most this much material per species (data budget per pack). */
const MAX_SECONDS_PER_SPECIES = 240;
/** Delivery bitrate (mono MP3): clean up to ~11 kHz at ~0.7 MB per 90 s — mobile-data friendly. */
const PUBLISH_BITRATE = '64k';

/**
 * One "basic pack" per target species, generated from the registry: the bird's own master song plus
 * the research-proposed isian (content/species.json → recommendedIsian). Hand-written packs in
 * content/packs.json are added on top (e.g. cross-species "variety" packs).
 */
export function generatePacks(registry: RegistrySpecies[], extra: PackDef[]): PackDef[] {
  const byId = new Map(registry.map((r) => [r.id, r]));
  const auto = registry.filter((r) => r.roles.includes('master')).map((r): PackDef => {
    const isian = (r.recommendedIsian ?? []).filter((x) => byId.has(x));
    const listId = isian.map((x) => byId.get(x)!.nameId).join(', ');
    const listEn = isian.map((x) => byId.get(x)!.nameEn).join(', ');
    return {
      id: `${r.id}_dasar`, target: [r.id], nameId: `${r.nameId} – Paket dasar`, nameEn: `${r.nameEn} – Basic pack`,
      descId: isian.length ? `Suara ${r.nameId} sebagai master, plus isian: ${listId}.` : `Suara ${r.nameId} sebagai master.`,
      descEn: isian.length ? `${r.nameEn} reference song, plus isian: ${listEn}.` : `${r.nameEn} reference song.`,
      species: [r.id, ...isian], preset: 'pagiMalam',
    };
  });
  return [...auto, ...extra.filter((e) => !auto.some((a) => a.id === e.id))];
}

/**
 * Offered only when it is genuinely useful: a pack for a target bird needs that bird's own master song
 * plus at least one approved isian (unless the pack is master-only by design); other packs need ≥ 2
 * approved species.
 */
export function packAvailable(def: PackDef, approvedSpecies: Set<string>): boolean {
  const have = def.species.filter((s) => approvedSpecies.has(s));
  const ownMaster = def.species.filter((s) => def.target.includes(s));
  if (ownMaster.length === 0) return have.length >= 2;
  if (!ownMaster.every((s) => approvedSpecies.has(s))) return false;
  const isianSpecies = def.species.filter((s) => !def.target.includes(s));
  return isianSpecies.length === 0 || isianSpecies.some((s) => approvedSpecies.has(s));
}

function main() {
  const cands: CandidateFile = existsSync(join(CAND_DIR, 'candidates.json'))
    ? JSON.parse(readFileSync(join(CAND_DIR, 'candidates.json'), 'utf8'))
    : { standardVersion: STANDARD_VERSION, generatedAt: '', candidates: [] };
  const curation = JSON.parse(readFileSync(CURATION, 'utf8')) as { approvals?: Record<string, Approval> };
  const registry = (JSON.parse(readFileSync(join(ROOT, 'content', 'species.json'), 'utf8')) as { species: RegistrySpecies[] }).species;
  const packDefs = generatePacks(registry, (JSON.parse(readFileSync(PACKS, 'utf8')) as { packs: PackDef[] }).packs);
  const approvals = curation.approvals ?? {};

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'audio'), { recursive: true });
  const tracks: CatalogTrack[] = [];
  const report: string[] = [];
  for (const c of cands.candidates) {
    const ap = approvals[c.id];
    const blockers = publishBlockers(c.auto, ap);
    if (blockers.length) {
      report.push(`✗ ${c.id}: ${blockers.join('; ')}`);
      continue;
    }
    const same = tracks.filter((t) => t.species === c.species);
    if (same.length >= MAX_CLIPS_PER_SPECIES || same.reduce((a, t) => a + t.durationSec, 0) + c.durationSec > MAX_SECONDS_PER_SPECIES) {
      report.push(`– ${c.id}: approved, but ${c.species} already has its clip/time budget (${MAX_CLIPS_PER_SPECIES} clips, ${MAX_SECONDS_PER_SPECIES} s)`);
      continue;
    }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(CAND_DIR, c.file), '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', PUBLISH_BITRATE, join(OUT, c.file)]);
    tracks.push({
      id: c.id, species: c.species, role: c.role, nameId: c.nameId, nameEn: c.nameEn, sci: c.sci,
      file: c.file, bytes: statSync(join(OUT, c.file)).size, durationSec: c.durationSec,
      title: c.title, license: c.license, licenseUrl: c.licenseUrl, recordist: c.recordist, source: c.source, sourceUrl: c.sourceUrl, country: c.country,
      modified: `Excerpt ${c.sourceWindow.startSec}–${(c.sourceWindow.startSec + c.sourceWindow.lengthSec).toFixed(1)} s; high-pass 400 Hz; loudness-normalised to −20 LUFS; fades; mono MP3 ${PUBLISH_BITRATE}bps.`,
      curation: { curator: ap!.curator, role: ap!.role, date: ap!.date, standardVersion: STANDARD_VERSION, notes: ap!.notes },
      isian: c.isian.filter((i) => ap!.isian[i.id]).map((i) => ({ id: i.id, startSec: i.startSec, endSec: i.endSec, ...ap!.isian[i.id] })),
    });
    report.push(`✓ ${c.id}: published (approved by ${ap!.curator}, ${ap!.role}, ${ap!.date})`);
  }

  // P1: hold back species without enough approved material in total.
  for (const sp of new Set(tracks.map((t) => t.species))) {
    const secs = tracks.filter((t) => t.species === sp).map((t) => t.durationSec);
    if (!speciesTotalOk(secs)) {
      report.push(`… ${sp}: held back — only ${Math.round(secs.reduce((a, b) => a + b, 0))} s approved (needs ${LIMITS.minSpeciesSec} s)`);
      for (let i = tracks.length - 1; i >= 0; i--) if (tracks[i].species === sp) tracks.splice(i, 1);
    }
  }
  const approvedSpecies = new Set(tracks.map((t) => t.species));
  const packs: CatalogPack[] = packDefs
    .filter((d) => packAvailable(d, approvedSpecies))
    .map((d) => ({
      id: d.id, target: d.target, nameId: d.nameId, nameEn: d.nameEn, descId: d.descId, descEn: d.descEn, preset: d.preset,
      trackIds: d.species.flatMap((s) => tracks.filter((t) => t.species === s).map((t) => t.id)),
      missingSpecies: d.species.filter((s) => !approvedSpecies.has(s)),
    }));
  for (const d of packDefs) if (!packs.some((p) => p.id === d.id)) report.push(`… pack ${d.id}: not offered yet (needs approved ${d.species.filter((s) => !approvedSpecies.has(s)).join(', ')})`);

  if (WITH_COHORT) addCohorts(tracks, cands.candidates, report);
  const catalog: Catalog = { version: 2, standardVersion: STANDARD_VERSION, generatedAt: new Date().toISOString(), tracks, packs };
  writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1));
  writeFileSync(join(OUT, 'ATTRIBUTION.md'), attribution(catalog));
  console.log(report.join('\n'));
  console.log(`\nPublished ${tracks.length} track(s), ${packs.length} pack(s) to ${OUT}`);
}

/**
 * Cohort statistics per published isian: its best-match cost against clean recordings of OTHER species
 * (all candidates, not only published ones, for a larger cohort). Enables cohort-normalised scoring
 * in the app (SCORE_CONFIG.mode = 'znorm'), see docs/05-matcher-calibration.md.
 */
function addCohorts(tracks: CatalogTrack[], all: Candidate[], report: string[]) {
  const decode = (f: string) => {
    const b = execFileSync('ffmpeg', ['-v', 'error', '-i', join(CAND_DIR, f), '-ac', '1', '-ar', String(SR), '-t', '60', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4).slice();
  };
  const cohortClips = all.filter((c) => c.auto.A3?.status === 'pass' && c.auto.A4?.status === 'pass');
  const saved = { ...SCORE_CONFIG };
  SCORE_CONFIG.mode = 'raw';
  SCORE_CONFIG.costPerfect = 0;
  SCORE_CONFIG.costUnrelated = 1;
  const templates = tracks.flatMap((t) => {
    const audio = decode(t.file.startsWith('audio/') ? t.file : `audio/${t.file}`);
    return t.isian.map((i) => ({ track: t, isian: i, tpl: prepareTemplate(i.id, audio, i.startSec, i.endSec) }));
  });
  const costs = new Map<string, number[]>(templates.map((x) => [x.isian.id, []]));
  for (const clip of cohortClips) {
    const others = templates.filter((x) => x.track.species !== clip.species);
    if (!others.length) continue;
    analyzeRecording(decode(clip.file), others.map((o) => o.tpl)).matches.forEach((m) => costs.get(m.templateId)!.push(1 - m.bestSimilarity / 100));
  }
  Object.assign(SCORE_CONFIG, saved);
  for (const x of templates) {
    const v = costs.get(x.isian.id)!;
    if (v.length < 5) continue; // too small a cohort to be meaningful
    const mu = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length);
    x.isian.cohort = { mu: +mu.toFixed(4), sd: +Math.max(0.01, sd).toFixed(4) };
  }
  report.push(`cohort statistics: ${templates.filter((x) => x.isian.cohort).length}/${templates.length} isian (cohort of ${cohortClips.length} clips)`);
}

/** TASL attribution (Title, Author, Source, Licence) + modification notice, per CC best practice. */
function attribution(c: Catalog): string {
  const rows = c.tracks.map((t) => `| "${t.title}" | ${t.recordist} | [${t.source}](${t.sourceUrl}) | [${t.license}](${t.licenseUrl}) | ${t.modified} | ${t.curation.curator} (${t.curation.role}), ${t.curation.date} |`);
  return `# Recording credits\n\nEvery track below was reviewed against the Kicau Coach content standard v${c.standardVersion} and approved by the named curator.\n\n| Title | Author | Source | Licence | Modifications | Curated by |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

// Imported by unit tests (generatePacks, packAvailable) without running.
if (!process.env.VITEST) main();
