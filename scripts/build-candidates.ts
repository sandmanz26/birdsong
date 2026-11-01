/**
 * Step 1 of 3 — CANDIDATES (not the product).
 *
 * Finds licence-cleared field recordings for every species in content/species.json (xeno-canto API v3
 * with XC_API_KEY, plus Wikimedia Commons), processes the best few per species, measures them against
 * the content standard (scripts/standard.ts) and writes them to review/candidates/ for expert review.
 *
 *   Step 2: npm run review           — expert listens and signs off in the review tool → content/curation.json
 *   Step 3: npm run catalog:publish  — only approved, standard-compliant tracks go to public/catalog/
 *
 * Usage: XC_API_KEY=... npm run catalog:candidates [-- --only cililin,ciblek] [-- --per-species 3]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRecording, phraseTypes } from '../src/dsp/analyze';
import { autoChecks, STANDARD_VERSION } from './standard';
import type { Candidate as CandidateTrack, CandidateFile } from './candidate-types';
import { logMel, SR, HOP_SEC } from '../src/dsp/spectrogram';
import { segment } from '../src/dsp/segment';
import { classifyLicense as classifyLicenseFor } from './license';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'review', 'candidates');
const AUDIO = join(OUT, 'audio');
const CACHE = join(ROOT, '.cache', 'catalog');
const UA = 'KicauCoachCatalogBot/0.1 (https://github.com/sandmanz26/birdsong)';

interface SpeciesDef { id: string; sci: string; nameId: string; nameEn: string; roles: ('master' | 'isian')[]; types: string[]; country: string[] }
interface ManualIsian { startSec: number; endSec: number; nameId: string; nameEn: string }
interface Curation { exclude: string[]; pin: Record<string, string>; approved: string[]; isianNames: Record<string, { nameId: string; nameEn: string }>; isianManual?: Record<string, ManualIsian[]> }

interface Candidate {
  key: string; // 'xc:123' | 'commons:File:...'
  source: CandidateTrack['source'];
  downloadUrl: string;
  sourceUrl: string;
  recordist: string;
  license: string;
  licenseUrl: string;
  quality: string; // A..E or '?'
  lengthSec: number;
  country: string;
  type: string;
  background: number;
}

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
// The product standard requires commercial-compatible licences (L1); there is no looser mode.
const POLICY = 'commercial' as const;
const PER_SPECIES = Number(arg('per-species') ?? 3);
const ONLY = arg('only')?.split(',');
const XC_KEY = process.env.XC_API_KEY;
const TARGET_SEC = 90;

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as T;
const species = readJson<{ species: SpeciesDef[] }>('content/species.json').species;
const curation = readJson<Curation>('content/curation.json');
void curation.pin;

// ---------------------------------------------------------------------------------------------------
// Licences
// ---------------------------------------------------------------------------------------------------

const classifyLicense = (raw: string) => classifyLicenseFor(raw, POLICY);

// ---------------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------------

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url.replace(/key=[^&]+/, 'key=***')}`);
    return res.json();
  }
  throw new Error(`gave up: ${url.replace(/key=[^&]+/, 'key=***')}`);
}

const parseLength = (s: string) => s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);

async function xenoCanto(sp: SpeciesDef): Promise<Candidate[]> {
  if (!XC_KEY) return [];
  const [gen, spp] = sp.sci.toLowerCase().split(' ');
  const out: Candidate[] = [];
  for (const q of ['A', 'B']) {
    const query = `gen:${gen} sp:${spp} q:${q}`;
    const url = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(query)}&per_page=200&key=${XC_KEY}`;
    const data = (await getJson(url)) as { recordings?: Record<string, unknown>[] };
    for (const r of data.recordings ?? []) {
      const lic = classifyLicense(String(r.lic ?? ''));
      out.push({
        key: `xc:${r.id}`,
        source: 'xeno-canto',
        downloadUrl: String(r.file).startsWith('//') ? 'https:' + r.file : String(r.file),
        sourceUrl: `https://xeno-canto.org/${r.id}`,
        recordist: String(r.rec ?? ''),
        license: lic.short,
        licenseUrl: lic.url,
        quality: String(r.q ?? '?'),
        lengthSec: parseLength(String(r.length ?? '0')),
        country: String(r.cnt ?? ''),
        type: String(r.type ?? ''),
        background: Array.isArray(r.also) ? (r.also as string[]).filter(Boolean).length : 0,
      });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return out;
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function commons(sp: SpeciesDef): Promise<Candidate[]> {
  const search = new URLSearchParams({ action: 'query', list: 'search', srsearch: `"${sp.sci}" filetype:audio`, srnamespace: '6', srlimit: '30', format: 'json', maxlag: '5' });
  const s = (await getJson(`https://commons.wikimedia.org/w/api.php?${search}`)) as { query?: { search: { title: string }[] } };
  const titles = (s.query?.search ?? []).map((x) => x.title);
  if (titles.length === 0) return [];
  await new Promise((r) => setTimeout(r, 3000));
  const info = new URLSearchParams({ action: 'query', titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|mediatype|size', format: 'json', maxlag: '5' });
  const d = (await getJson(`https://commons.wikimedia.org/w/api.php?${info}`)) as { query?: { pages: Record<string, { title: string; imageinfo?: { url: string; descriptionurl: string; mediatype: string; duration?: number; extmetadata: Record<string, { value: string }> }[] }> } };
  const out: Candidate[] = [];
  for (const page of Object.values(d.query?.pages ?? {})) {
    const ii = page.imageinfo?.[0];
    if (!ii || ii.mediatype !== 'AUDIO') continue;
    const m = ii.extmetadata;
    const lic = classifyLicense(m.LicenseUrl?.value || m.LicenseShortName?.value || '');
    out.push({
      key: `commons:${page.title}`,
      source: 'wikimedia-commons',
      downloadUrl: ii.url,
      sourceUrl: ii.descriptionurl,
      recordist: stripHtml(m.Artist?.value ?? 'Unknown'),
      license: lic.short,
      licenseUrl: lic.url,
      quality: '?',
      lengthSec: ii.duration ?? 0,
      country: '',
      type: stripHtml(m.ImageDescription?.value ?? '').toLowerCase().includes('song') ? 'song' : '',
      background: 0,
    });
  }
  return out;
}

function rank(sp: SpeciesDef, c: Candidate): number {
  let score = 0;
  score += { A: 50, B: 35, C: 10 }[c.quality] ?? 20;
  score -= c.background * 8;
  if (sp.country.length && sp.country.includes(c.country)) score += 15;
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

async function download(c: Candidate): Promise<string> {
  mkdirSync(join(CACHE, 'raw'), { recursive: true });
  const ext = (/\.(mp3|ogg|oga|wav|flac|m4a|opus|webm)(\?|$)/i.exec(c.downloadUrl)?.[1] ?? 'mp3').toLowerCase();
  const path = join(CACHE, 'raw', c.key.replace(/[^a-z0-9]+/gi, '_') + '.' + ext);
  if (existsSync(path) && statSync(path).size > 0) return path;
  const res = await fetch(c.downloadUrl, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

/** Integrated loudness and true peak (ITU-R BS.1770 via ffmpeg ebur128). */
function measureLoudness(path: string): { lufs: number; truePeak: number } {
  // ffmpeg writes the ebur128 summary to stderr; spawnSync-like capture via execFileSync + 2>&1.
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true -f null - 2>&1`], { encoding: 'utf8', maxBuffer: 1 << 26 });
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

function processCandidate(raw: string, id: string, sp: SpeciesDef, c: Candidate): CandidateTrack {
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
  const meas = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats ${cut.map((x) => `"${x}"`).join(' ')} -af "${pre},loudnorm=I=-20:TP=-2:LRA=20:print_format=json" -f null - 2>&1`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(meas.slice(meas.lastIndexOf('{'), meas.lastIndexOf('}') + 1)) as Record<string, string>;
  const second = `loudnorm=I=-20:TP=-2:LRA=20:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...cut, '-af', `${pre},${second},alimiter=limit=0.7:level=false`, '-ac', '1', '-ar', '44100', '-b:a', '96k', outFile]);
  const final = decode(outFile);
  const r = analyzeRecording(final, []);
  const { lufs, truePeak } = measureLoudness(outFile);
  const src = sourceStats(raw);
  const types = phraseTypes(final).filter((p) => p.count >= 2).slice(0, 3);
  const isian = types.map((p, i) => ({ id: `${id}-i${i + 1}`, nameId: '', nameEn: '', startSec: p.startSec, endSec: p.endSec, repeats: p.count }));
  const measurements = {
    licenseAllowed: classifyLicense(c.license).allowed,
    attribution: { title: c.key.replace(/^commons:File:/, '').replace(/^xc:/, 'XC'), author: c.recordist, sourceUrl: c.sourceUrl, licenseUrl: c.licenseUrl },
    durationSec: +(final.length / SR).toFixed(2),
    integratedLufs: lufs,
    truePeakDbtp: truePeak,
    snrDb: r.metrics.loudnessDb,
    kerjaPct: r.metrics.kerjaPct,
    clippedFraction: src.clippedFraction,
    sourceSampleRate: src.sampleRate,
    sourceGrade: c.quality,
    backgroundSpecies: c.source === 'xeno-canto' ? c.background : null,
    country: c.country,
    preferredCountries: sp.country,
    isianCount: isian.length,
  };
  return {
    id, key: c.key, species: sp.id, role: sp.roles[0], nameId: sp.nameId, nameEn: sp.nameEn, sci: sp.sci,
    file: `audio/${id}.mp3`, bytes: statSync(outFile).size, durationSec: measurements.durationSec,
    license: c.license, licenseUrl: c.licenseUrl, recordist: c.recordist, source: c.source, sourceUrl: c.sourceUrl,
    title: measurements.attribution.title, country: c.country || undefined, sourceWindow: { startSec: +start.toFixed(2), lengthSec: +len.toFixed(2) },
    measurements, auto: autoChecks(measurements), isian,
  };
}

// ---------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------

async function main() {
  console.log(`Standard v${STANDARD_VERSION} · xeno-canto: ${XC_KEY ? 'on' : 'OFF (set XC_API_KEY)'} · Commons: on`);
  const prev: CandidateFile | null = existsSync(join(OUT, 'candidates.json')) ? JSON.parse(readFileSync(join(OUT, 'candidates.json'), 'utf8')) : null;
  const candidates: CandidateTrack[] = prev ? prev.candidates.filter((t) => ONLY && !ONLY.includes(t.species)) : [];
  const report: string[] = [];
  for (const sp of species) {
    if (ONLY && !ONLY.includes(sp.id)) continue;
    let found: Candidate[] = [];
    try {
      found = [...(await xenoCanto(sp)), ...(await commons(sp))];
    } catch (e) {
      report.push(`! ${sp.id}: source error ${(e as Error).message}`);
    }
    const usable = found.filter((c) => !curation.exclude.includes(c.key) && classifyLicense(c.license).allowed).sort((a, b) => rank(sp, b) - rank(sp, a));
    let kept = 0;
    for (const c of usable.slice(0, PER_SPECIES * 2)) {
      if (kept >= PER_SPECIES) break;
      const id = `${sp.id}-${c.key.startsWith('xc:') ? 'xc' + c.key.slice(3) : 'wc' + Math.abs(hash(c.key))}`;
      try {
        const cand = processCandidate(await download(c), id, sp, c);
        candidates.push(cand);
        kept++;
        const fails = Object.entries(cand.auto).filter(([, v]) => v.status === 'fail').map(([k]) => k);
        const human = Object.entries(cand.auto).filter(([, v]) => v.status === 'human').map(([k]) => k);
        report.push(`${fails.length ? '✗' : '•'} ${sp.id}: ${c.key} (${c.license}, ${c.country || '?'}) ${fails.length ? 'FAILS ' + fails.map((f) => `${f}=${cand.auto[f].value}`).join(', ') : 'passes auto checks'}${human.length ? ' · needs expert: ' + human.join(',') : ''}`);
      } catch (e) {
        report.push(`  ${sp.id}: ${c.key} failed – ${(e as Error).message}`);
      }
    }
    if (kept === 0) report.push(`– ${sp.id}: no licence-cleared candidate (${found.length} found)`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  const file: CandidateFile = { standardVersion: STANDARD_VERSION, generatedAt: new Date().toISOString(), candidates };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'candidates.json'), JSON.stringify(file, null, 1));
  writeFileSync(join(OUT, 'REPORT.md'), `# Candidate report\n\nGenerated ${file.generatedAt} · standard v${STANDARD_VERSION}\n\n\`\`\`\n${report.join('\n')}\n\`\`\`\n`);
  console.log(report.join('\n'));
  console.log(`\n${candidates.length} candidates written to review/candidates/ — none are published until approved (npm run review → npm run catalog:publish).`);
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
