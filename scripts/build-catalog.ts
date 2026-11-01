/**
 * Catalogue builder: turns licence-cleared field recordings into the app's ready-to-use masteran
 * library (public/catalog/). For every species in content/species.json it:
 *
 *   1. finds candidates on xeno-canto (API v3, needs XC_API_KEY) and Wikimedia Commons,
 *   2. keeps only allowed licences (commercial policy: CC0 / CC BY / CC BY-SA; beta adds NC; ND never,
 *      because trimming and loudness-normalising is a derivative work),
 *   3. ranks them (quality, no background species, region, sound type, length),
 *   4. downloads, picks the most song-dense window, high-passes, normalises loudness, fades, encodes
 *      64 kbps mono MP3,
 *   5. runs automatic QC with the app's own analyser (SNR, singing density, phrase count),
 *   6. pre-marks the most frequent phrase types as isian so "Cek Isian" works out of the box,
 *   7. writes catalog.json (tracks + packs) and ATTRIBUTION.md.
 *
 * Usage:
 *   XC_API_KEY=... npx vite-node scripts/build-catalog.ts [--policy commercial|beta] [--only id,id]
 *
 * Human curation (content/curation.json) can exclude or pin recordings and approve tracks.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRecording, phraseTypes } from '../src/dsp/analyze';
import { logMel, SR, HOP_SEC } from '../src/dsp/spectrogram';
import { segment } from '../src/dsp/segment';
import type { Catalog, CatalogPack, CatalogTrack } from '../src/catalog/types';
import { classifyLicense as classifyLicenseFor } from './license';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'catalog');
const AUDIO = join(OUT, 'audio');
const CACHE = join(ROOT, '.cache', 'catalog');
const UA = 'KicauCoachCatalogBot/0.1 (https://github.com/sandmanz26/birdsong)';

interface SpeciesDef { id: string; sci: string; nameId: string; nameEn: string; roles: ('master' | 'isian')[]; types: string[]; country: string[] }
interface PackDef { id: string; target: string[]; nameId: string; nameEn: string; descId: string; descEn: string; species: string[]; preset: CatalogPack['preset'] }
interface ManualIsian { startSec: number; endSec: number; nameId: string; nameEn: string }
interface Curation { exclude: string[]; pin: Record<string, string>; approved: string[]; isianNames: Record<string, { nameId: string; nameEn: string }>; isianManual?: Record<string, ManualIsian[]> }

interface Candidate {
  key: string; // 'xc:123' | 'commons:File:...'
  source: CatalogTrack['source'];
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
const POLICY = (arg('policy') ?? 'commercial') as Catalog['licensePolicy'];
const ONLY = arg('only')?.split(',');
const XC_KEY = process.env.XC_API_KEY;
const TARGET_SEC = 90;

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as T;
const species = readJson<{ species: SpeciesDef[] }>('content/species.json').species;
const packDefs = readJson<{ packs: PackDef[] }>('content/packs.json').packs;
const curation = readJson<Curation>('content/curation.json');

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

interface Processed { file: string; bytes: number; durationSec: number; qc: CatalogTrack['qc']; isian: CatalogTrack['isian'] }

const QC = { minSnrDb: 18, minKerjaPct: 12, minPhrases: 5 };

function processTrack(raw: string, id: string, sp: SpeciesDef): Processed | { reject: string } {
  const full = decode(raw);
  const total = full.length / SR;
  if (total < 8) return { reject: `too short (${total.toFixed(1)} s)` };
  const len = Math.min(TARGET_SEC, total);
  const start = bestWindow(full, len);
  mkdirSync(AUDIO, { recursive: true });
  const outFile = join(AUDIO, `${id}.mp3`);
  const fadeOut = Math.max(0, len - 1.5);
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-ss', start.toFixed(2), '-t', len.toFixed(2), '-i', raw,
    '-af', `highpass=f=400,loudnorm=I=-20:TP=-2:LRA=11,afade=t=in:d=0.8,afade=t=out:st=${fadeOut.toFixed(2)}:d=1.5`,
    '-ac', '1', '-ar', '44100', '-b:a', '64k', outFile,
  ]);
  // QC + isian markers are computed on the final file so times match what the app plays.
  const final = decode(outFile);
  const r = analyzeRecording(final, []);
  const qc = { snrDb: r.metrics.loudnessDb, kerjaPct: r.metrics.kerjaPct, phrases: r.metrics.phraseCount, variasi: r.metrics.variasi };
  if (qc.snrDb < QC.minSnrDb) return { reject: `low SNR ${qc.snrDb} dB` };
  if (qc.kerjaPct < QC.minKerjaPct) return { reject: `sparse singing ${qc.kerjaPct}%` };
  if (qc.phrases < QC.minPhrases) return { reject: `few phrases ${qc.phrases}` };
  const types = phraseTypes(final).filter((p) => p.count >= 2).slice(0, 2);
  const isian = types.map((p, i) => {
    const iid = `${id}-i${i + 1}`;
    const names = curation.isianNames[iid];
    return {
      id: iid,
      nameId: names?.nameId ?? `${sp.nameId} – frasa ${i + 1}`,
      nameEn: names?.nameEn ?? `${sp.nameEn} – phrase ${i + 1}`,
      startSec: p.startSec,
      endSec: p.endSec,
    };
  });
  // Expert-marked isian (e.g. short calls like gereja tarung that auto-marking skips) are appended.
  for (const [k, m] of (curation.isianManual?.[id] ?? []).entries()) isian.push({ id: `${id}-m${k + 1}`, ...m });
  return { file: `audio/${id}.mp3`, bytes: statSync(outFile).size, durationSec: +(final.length / SR).toFixed(2), qc, isian };
}

// ---------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------

async function main() {
  console.log(`Policy: ${POLICY} · xeno-canto: ${XC_KEY ? 'on' : 'OFF (set XC_API_KEY)'} · Commons: on`);
  const existing: Catalog | null = existsSync(join(OUT, 'catalog.json')) ? JSON.parse(readFileSync(join(OUT, 'catalog.json'), 'utf8')) : null;
  const tracks: CatalogTrack[] = existing ? existing.tracks.filter((t) => !ONLY || !ONLY.includes(t.species)) : [];
  const report: string[] = [];

  for (const sp of species) {
    if (ONLY && !ONLY.includes(sp.id)) continue;
    if (tracks.some((t) => t.species === sp.id)) {
      report.push(`= ${sp.id}: kept existing`);
      continue;
    }
    let candidates: Candidate[] = [];
    try {
      candidates = [...(await xenoCanto(sp)), ...(await commons(sp))];
    } catch (e) {
      report.push(`! ${sp.id}: source error ${(e as Error).message}`);
    }
    const pinned = curation.pin[sp.id];
    const usable = candidates
      .filter((c) => !curation.exclude.includes(c.key))
      .filter((c) => classifyLicense(c.license).allowed)
      .sort((a, b) => (b.key === pinned ? 1e6 : rank(sp, b)) - (a.key === pinned ? 1e6 : rank(sp, a)));
    const lic = candidates.length - usable.length;
    let done = false;
    for (const c of usable.slice(0, 6)) {
      const id = `${sp.id}-${c.key.startsWith('xc:') ? 'xc' + c.key.slice(3) : 'wc' + Math.abs(hash(c.key))}`;
      try {
        const raw = await download(c);
        const p = processTrack(raw, id, sp);
        if ('reject' in p) {
          report.push(`  ${sp.id}: ${c.key} rejected – ${p.reject}`);
          continue;
        }
        tracks.push({
          id, species: sp.id, role: sp.roles[0], nameId: sp.nameId, nameEn: sp.nameEn, sci: sp.sci,
          file: p.file, bytes: p.bytes, durationSec: p.durationSec, license: c.license, licenseUrl: c.licenseUrl,
          recordist: c.recordist, source: c.source, sourceUrl: c.sourceUrl, country: c.country || undefined,
          review: curation.approved.includes(id) ? 'approved' : 'auto', qc: p.qc, isian: p.isian,
        });
        report.push(`✓ ${sp.id}: ${c.key} (${c.license}, q${c.quality}, ${c.country || '?'}) snr ${p.qc.snrDb} dB, kerja ${p.qc.kerjaPct}%, ${p.isian.length} isian`);
        done = true;
        break;
      } catch (e) {
        report.push(`  ${sp.id}: ${c.key} failed – ${(e as Error).message}`);
      }
    }
    if (!done) report.push(`✗ ${sp.id}: no usable recording (${candidates.length} candidates, ${lic} excluded by licence/curation)`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const packs: CatalogPack[] = packDefs.map((p) => {
    const trackIds = p.species.map((s) => tracks.find((t) => t.species === s)?.id).filter((x): x is string => !!x);
    return {
      id: p.id, target: p.target, nameId: p.nameId, nameEn: p.nameEn, descId: p.descId, descEn: p.descEn, preset: p.preset,
      trackIds, missingSpecies: p.species.filter((s) => !tracks.some((t) => t.species === s)),
    };
  });
  const catalog: Catalog = { version: 1, generatedAt: new Date().toISOString(), licensePolicy: POLICY, tracks, packs };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1));
  writeFileSync(join(OUT, 'ATTRIBUTION.md'), attribution(catalog));
  console.log(report.join('\n'));
  console.log(`\n${tracks.length} tracks · ${(tracks.reduce((n, t) => n + t.bytes, 0) / 1e6).toFixed(1)} MB · packs: ${packs.map((p) => `${p.id}(${p.trackIds.length}/${p.trackIds.length + p.missingSpecies.length})`).join(' ')}`);
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

function attribution(c: Catalog): string {
  const rows = c.tracks.map((t) => `| ${t.nameEn} (*${t.sci}*) | ${t.recordist} | [${t.license}](${t.licenseUrl}) | [${t.source}](${t.sourceUrl}) |`);
  return `# Recording credits\n\nAll masteran recordings in this catalogue are used under the licences below. They were trimmed, high-pass filtered, loudness-normalised and re-encoded for training use; share-alike tracks are redistributed under the same licence.\n\n| Species | Recordist | Licence | Source |\n|---|---|---|---|\n${rows.join('\n')}\n`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
