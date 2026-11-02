/**
 * Recording sources for the candidate builder. Parsers are pure (tested in tests/sources.test.ts);
 * network calls are thin wrappers.
 *
 * - iNaturalist (no key): community-verified ("research grade") observations with sounds; licence is
 *   per SOUND, not per observation.
 * - xeno-canto API v3 (XC_API_KEY): the richest archive for SE-Asian birds, graded A–E.
 * - Wikimedia Commons (no key): sparse, but licence metadata is clean.
 *
 * Non-commercial (NC) recordings are never downloaded or processed. They are listed as permission
 * requests so the team can ask recordists for written permission (content/curation.json → permissions).
 */
import { classifyLicense } from './license';

export interface SpeciesDef {
  id: string;
  sci: string;
  nameId: string;
  nameEn: string;
  roles: ('master' | 'isian')[];
  types: string[];
  country: string[];
  /** Extra names to search (e.g. split taxa an archive still lumps). */
  searchNames?: string[];
}

export interface SourceRecord {
  key: string; // 'inat:<soundId>' | 'xc:<id>' | 'commons:File:…'
  source: 'inaturalist' | 'xeno-canto' | 'wikimedia-commons';
  downloadUrl: string;
  sourceUrl: string;
  title: string;
  recordist: string;
  license: string;
  licenseUrl: string;
  /** Usable under the commercial policy without extra permission. */
  licenseAllowed: boolean;
  /** NC (not ND): usable only with documented written permission. */
  permissionPossible: boolean;
  quality: string; // A..E or '?'
  lengthSec: number;
  country: string;
  type: string;
  /** Other species listed; null if the source does not record this. */
  background: number | null;
  /** Taxon name as the source identifies it. */
  sourceTaxon: string;
  /** iNaturalist research grade; null for sources without community ID. */
  communityVerified: boolean | null;
}

const COUNTRY_CODES: Record<string, string> = {
  ID: 'Indonesia', MY: 'Malaysia', SG: 'Singapore', TH: 'Thailand', BN: 'Brunei', VN: 'Vietnam', PH: 'Philippines',
  KH: 'Cambodia', LA: 'Laos', MM: 'Myanmar', IN: 'India', LK: 'Sri Lanka', TW: 'Taiwan', CN: 'China', HK: 'Hong Kong',
  JP: 'Japan', US: 'United States', AU: 'Australia', BD: 'Bangladesh', NP: 'Nepal',
};

/** Country from an iNaturalist place_guess like "Bogor, Jawa Barat, Indonesia" or "…, TW". */
export function countryFromPlace(placeGuess: string | null | undefined): string {
  if (!placeGuess) return '';
  const last = placeGuess.split(',').map((x) => x.trim()).filter(Boolean).pop() ?? '';
  if (/^[A-Z]{2}$/.test(last)) return COUNTRY_CODES[last] ?? last;
  return Object.values(COUNTRY_CODES).find((c) => last.toLowerCase().includes(c.toLowerCase())) ?? last;
}

const INAT_LICENSE_URL: Record<string, string> = {
  cc0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'cc-by': 'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'cc-by-nc': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'cc-by-nc-sa': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'cc-by-nd': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'cc-by-nc-nd': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
};

export interface INatObservation {
  id: number;
  quality_grade: string;
  place_guess?: string | null;
  observed_on?: string | null;
  uri?: string;
  user?: { login?: string; name?: string | null };
  taxon?: { name?: string };
  sounds?: { id: number; license_code: string | null; attribution?: string; file_url?: string; hidden?: boolean }[];
}

/** One SourceRecord per licensed, visible sound of an observation. */
export function parseINatObservation(o: INatObservation): SourceRecord[] {
  const out: SourceRecord[] = [];
  for (const s of o.sounds ?? []) {
    if (!s.license_code || s.hidden || !s.file_url) continue; // all-rights-reserved or hidden
    const lic = classifyLicense(INAT_LICENSE_URL[s.license_code] ?? s.license_code, 'commercial');
    const isNc = /nc/.test(s.license_code) && !/nd/.test(s.license_code);
    out.push({
      key: `inat:${s.id}`,
      source: 'inaturalist',
      downloadUrl: s.file_url,
      sourceUrl: o.uri ?? `https://www.inaturalist.org/observations/${o.id}`,
      title: `iNaturalist observation ${o.id}, sound ${s.id}${o.observed_on ? ` (${o.observed_on})` : ''}`,
      recordist: o.user?.name || o.user?.login || (s.attribution ?? '').replace(/^\(c\)\s*/i, '').replace(/,.*$/, ''),
      license: lic.short,
      licenseUrl: lic.url,
      licenseAllowed: lic.allowed,
      permissionPossible: !lic.allowed && isNc,
      quality: '?',
      lengthSec: 0,
      country: countryFromPlace(o.place_guess),
      type: '',
      background: null,
      sourceTaxon: o.taxon?.name ?? '',
      communityVerified: o.quality_grade === 'research',
    });
  }
  return out;
}

const parseLength = (s: string) => s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);

export function parseXenoCanto(r: Record<string, unknown>): SourceRecord {
  const lic = classifyLicense(String(r.lic ?? ''), 'commercial');
  const licRaw = String(r.lic ?? '').toLowerCase();
  return {
    key: `xc:${r.id}`,
    source: 'xeno-canto',
    downloadUrl: String(r.file).startsWith('//') ? 'https:' + r.file : String(r.file),
    sourceUrl: `https://xeno-canto.org/${r.id}`,
    title: `XC${r.id}`,
    recordist: String(r.rec ?? ''),
    license: lic.short,
    licenseUrl: lic.url,
    licenseAllowed: lic.allowed,
    permissionPossible: !lic.allowed && licRaw.includes('-nc') && !licRaw.includes('-nd'),
    quality: String(r.q ?? '?'),
    lengthSec: parseLength(String(r.length ?? '0')),
    country: String(r.cnt ?? ''),
    type: String(r.type ?? ''),
    background: Array.isArray(r.also) ? (r.also as string[]).filter(Boolean).length : 0,
    sourceTaxon: `${r.gen ?? ''} ${r.sp ?? ''}`.trim(),
    communityVerified: null,
  };
}

/** Does the source's taxon refer to the registry species (or one of its documented search names)? */
export function taxonMatches(sp: SpeciesDef, sourceTaxon: string): boolean {
  if (!sourceTaxon) return true; // Commons: identification is the uploader's file name, checked by expert (H1)
  const names = [sp.sci, ...(sp.searchNames ?? [])].map((n) => n.toLowerCase());
  const t = sourceTaxon.toLowerCase();
  // Accept the species itself or one of its subspecies (trinomial starting with the binomial).
  return names.some((n) => t === n || t.startsWith(n + ' '));
}

// ----------------------------------------------------------------------------------------------------
// Network wrappers
// ----------------------------------------------------------------------------------------------------

const UA = 'KicauCoachCatalogBot/0.2 (https://github.com/sandmanz26/birdsong)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url.replace(/key=[^&]+/, 'key=***')}`);
    return res.json();
  }
  throw new Error(`gave up: ${url.replace(/key=[^&]+/, 'key=***')}`);
}

/** iNaturalist: research-grade observations with sounds; commercial + NC licences (NC → permission list). */
export async function inaturalist(sp: SpeciesDef): Promise<SourceRecord[]> {
  const out: SourceRecord[] = [];
  for (const name of [sp.sci, ...(sp.searchNames ?? [])]) {
    const params = new URLSearchParams({
      taxon_name: name, sounds: 'true', quality_grade: 'research', per_page: '100', order_by: 'votes',
      sound_license: 'cc0,cc-by,cc-by-sa,cc-by-nc,cc-by-nc-sa',
    });
    const d = (await getJson(`https://api.inaturalist.org/v1/observations?${params}`)) as { results?: INatObservation[] };
    for (const o of d.results ?? []) out.push(...parseINatObservation(o));
    await sleep(1100); // iNaturalist asks for ≤ 1 request/second
  }
  return out;
}

export async function xenoCanto(sp: SpeciesDef, key: string | undefined): Promise<SourceRecord[]> {
  if (!key) return [];
  const out: SourceRecord[] = [];
  for (const name of [sp.sci, ...(sp.searchNames ?? [])]) {
    const [gen, spp] = name.toLowerCase().split(' ');
    for (const q of ['A', 'B']) {
      const url = `https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(`gen:${gen} sp:${spp} q:${q}`)}&per_page=200&key=${key}`;
      const data = (await getJson(url)) as { recordings?: Record<string, unknown>[] };
      out.push(...(data.recordings ?? []).map(parseXenoCanto));
      await sleep(1000);
    }
  }
  return out;
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export async function commons(sp: SpeciesDef): Promise<SourceRecord[]> {
  const search = new URLSearchParams({ action: 'query', list: 'search', srsearch: `"${sp.sci}" filetype:audio`, srnamespace: '6', srlimit: '30', format: 'json', maxlag: '5' });
  const s = (await getJson(`https://commons.wikimedia.org/w/api.php?${search}`)) as { query?: { search: { title: string }[] } };
  const titles = (s.query?.search ?? []).map((x) => x.title);
  if (titles.length === 0) return [];
  await sleep(3000);
  const info = new URLSearchParams({ action: 'query', titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|mediatype|size', format: 'json', maxlag: '5' });
  const d = (await getJson(`https://commons.wikimedia.org/w/api.php?${info}`)) as { query?: { pages: Record<string, { title: string; imageinfo?: { url: string; descriptionurl: string; mediatype: string; duration?: number; extmetadata: Record<string, { value: string }> }[] }> } };
  const out: SourceRecord[] = [];
  for (const page of Object.values(d.query?.pages ?? {})) {
    const ii = page.imageinfo?.[0];
    if (!ii || ii.mediatype !== 'AUDIO') continue;
    const m = ii.extmetadata;
    const raw = m.LicenseUrl?.value || m.LicenseShortName?.value || '';
    const lic = classifyLicense(raw, 'commercial');
    out.push({
      key: `commons:${page.title}`,
      source: 'wikimedia-commons',
      downloadUrl: ii.url,
      sourceUrl: ii.descriptionurl,
      title: page.title.replace(/^File:/, ''),
      recordist: stripHtml(m.Artist?.value ?? 'Unknown'),
      license: lic.short,
      licenseUrl: lic.url,
      licenseAllowed: lic.allowed,
      permissionPossible: false,
      quality: '?',
      lengthSec: ii.duration ?? 0,
      country: '',
      type: stripHtml(m.ImageDescription?.value ?? '').toLowerCase().includes('song') ? 'song' : '',
      background: null,
      sourceTaxon: '',
      communityVerified: null,
    });
  }
  return out;
}

/** xeno-canto catalogue number embedded in a title (Commons often mirrors XC recordings). */
export const xcNumber = (r: SourceRecord): string | null => (r.source === 'xeno-canto' ? r.key.slice(3) : /XC\s?(\d{4,7})/i.exec(r.title)?.[1] ?? null);
