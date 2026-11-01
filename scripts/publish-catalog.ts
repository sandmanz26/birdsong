/**
 * Step 3 of 3 — PUBLISH. The only way audio enters the product.
 *
 * Reads review/candidates/candidates.json + expert approvals in content/curation.json and copies ONLY
 * tracks with zero standard blockers (scripts/standard.ts) into public/catalog/. Packs are published only
 * when they contain enough approved material. Everything else is reported, never silently included.
 *
 * Usage: npm run catalog:publish [-- --curation path] [-- --out dir] [-- --packs path]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalog, CatalogPack, CatalogTrack } from '../src/catalog/types';
import type { CandidateFile } from './candidate-types';
import { publishBlockers, STANDARD_VERSION, type Approval } from './standard';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (n: string) => (args.indexOf(`--${n}`) >= 0 ? args[args.indexOf(`--${n}`) + 1] : undefined);
const CAND_DIR = join(ROOT, 'review', 'candidates');
const CURATION = arg('curation') ?? join(ROOT, 'content', 'curation.json');
const OUT = arg('out') ?? join(ROOT, 'public', 'catalog');
const PACKS = arg('packs') ?? join(ROOT, 'content', 'packs.json');

interface PackDef { id: string; target: string[]; nameId: string; nameEn: string; descId: string; descEn: string; species: string[]; preset: CatalogPack['preset'] }

/** A pack is offered only with ≥ 2 approved tracks, including the target bird's own master song if the pack lists it. */
export function packAvailable(def: PackDef, approvedSpecies: Set<string>): boolean {
  const have = def.species.filter((s) => approvedSpecies.has(s));
  const ownMaster = def.species.filter((s) => def.target.includes(s));
  return have.length >= 2 && ownMaster.every((s) => approvedSpecies.has(s));
}

function main() {
  const cands: CandidateFile = existsSync(join(CAND_DIR, 'candidates.json'))
    ? JSON.parse(readFileSync(join(CAND_DIR, 'candidates.json'), 'utf8'))
    : { standardVersion: STANDARD_VERSION, generatedAt: '', candidates: [] };
  const curation = JSON.parse(readFileSync(CURATION, 'utf8')) as { approvals?: Record<string, Approval> };
  const packDefs = (JSON.parse(readFileSync(PACKS, 'utf8')) as { packs: PackDef[] }).packs;
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
    // One published track per species: the first approved candidate wins (curator controls by rejecting others).
    if (tracks.some((t) => t.species === c.species)) {
      report.push(`– ${c.id}: approved, but ${c.species} already has a published track`);
      continue;
    }
    copyFileSync(join(CAND_DIR, c.file), join(OUT, c.file));
    tracks.push({
      id: c.id, species: c.species, role: c.role, nameId: c.nameId, nameEn: c.nameEn, sci: c.sci,
      file: c.file, bytes: c.bytes, durationSec: c.durationSec,
      title: c.title, license: c.license, licenseUrl: c.licenseUrl, recordist: c.recordist, source: c.source, sourceUrl: c.sourceUrl, country: c.country,
      modified: `Excerpt ${c.sourceWindow.startSec}–${(c.sourceWindow.startSec + c.sourceWindow.lengthSec).toFixed(1)} s; high-pass 400 Hz; loudness-normalised to −20 LUFS; fades.`,
      curation: { curator: ap!.curator, role: ap!.role, date: ap!.date, standardVersion: STANDARD_VERSION, notes: ap!.notes },
      isian: c.isian.filter((i) => ap!.isian[i.id]).map((i) => ({ id: i.id, startSec: i.startSec, endSec: i.endSec, ...ap!.isian[i.id] })),
    });
    report.push(`✓ ${c.id}: published (approved by ${ap!.curator}, ${ap!.role}, ${ap!.date})`);
  }

  const approvedSpecies = new Set(tracks.map((t) => t.species));
  const packs: CatalogPack[] = packDefs
    .filter((d) => packAvailable(d, approvedSpecies))
    .map((d) => ({
      id: d.id, target: d.target, nameId: d.nameId, nameEn: d.nameEn, descId: d.descId, descEn: d.descEn, preset: d.preset,
      trackIds: d.species.map((s) => tracks.find((t) => t.species === s)?.id).filter((x): x is string => !!x),
      missingSpecies: d.species.filter((s) => !approvedSpecies.has(s)),
    }));
  for (const d of packDefs) if (!packs.some((p) => p.id === d.id)) report.push(`… pack ${d.id}: not offered yet (needs approved ${d.species.filter((s) => !approvedSpecies.has(s)).join(', ')})`);

  const catalog: Catalog = { version: 2, standardVersion: STANDARD_VERSION, generatedAt: new Date().toISOString(), tracks, packs };
  writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog, null, 1));
  writeFileSync(join(OUT, 'ATTRIBUTION.md'), attribution(catalog));
  console.log(report.join('\n'));
  console.log(`\nPublished ${tracks.length} track(s), ${packs.length} pack(s) to ${OUT}`);
}

/** TASL attribution (Title, Author, Source, Licence) + modification notice, per CC best practice. */
function attribution(c: Catalog): string {
  const rows = c.tracks.map((t) => `| "${t.title}" | ${t.recordist} | [${t.source}](${t.sourceUrl}) | [${t.license}](${t.licenseUrl}) | ${t.modified} | ${t.curation.curator} (${t.curation.role}), ${t.curation.date} |`);
  return `# Recording credits\n\nEvery track below was reviewed against the Kicau Coach content standard v${c.standardVersion} and approved by the named curator.\n\n| Title | Author | Source | Licence | Modifications | Curated by |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
}

main();
