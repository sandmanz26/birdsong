/**
 * Step 1 of 3 — CANDIDATES (not the product).
 *
 * For every species in content/species.json: checks the scientific name against the GBIF Backbone,
 * collects recordings from iNaturalist (no key), xeno-canto (XC_API_KEY) and Wikimedia Commons, keeps
 * only the right taxon and commercial-compatible licences (or documented written permission), removes
 * duplicates, processes up to --per-species clips, measures them against the content standard
 * (scripts/standard.ts) and writes review material to review/candidates/:
 *
 *   candidates.json   processed clips + measurements (audio in review/candidates/audio/, not committed)
 *   COVERAGE.md       per-species capacity: what is available, usable, and missing
 *   PERMISSIONS.md    good non-commercial recordings worth a written permission request
 *
 *   Step 2: npm run review           — expert listens and signs off → content/curation.json
 *   Step 3: npm run catalog:publish  — only approved, standard-compliant clips go to public/catalog/
 *
 * Usage: [XC_API_KEY=...] npm run catalog:candidates [-- --only cililin,ciblek] [-- --per-species 4]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRecording, phraseTypes } from '../src/dsp/analyze';
import { fingerprint, isDuplicate, type Fingerprint } from '../src/dsp/fingerprint';
import { HOP_SEC, logMel, SR } from '../src/dsp/spectrogram';
import { segment } from '../src/dsp/segment';
import type { Candidate as CandidateTrack, CandidateFile, Permission } from './candidate-types';
import { commons, inaturalist, taxonMatches, xcNumber, xenoCanto, type SourceRecord, type SpeciesDef } from './sources';
import { autoChecks, LIMITS, STANDARD_VERSION } from './standard';
import { gbifMatch, taxonomyAccepted } from './taxonomy';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'review', 'candidates');
const AUDIO = join(OUT, 'audio');
const CACHE = join(ROOT, '.cache', 'catalog');
const UA = 'KicauCoachCatalogBot/0.2 (https://github.com/sandmanz26/birdsong)';

interface RegistrySpecies extends SpeciesDef { gbifSynonymOf?: string }
interface Curation { exclude: string[]; permissions?: Record<string, Permission> }

const args = process.argv.slice(2);
const arg = (name: string) => (args.indexOf(`--${name}`) >= 0 ? args[args.indexOf(`--${name}`) + 1] : undefined);
const PER_SPECIES = Number(arg('per-species') ?? 6);
const ONLY = arg('only')?.split(',');
/** --shard i/n: process every n-th species (offset i) into candidates.shard-i.json; --merge combines shards. */
const SHARD = arg('shard')?.split('/').map(Number) as [number, number] | undefined;
const MERGE = args.includes('--merge');
const XC_KEY = process.env.XC_API_KEY;
const TARGET_SEC = 90;
const MAX_ATTEMPTS = Number(arg('max-attempts') ?? 16);

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as T;
const species = readJson<{ species: RegistrySpecies[] }>('content/species.json').species;
const curation = readJson<Curation>('content/curation.json');

function rank(sp: SpeciesDef, c: SourceRecord): number {
  let score = 0;
  score += { A: 50, B: 35, C: 10 }[c.quality] ?? 25;
  if (c.communityVerified) score += 15;
  if (c.background) score -= c.background * 8;
  if (sp.country.length && sp.country.includes(c.country)) score += 25; // local dialects matter
  if (sp.types.length && sp.types.some((t) => c.type.toLowerCase().includes(t))) score += 10;
  if (c.lengthSec >= 30 && c.lengthSec <= 600) score += 10;
  else if (c.lengthSec > 0 && c.lengthSec < 15) score -= 30;
  return score;
}

// ---------------------------------------------------------------------------------------------------
// Audio processing
// ---------------------------------------------------------------------------------------------------

function decode(path: string, sr = SR): Float32Array {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(sr), '-af', 'highpass=f=400', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
}

/** Start time of the most song-dense window of `len` seconds. */
function bestWindow(samples: Float32Array, len: number): number {
  const total = samples.length / SR;
  if (total <= len) return 0;
  const seg = segment(logMel(samples));
  const active = new Float32Array(seg.activity.length);
  for (const s of seg.syllables) for (let f = s.start; f < s.end; f++) active[f] = 1;
  const win = Math.round(len / HOP_SEC);
  let sum = 0;
  for (let f = 0; f < win; f++) sum += active[f];
  let best = sum, bestStart = 0;
  for (let f = win; f < active.length; f++) {
    sum += active[f] - active[f - win];
    if (sum > best) {
      best = sum;
      bestStart = f - win + 1;
    }
  }
  return bestStart * HOP_SEC;
}

async function download(c: SourceRecord): Promise<string> {
  mkdirSync(join(CACHE, 'raw'), { recursive: true });
  const ext = (/\.(mp3|ogg|oga|wav|flac|m4a|opus|webm)(\?|$)/i.exec(c.downloadUrl)?.[1] ?? 'mp3').toLowerCase();
  const path = join(CACHE, 'raw', c.key.replace(/[^a-z0-9]+/gi, '_') + '.' + ext);
  if (existsSync(path) && statSync(path).size > 0) return path;
  const res = await fetch(c.downloadUrl, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

const TARGET_LUFS = -20;
const CEILING_DBTP = -2;
const MAX_LIMIT_DB = 4;
const LIMIT_DBFS = -2.5;

/** Integrated loudness and true peak (ITU-R BS.1770 via ffmpeg ebur128). */
function measureLoudness(path: string): { lufs: number; truePeak: number } {
  return measureLoudnessArgs(['-i', path]);
}

function measureLoudnessArgs(input: string[]): { lufs: number; truePeak: number } {
  // ffmpeg writes the ebur128 summary to stderr.
  const af = input.indexOf('-af');
  const chain = af >= 0 ? `${input[af + 1]},ebur128=peak=true` : 'ebur128=peak=true';
  const inArgs = af >= 0 ? input.slice(0, af) : input;
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats ${inArgs.map((x) => `"${x}"`).join(' ')} -af "${chain}" -f null - 2>&1`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const summary = out.slice(out.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const truePeak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  return { lufs, truePeak };
}

function sourceStats(raw: string): { sampleRate: number; clippedFraction: number } {
  const sampleRate = Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', raw], { encoding: 'utf8' }).trim());
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', raw, '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const x = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  let clipped = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= 0.999) clipped++;
  return { sampleRate, clippedFraction: x.length ? clipped / x.length : 0 };
}

const fingerprints = new Map<string, Fingerprint>();

function processCandidate(raw: string, id: string, sp: SpeciesDef, c: SourceRecord, taxonomyOk: boolean | null, permitted: boolean): CandidateTrack {
  const full = decode(raw);
  const total = full.length / SR;
  const len = Math.min(TARGET_SEC, total);
  const start = bestWindow(full, len);
  mkdirSync(AUDIO, { recursive: true });
  const outFile = join(AUDIO, `${id}.mp3`);
  const fadeOut = Math.max(0, len - 1.5);
  // Gentle processing only: high-pass (rumble), loudness normalisation (BS.1770), fades. No denoising,
  // pitch or time changes — the bird's song itself is never altered.
  // Two-pass loudnorm: measure, then apply a linear gain to hit the target exactly; a true-peak limiter
  // only engages if linear gain alone would exceed the ceiling.
  const pre = `highpass=f=400,afade=t=in:d=0.8,afade=t=out:st=${fadeOut.toFixed(2)}:d=1.5`;
  const cut = ['-ss', start.toFixed(2), '-t', len.toFixed(2), '-i', raw];
  // Explicit linear gain staging (loudnorm's "linear" mode silently falls back to dynamic mode on
  // short or peaky clips): measure BS.1770 loudness + true peak, apply one gain, and allow at most
  // MAX_LIMIT_DB of gentle peak limiting. Peakier material simply ends below target and fails A2.
  const m0 = measureLoudnessArgs([...cut, '-af', pre]);
  const gain = Math.min(TARGET_LUFS - m0.lufs, CEILING_DBTP + MAX_LIMIT_DB - m0.truePeak);
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...cut, '-af', `${pre},volume=${gain.toFixed(2)}dB,alimiter=limit=${(10 ** (LIMIT_DBFS / 20)).toFixed(3)}:level=false:attack=1:release=50`, '-ac', '1', '-ar', '44100', '-b:a', '96k', outFile]);
  const final = decode(outFile);
  const r = analyzeRecording(final, []);
  const { lufs, truePeak } = measureLoudness(outFile);
  const src = sourceStats(raw);
  const types = phraseTypes(final).filter((p) => p.count >= 2).slice(0, 3);
  const fp = fingerprint(final);
  fingerprints.set(id, fp);
  const isian = types.map((p, i) => ({ id: `${id}-i${i + 1}`, nameId: '', nameEn: '', startSec: p.startSec, endSec: p.endSec, repeats: p.count }));
  const measurements = {
    licenseAllowed: c.licenseAllowed || permitted,
    taxonomyOk,
    communityVerified: c.communityVerified,
    attribution: { title: c.title, author: c.recordist, sourceUrl: c.sourceUrl, licenseUrl: c.licenseUrl },
    durationSec: +(final.length / SR).toFixed(2),
    integratedLufs: lufs,
    truePeakDbtp: truePeak,
    snrDb: r.metrics.loudnessDb,
    kerjaPct: r.metrics.kerjaPct,
    clippedFraction: src.clippedFraction,
    sourceSampleRate: src.sampleRate,
    sourceGrade: c.quality,
    backgroundSpecies: c.background,
    country: c.country,
    preferredCountries: sp.country,
    isianCount: isian.length,
  };
  return {
    id, key: c.key, species: sp.id, role: sp.roles[0], nameId: sp.nameId, nameEn: sp.nameEn, sci: sp.sci,
    file: `audio/${id}.mp3`, bytes: statSync(outFile).size, durationSec: measurements.durationSec,
    license: c.license, licenseUrl: c.licenseUrl, recordist: c.recordist, source: c.source, sourceUrl: c.sourceUrl,
    title: c.title, country: c.country || undefined, sourceWindow: { startSec: +start.toFixed(2), lengthSec: +len.toFixed(2) },
    sourceTaxon: c.sourceTaxon, permission: permitted ? curation.permissions?.[c.key] : undefined,
    measurements, auto: autoChecks(measurements), isian, fingerprint: fp.vector.map((x) => +x.toFixed(3)),
  };
}

// ---------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------

interface Coverage { id: string; name: string; roles: string; taxonomy: string; found: number; usable: number; permissionPossible: number; duplicates: number; processed: number; autoPass: number; autoPassSec: number; preferredRegionSec?: number }

function mergeShards() {
  const shards = readdirSync(OUT).filter((f) => /^candidates\.shard-\d+\.json$/.test(f)).sort();
  const order = new Map(species.map((s, i) => [s.id, i]));
  const parts = shards.map((f) => JSON.parse(readFileSync(join(OUT, f), 'utf8')) as CandidateFile & { report: string[] });
  const bySpecies = <T extends { species?: string; id?: string }>(x: T) => order.get((x.species ?? x.id) as string) ?? 999;
  const file: CandidateFile = {
    standardVersion: STANDARD_VERSION,
    generatedAt: new Date().toISOString(),
    candidates: parts.flatMap((p) => p.candidates).sort((a, b) => bySpecies(a) - bySpecies(b)),
    coverage: parts.flatMap((p) => p.coverage ?? []).sort((a, b) => bySpecies(a) - bySpecies(b)),
    permissionRequests: parts.flatMap((p) => p.permissionRequests ?? []).sort((a, b) => (order.get(a.species) ?? 0) - (order.get(b.species) ?? 0)),
  };
  writeOutputs(file, parts.flatMap((p) => p.report));
  for (const f of shards) rmSync(join(OUT, f));
}

async function main() {
  if (MERGE) return mergeShards();
  console.log(`Standard v${STANDARD_VERSION} · iNaturalist: on · xeno-canto: ${XC_KEY ? 'on' : 'OFF (set XC_API_KEY)'} · Commons: on`);
  const prev: CandidateFile | null = existsSync(join(OUT, 'candidates.json')) ? JSON.parse(readFileSync(join(OUT, 'candidates.json'), 'utf8')) : null;
  const candidates: CandidateTrack[] = prev ? prev.candidates.filter((t) => ONLY && !ONLY.includes(t.species)) : [];
  const coverage: Coverage[] = prev?.coverage?.filter((c) => ONLY && !ONLY.includes(c.id)) ?? [];
  const permissionRequests: { species: string; rec: SourceRecord }[] = (prev?.permissionRequests ?? []).filter((p) => ONLY && !ONLY.includes(p.species));
  const report: string[] = [];

  for (const [idx, sp] of species.entries()) {
    if (ONLY && !ONLY.includes(sp.id)) continue;
    if (SHARD && idx % SHARD[1] !== SHARD[0]) continue;
    const gbif = await gbifMatch(sp.sci, join(CACHE, 'gbif.json'));
    const nameOk = taxonomyAccepted(gbif, sp.gbifSynonymOf);
    let found: SourceRecord[] = [];
    for (const [name, fn] of [['iNaturalist', () => inaturalist(sp)], ['xeno-canto', () => xenoCanto(sp, XC_KEY)], ['Commons', () => commons(sp)]] as const) {
      try {
        found.push(...(await fn()));
      } catch (e) {
        report.push(`! ${sp.id}: ${name} error ${(e as Error).message}`);
      }
    }
    found = found.filter((r) => !curation.exclude.includes(r.key) && taxonMatches(sp, r.sourceTaxon));
    const permitted = (r: SourceRecord) => !!curation.permissions?.[r.key];
    const usable = found.filter((r) => r.licenseAllowed || permitted(r)).sort((a, b) => rank(sp, b) - rank(sp, a));
    const requests = found.filter((r) => r.permissionPossible && !permitted(r)).sort((a, b) => rank(sp, b) - rank(sp, a)).slice(0, 10);
    permissionRequests.push(...requests.map((rec) => ({ species: sp.id, rec })));

    // Duplicates by xeno-canto catalogue number before downloading anything.
    const seenXc = new Set<string>();
    let duplicates = 0;
    const queue = usable.filter((r) => {
      const n = xcNumber(r);
      if (!n) return true;
      if (seenXc.has(n)) {
        duplicates++;
        return false;
      }
      seenXc.add(n);
      return true;
    });

    const kept: CandidateTrack[] = [];
    // "Passing" = no failure an expert could not override (M3 region / M4 community ID are expert-coverable).
    const passes = (c: CandidateTrack) => Object.entries(c.auto).every(([k, v]) => v.status !== 'fail' || k === 'M3' || k === 'M4');
    const preferred = (c: CandidateTrack) => c.auto.M3?.status === 'pass';
    // Keep trying (up to MAX_ATTEMPTS) until PER_SPECIES clips pass every automatic check; failing clips
    // are still recorded so the coverage report shows why material was rejected.
    for (const r of queue.slice(0, MAX_ATTEMPTS)) {
      if (kept.filter(passes).length >= PER_SPECIES) break;
      const id = `${sp.id}-${r.source === 'inaturalist' ? 'in' + r.key.slice(5) : r.source === 'xeno-canto' ? 'xc' + r.key.slice(3) : 'wc' + Math.abs(hash(r.key))}`;
      try {
        const cand = processCandidate(await download(r), id, sp, r, nameOk && taxonMatches(sp, r.sourceTaxon), permitted(r));
        // Duplicates by audio fingerprint (same recording uploaded twice / re-cropped).
        const dup = kept.find((k) => isDuplicate(fingerprints.get(k.id)!, fingerprints.get(cand.id)!));
        if (dup) {
          duplicates++;
          report.push(`  ${sp.id}: ${r.key} skipped — duplicate of ${dup.key}`);
          continue;
        }
        kept.push(cand);
        const fails = Object.entries(cand.auto).filter(([, v]) => v.status === 'fail').map(([k]) => k);
        const human = Object.entries(cand.auto).filter(([, v]) => v.status === 'human').map(([k]) => k);
        report.push(`${fails.length ? '✗' : '•'} ${sp.id}: ${r.key} (${r.license}, ${r.country || '?'}) ${fails.length ? 'FAILS ' + fails.map((f) => `${f}=${cand.auto[f].value}`).join(', ') : 'passes auto checks'}${human.length ? ' · expert: ' + human.join(',') : ''}`);
      } catch (e) {
        report.push(`  ${sp.id}: ${r.key} failed – ${(e as Error).message.slice(0, 120)}`);
      }
    }
    candidates.push(...kept);
    const passing = kept.filter(passes);
    coverage.push({
      id: sp.id, name: sp.nameId, roles: sp.roles.join('+'),
      taxonomy: nameOk ? (gbif.status === 'ACCEPTED' ? 'accepted' : `synonym of ${gbif.acceptedName} (documented)`) : `${gbif.matchType}/${gbif.status}`,
      found: found.length, usable: usable.length, permissionPossible: found.filter((r) => r.permissionPossible && !permitted(r)).length,
      duplicates, processed: kept.length, autoPass: passing.length, autoPassSec: Math.round(passing.reduce((a, k) => a + k.durationSec, 0)),
      preferredRegionSec: Math.round(passing.filter(preferred).reduce((a, k) => a + k.durationSec, 0)),
    });
    if (kept.length === 0) report.push(`– ${sp.id}: nothing usable (${found.length} found, ${usable.length} licence-usable)`);
  }

  const file: CandidateFile = { standardVersion: STANDARD_VERSION, generatedAt: new Date().toISOString(), candidates, coverage, permissionRequests };
  mkdirSync(OUT, { recursive: true });
  if (SHARD) {
    writeFileSync(join(OUT, `candidates.shard-${SHARD[0]}.json`), JSON.stringify({ ...file, report }, null, 1));
    console.log(`shard ${SHARD[0]}/${SHARD[1]}: ${candidates.length} clips for ${coverage.length} species`);
    return;
  }
  writeOutputs(file, report);
}

function writeOutputs(file: CandidateFile, report: string[]) {
  const { coverage, permissionRequests, candidates } = { coverage: file.coverage ?? [], permissionRequests: file.permissionRequests ?? [], candidates: file.candidates };
  writeFileSync(join(OUT, 'candidates.json'), JSON.stringify(file, null, 1));
  writeFileSync(join(OUT, 'REPORT.md'), `# Candidate report\n\nGenerated ${file.generatedAt} · standard v${STANDARD_VERSION}\n\n\`\`\`\n${report.join('\n')}\n\`\`\`\n`);
  writeFileSync(join(OUT, 'COVERAGE.md'), coverageMd(file));
  writeFileSync(join(OUT, 'PERMISSIONS.md'), permissionsMd(file));
  console.log(report.join('\n'));
  const ready = coverage.filter((c) => c.autoPassSec >= LIMITS.minSpeciesSec).length;
  console.log(`\n${candidates.length} clips for ${coverage.length} species · ${ready} species have ≥ ${LIMITS.minSpeciesSec} s passing auto checks (ready for expert review) · ${permissionRequests.length} permission requests`);
}

function coverageMd(f: CandidateFile): string {
  const rows = (f.coverage ?? []).map((c) => {
    const status = c.autoPassSec >= LIMITS.minSpeciesSec ? '✅ ready for expert review' : c.autoPass > 0 ? '🟡 needs more material' : c.permissionPossible > 0 ? '🟠 only via permission' : '⛔ no source yet';
    return `| ${c.name} | ${c.roles} | ${c.taxonomy} | ${c.found} | ${c.usable} | ${c.permissionPossible} | ${c.duplicates} | ${c.processed} | ${c.autoPass} | ${c.autoPassSec} s | ${c.preferredRegionSec ?? 0} s | ${status} |`;
  });
  return `# Coverage report\n\nGenerated ${f.generatedAt} · standard v${f.standardVersion}\n\n| Species | Role | Taxonomy (GBIF) | Found | Licence-usable | NC (permission possible) | Duplicates | Processed | Pass auto | Pass auto (s) | …from preferred region (s) | Status |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

function permissionsMd(f: CandidateFile): string {
  const rows = (f.permissionRequests ?? []).map(({ species: s, rec: r }) => `| ${s} | ${r.recordist} | ${r.license} | ${r.country || '?'} | ${r.communityVerified ? 'research grade' : r.quality !== '?' ? 'grade ' + r.quality : ''} | ${r.sourceUrl} | \`${r.key}\` |`);
  return `# Permission requests (non-commercial recordings)\n\nThese recordings are licensed for non-commercial use only. Ask the recordist for **written permission** for commercial use in Kicau Coach (trimmed + loudness-normalised, credited). When granted, record it in content/curation.json → permissions["<key>"] = { grantedBy, date, scope, evidence } and rerun the candidate build.\n\n| Species | Recordist | Licence | Country | ID | Link | Key |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
