/**
 * Curated catalogue client. Packs are "installed" by downloading their audio once into IndexedDB, so
 * masteran keeps working offline. Catalogue ids map to stable app ids ('cat:<id>'), which makes
 * installs idempotent and lets several birds share the same downloaded tracks.
 */
import { ensureTemplates, MIN_MATERIAL_DAYS, PRESETS, getProgram } from '../actions';
import { db, logEvent } from '../db';
import type { Isian, Program, Species, Track } from '../types';
import { daysBetween, uid } from '../util';
import type { Catalog, CatalogPack, CatalogTrack } from './types';

const BASE = './catalog/';
const DEFAULT_ISIAN_PER_SPECIES = 2;
let cached: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  if (!cached) {
    cached = fetch(BASE + 'catalog.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`catalog ${r.status}`);
        return r.json() as Promise<Catalog>;
      })
      .catch((e) => {
        cached = null;
        throw e;
      });
  }
  return cached;
}

export const appTrackId = (catalogId: string) => `cat:${catalogId}`;
export const appIsianId = (catalogIsianId: string) => `cat:${catalogIsianId}`;
export const audioUrl = (t: CatalogTrack) => BASE + t.file;

/** Packs for a species: recommended ones first; packs without any cleared track are flagged. */
export function packsFor(catalog: Catalog, species: Species) {
  const usable = (p: CatalogPack) => p.trackIds.length > 0;
  const recommended = catalog.packs.filter((p) => p.target.includes(species));
  const others = catalog.packs.filter((p) => !p.target.includes(species));
  return { recommended, others, usable };
}

export async function isInstalled(t: CatalogTrack): Promise<boolean> {
  return !!(await db.get('tracks', appTrackId(t.id))) && !!(await db.getBlob('track:' + appTrackId(t.id)));
}

/** Download one catalogue track (+ its pre-marked isian) into local storage. Idempotent. */
export async function installTrack(t: CatalogTrack): Promise<Track> {
  const id = appTrackId(t.id);
  const existing = await db.get('tracks', id);
  if (existing && (await db.getBlob('track:' + id))) return existing;
  const res = await fetch(audioUrl(t));
  if (!res.ok) throw new Error(`audio ${res.status}`);
  const blob = await res.blob();
  const track: Track = {
    id,
    name: t.nameId,
    durationSec: t.durationSec,
    mime: blob.type || 'audio/mpeg',
    size: blob.size,
    source: 'catalog',
    catalogId: t.id,
    species: t.species,
    role: t.role,
    attribution: `${t.recordist} · ${t.license}`,
    license: t.license,
    licenseUrl: t.licenseUrl,
    sourceUrl: t.sourceUrl,
    createdAt: Date.now(),
  };
  await db.putBlob('track:' + id, blob);
  await db.put('tracks', track);
  const isianList: Isian[] = t.isian.map((m, i) => ({
    id: appIsianId(m.id), trackId: id, name: m.nameId, startSec: m.startSec, endSec: m.endSec, createdAt: track.createdAt + i, cohort: m.cohort,
  }));
  for (const isian of isianList) await db.put('isian', isian);
  // Precompute matching templates now, so isian checks never have to decode tutor audio.
  await ensureTemplates(isianList);
  logEvent('catalog_track_installed', { track: t.id, bytes: blob.size });
  return track;
}

export interface ApplyResult {
  program: Program;
  /** Days since the previous material was set, if it had been in use (for the 2–4 week warning). */
  replacedAfterDays: number | null;
}

/** Days the bird's current material has been in use, or null if it hasn't been played yet. */
export async function materialInUseDays(birdId: string): Promise<number | null> {
  const program = await getProgram(birdId);
  if (program.trackIds.length === 0) return null;
  const sessions = await db.byBird('sessions', birdId);
  if (!sessions.some((s) => s.startedAt >= program.materialChangedAt)) return null;
  return daysBetween(program.materialChangedAt, Date.now());
}

/**
 * Apply a pack to a bird: download its tracks, then set the program's material, isian targets and
 * the pack's default schedule (only if the bird still has the default/empty schedule).
 */
export async function applyPack(birdId: string, pack: CatalogPack, catalog: Catalog, onProgress?: (done: number, total: number) => void): Promise<ApplyResult> {
  const tracks = pack.trackIds.map((id) => catalog.tracks.find((t) => t.id === id)).filter((t): t is CatalogTrack => !!t);
  let done = 0;
  onProgress?.(0, tracks.length);
  for (const t of tracks) {
    await installTrack(t);
    onProgress?.(++done, tracks.length);
  }
  const before = await getProgram(birdId);
  const replacedAfterDays = await materialInUseDays(birdId);
  const program: Program = {
    ...before,
    packId: pack.id,
    trackIds: tracks.map((t) => appTrackId(t.id)),
    // Focused default targets: up to 2 isian per species (the curator orders them), not every marker.
    isianIds: [...new Set(tracks.map((t) => t.species))].flatMap((sp) =>
      tracks.filter((t) => t.species === sp).flatMap((t) => t.isian.map((m) => appIsianId(m.id))).slice(0, DEFAULT_ISIAN_PER_SPECIES),
    ),
    sessions: before.packId ? before.sessions : PRESETS[pack.preset].map((s) => ({ ...s, id: uid() })),
    materialChangedAt: Date.now(),
  };
  await db.put('programs', program);
  logEvent('pack_applied', { pack: pack.id, tracks: tracks.length, replacedAfterDays, warned: replacedAfterDays !== null && replacedAfterDays < MIN_MATERIAL_DAYS });
  return { program, replacedAfterDays };
}

export const packSeconds = (pack: CatalogPack, catalog: Catalog) =>
  pack.trackIds.reduce((s, id) => s + (catalog.tracks.find((t) => t.id === id)?.durationSec ?? 0), 0);
export const packMegabytes = (pack: CatalogPack, catalog: Catalog) =>
  pack.trackIds.reduce((s, id) => s + (catalog.tracks.find((t) => t.id === id)?.bytes ?? 0), 0) / 1e6;
