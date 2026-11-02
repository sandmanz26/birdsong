/**
 * Licence policy for the curated catalogue.
 * - commercial: CC0, CC BY, CC BY-SA (safe for a paid product; BY-SA tracks are redistributed under BY-SA).
 * - beta: also CC BY-NC / BY-NC-SA (free beta only).
 * - Never ND: trimming + loudness normalisation is a derivative work.
 */
/** Normalise a licence URL or short name → { short, url, allowed }. */
export function classifyLicense(raw: string, policy: 'commercial' | 'beta'): { short: string; url: string; allowed: boolean } {
  const s = raw.toLowerCase();
  const version = /(\d\.\d)/.exec(s)?.[1] ?? '';
  let short = 'unknown';
  if (/publicdomain|cc0|public domain|pd-/.test(s)) short = 'CC0';
  else if (/by-nc-nd|by nc nd/.test(s)) short = 'CC BY-NC-ND';
  else if (/by-nc-sa|by nc sa/.test(s)) short = 'CC BY-NC-SA';
  else if (/by-nc|by nc/.test(s)) short = 'CC BY-NC';
  else if (/by-nd|by nd/.test(s)) short = 'CC BY-ND';
  else if (/by-sa|by sa/.test(s)) short = 'CC BY-SA';
  else if (/\bby\b|\/by\//.test(s) || /cc-by|cc by/.test(s)) short = 'CC BY';
  const full = short === 'CC0' || short === 'unknown' ? short : `${short} ${version}`.trim();
  const slug = short.replace('CC ', '').toLowerCase();
  const url = raw.startsWith('//') ? 'https:' + raw : raw.startsWith('http') ? raw : short === 'CC0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : `https://creativecommons.org/licenses/${slug}/${version || '4.0'}/`;
  const commercialOk = ['CC0', 'CC BY', 'CC BY-SA'].includes(short);
  const betaOk = commercialOk || ['CC BY-NC', 'CC BY-NC-SA'].includes(short);
  return { short: full, url, allowed: policy === 'commercial' ? commercialOk : betaOk };
}

