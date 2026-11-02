/** GBIF Backbone taxonomy check (T1), cached on disk. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getJson } from './sources';

export interface GbifMatch {
  matchType: string;
  status: string;
  usageKey?: number;
  acceptedName?: string;
}

export async function gbifMatch(sci: string, cacheFile: string): Promise<GbifMatch> {
  const cache: Record<string, GbifMatch> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  if (cache[sci]) return cache[sci];
  const d = (await getJson(`https://api.gbif.org/v1/species/match?${new URLSearchParams({ name: sci, class: 'Aves', strict: 'true' })}`)) as Record<string, unknown>;
  const m: GbifMatch = { matchType: String(d.matchType), status: String(d.status), usageKey: d.usageKey as number, acceptedName: (d.species ?? d.canonicalName) as string };
  cache[sci] = m;
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  return m;
}

/** Accepted, or a synonym the registry explicitly documents (e.g. a recent split GBIF still lumps). */
export function taxonomyAccepted(m: GbifMatch, documentedSynonymOf?: string): boolean {
  if (m.matchType !== 'EXACT') return false;
  if (m.status === 'ACCEPTED') return true;
  return m.status === 'SYNONYM' && !!documentedSynonymOf && m.acceptedName === documentedSynonymOf;
}
