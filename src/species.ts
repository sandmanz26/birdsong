/**
 * Species registry (content/species.json) as used by the app: one source of truth shared with the
 * content pipeline, so adding a species is a data change, not a code change.
 */
import registry from '../content/species.json';
import type { Lang } from './i18n';

export interface LegalInfo {
  status: 'protected' | 'delisted_2018' | 'permit_reported';
  source: string;
}

export interface SpeciesInfo {
  id: string;
  sci: string;
  nameId: string;
  nameEn: string;
  roles: ('master' | 'isian')[];
  aliases: string[];
  group: string;
  recommendedIsian?: string[];
  legal?: LegalInfo;
  conservation?: string;
  taxonNote?: string;
}

export const OTHER_SPECIES = 'other';

export const SPECIES: SpeciesInfo[] = (registry as { species: SpeciesInfo[] }).species;
const byId = new Map(SPECIES.map((s) => [s.id, s]));

export const getSpecies = (id: string): SpeciesInfo | undefined => byId.get(id);

export function speciesName(id: string, lang: Lang): string {
  const s = byId.get(id);
  if (!s) return lang === 'id' ? 'Jenis lain' : 'Other species';
  return lang === 'id' ? s.nameId : s.nameEn;
}

/** Birds an owner can keep and train (have a master song): the choices in the bird form. */
export const TARGET_SPECIES = SPECIES.filter((s) => s.roles.includes('master')).sort((a, b) => a.nameId.localeCompare(b.nameId));

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Search by Indonesian/English name, scientific name or local alias (e.g. "pentet" → cendet). */
export function searchSpecies(query: string, list = TARGET_SPECIES): SpeciesInfo[] {
  const q = norm(query);
  if (!q) return list;
  const score = (s: SpeciesInfo) => {
    const names = [s.nameId, s.nameEn, s.sci, ...s.aliases].map(norm);
    if (names.some((n) => n === q)) return 3;
    if (names.some((n) => n.startsWith(q))) return 2;
    if (names.some((n) => n.includes(q))) return 1;
    return 0;
  };
  return list.map((s) => [s, score(s)] as const).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
