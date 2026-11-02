/**
 * Kicau Coach content standard v1 (docs/06-curation-standard.md).
 *
 * A track can only be published when every AUTO check passes and a named expert has signed every HUMAN
 * check. "Needs human" auto checks (e.g. unknown recording grade on Commons) must be covered by the
 * corresponding human check. Nothing is published on automation alone.
 */

export const STANDARD_VERSION = 2;

export type CheckStatus = 'pass' | 'fail' | 'human';

export interface Measurements {
  /** Licence classification (scripts/license.ts) under the commercial policy, OR a documented written
   * permission from the rights holder (content/curation.json → permissions). */
  licenseAllowed: boolean;
  /** Registry name is accepted (or a documented synonym) in the GBIF Backbone, and the source's own
   * taxon matches it. null = could not be checked. */
  taxonomyOk: boolean | null;
  /** Species ID independently verified by the source community (iNaturalist "research grade"). null = not applicable. */
  communityVerified: boolean | null;
  attribution: { title: string; author: string; sourceUrl: string; licenseUrl: string };
  /** Seconds of processed material. */
  durationSec: number;
  integratedLufs: number;
  truePeakDbtp: number;
  /** Typical singing level above background (dB, app analyser). */
  snrDb: number;
  /** % of time with song. */
  kerjaPct: number;
  /** Fraction of source samples at full scale. */
  clippedFraction: number;
  sourceSampleRate: number;
  /** Archive grade (xeno-canto A–E) or '?' if the archive has none. */
  sourceGrade: string;
  /** Other species listed by the recordist; null if the archive doesn't record this. */
  backgroundSpecies: number | null;
  country: string;
  preferredCountries: string[];
  isianCount: number;
}

export const LIMITS = {
  /** Per clip (one complete song bout; iNaturalist clips have a median of ~15 s). A species needs
   * ≥ minSpeciesSec of approved material in total (check P1, at publish). */
  minDurationSec: 8,
  minSpeciesSec: 45,
  lufsTarget: -20,
  /** Accepted band: −23 … −18.5 LUFS. Peaky calls (high crest factor) may sit up to 3 LU below target
   * rather than being limited hard; this matches the planner's own 0…−3 dB per-play level variation. */
  lufsMin: -23,
  lufsMax: -18.5,
  maxTruePeakDbtp: -1,
  minSnrDb: 25,
  minKerjaPct: 20,
  maxClippedFraction: 1e-4,
  minSampleRate: 32000,
};

export interface CheckDef {
  id: string;
  kind: 'auto' | 'human';
  titleId: string;
  titleEn: string;
  basis: string;
}

/** Ordered list shown to curators and in the docs. */
export const CHECKS: CheckDef[] = [
  { id: 'L1', kind: 'auto', titleId: 'Lisensi boleh komersial & turunan (CC0 / CC BY / CC BY-SA) atau izin tertulis perekam', titleEn: 'Licence allows commercial use and derivatives (CC0 / CC BY / CC BY-SA) or written permission', basis: 'Creative Commons licence terms; documented permission' },
  { id: 'T1', kind: 'auto', titleId: 'Nama ilmiah sah (GBIF Backbone) dan taksa sumber cocok', titleEn: 'Scientific name accepted (GBIF Backbone) and source taxon matches', basis: 'GBIF Backbone Taxonomy; AviList' },
  { id: 'L2', kind: 'auto', titleId: 'Atribusi lengkap (judul, perekam, sumber, lisensi)', titleEn: 'Complete attribution (title, author, source, licence)', basis: 'CC best practice: TASL' },
  { id: 'A1', kind: 'auto', titleId: `Durasi klip ≥ ${LIMITS.minDurationSec} dtk (total per jenis ≥ ${LIMITS.minSpeciesSec} dtk)`, titleEn: `Clip ≥ ${LIMITS.minDurationSec} s (species total ≥ ${LIMITS.minSpeciesSec} s)`, basis: 'Enough variety for a masteran session' },
  { id: 'A2', kind: 'auto', titleId: `Loudness ${LIMITS.lufsMin} … ${LIMITS.lufsMax} LUFS, true peak ≤ ${LIMITS.maxTruePeakDbtp} dBTP`, titleEn: `Loudness ${LIMITS.lufsMin} … ${LIMITS.lufsMax} LUFS, true peak ≤ ${LIMITS.maxTruePeakDbtp} dBTP`, basis: 'ITU-R BS.1770 / EBU R128 measurement' },
  { id: 'A3', kind: 'auto', titleId: `Suara burung ≥ ${LIMITS.minSnrDb} dB di atas latar`, titleEn: `Bird ≥ ${LIMITS.minSnrDb} dB above background`, basis: 'Clean recording ("jernih, tanpa noise")' },
  { id: 'A4', kind: 'auto', titleId: `Burung aktif bunyi ≥ ${LIMITS.minKerjaPct}% waktu`, titleEn: `Bird singing ≥ ${LIMITS.minKerjaPct}% of the time`, basis: 'Active ("gacor") material' },
  { id: 'A5', kind: 'auto', titleId: 'Tanpa clipping (distorsi)', titleEn: 'No clipping (distortion)', basis: 'Distortion is copied by learning birds' },
  { id: 'A6', kind: 'auto', titleId: `Sumber ≥ ${LIMITS.minSampleRate / 1000} kHz (rentang frekuensi penuh)`, titleEn: `Source ≥ ${LIMITS.minSampleRate / 1000} kHz sample rate (full bandwidth)`, basis: 'Songbird hearing/song up to ~10 kHz' },
  { id: 'M1', kind: 'auto', titleId: 'Nilai arsip "A" (rekaman jernih, tanpa spesies/kebisingan lain)', titleEn: 'Archive grade "A" (loud & clear, no other species or noise)', basis: 'xeno-canto quality scale' },
  { id: 'M2', kind: 'auto', titleId: 'Tidak ada spesies latar tercatat', titleEn: 'No background species listed', basis: 'Single focal species' },
  { id: 'M4', kind: 'auto', titleId: 'Identifikasi jenis diverifikasi komunitas (research grade)', titleEn: 'Species ID verified by the source community (research grade)', basis: 'iNaturalist community identification' },
  { id: 'M3', kind: 'auto', titleId: 'Asal rekaman sesuai wilayah/dialek yang diinginkan', titleEn: 'Recording region matches the preferred region/dialect', basis: 'Local dialects matter (e.g. murai Sumatra)' },
  { id: 'H1', kind: 'human', titleId: 'Jenis burung benar (sesuai label & nama ilmiah)', titleEn: 'Correct species (matches label and scientific name)', basis: 'Expert ear; Burung Indonesia / AviList taxonomy' },
  { id: 'H2', kind: 'human', titleId: 'Hanya satu jenis burung terdengar', titleEn: 'Only the focal species is audible', basis: 'Expert ear' },
  { id: 'H3', kind: 'human', titleId: 'Tanpa suara manusia, musik, kendaraan, angin, atau gangguan lain', titleEn: 'No human voice, music, vehicles, wind or handling noise', basis: 'Expert ear' },
  { id: 'H4', kind: 'human', titleId: 'Layak sebagai masteran (burung gacor, materi bernilai lomba)', titleEn: 'Suitable as masteran (actively singing, contest-worthy material)', basis: 'Contest judge / senior trainer' },
  { id: 'H5', kind: 'human', titleId: 'Dialek/wilayah dapat diterima untuk burung target', titleEn: 'Dialect/region acceptable for the target birds', basis: 'Contest judge / senior trainer' },
  { id: 'H6', kind: 'human', titleId: 'Penanda isian tepat di frasa utuh & diberi nama komunitas', titleEn: 'Isian markers sit on complete phrases and have community names', basis: 'Contest judge / senior trainer' },
];

/** Auto checks that may be 'human' (unknown) are covered by these human checks. */
export const COVERED_BY: Record<string, string> = { M1: 'H3', M2: 'H2', M3: 'H5', M4: 'H1' };

export function autoChecks(m: Measurements): Record<string, { status: CheckStatus; value: string }> {
  const r: Record<string, { status: CheckStatus; value: string }> = {};
  const set = (id: string, ok: boolean | null, value: string) => (r[id] = { status: ok === null ? 'human' : ok ? 'pass' : 'fail', value });
  const a = m.attribution;
  set('L1', m.licenseAllowed, m.licenseAllowed ? 'allowed' : 'not allowed');
  set('T1', m.taxonomyOk, m.taxonomyOk === null ? 'not checked' : m.taxonomyOk ? 'accepted' : 'mismatch');
  set('M4', m.communityVerified, m.communityVerified === null ? 'n/a (expert confirms)' : m.communityVerified ? 'research grade' : 'not verified');
  set('L2', !!(a.title && a.author && a.sourceUrl && a.licenseUrl), [a.author || '∅ author', a.sourceUrl ? 'source' : '∅ source', a.licenseUrl ? 'licence' : '∅ licence'].join(' · '));
  set('A1', m.durationSec >= LIMITS.minDurationSec, `${m.durationSec.toFixed(1)} s`);
  set('A2', m.integratedLufs >= LIMITS.lufsMin && m.integratedLufs <= LIMITS.lufsMax && m.truePeakDbtp <= LIMITS.maxTruePeakDbtp, `${m.integratedLufs.toFixed(1)} LUFS · ${m.truePeakDbtp.toFixed(1)} dBTP`);
  set('A3', m.snrDb >= LIMITS.minSnrDb, `${m.snrDb} dB`);
  set('A4', m.kerjaPct >= LIMITS.minKerjaPct, `${m.kerjaPct}%`);
  set('A5', m.clippedFraction <= LIMITS.maxClippedFraction, `${(m.clippedFraction * 100).toFixed(3)}%`);
  set('A6', m.sourceSampleRate >= LIMITS.minSampleRate, `${m.sourceSampleRate} Hz`);
  set('M1', m.sourceGrade === '?' ? null : m.sourceGrade === 'A', m.sourceGrade === '?' ? 'no archive grade' : `grade ${m.sourceGrade}`);
  set('M2', m.backgroundSpecies === null ? null : m.backgroundSpecies === 0, m.backgroundSpecies === null ? 'not recorded' : `${m.backgroundSpecies} listed`);
  const regionOk = m.preferredCountries.length === 0 ? true : m.country ? m.preferredCountries.includes(m.country) : null;
  set('M3', regionOk, m.country || 'unknown');
  return r;
}

/** Hard automatic failures (never overridable by a curator). */
export const HARD_AUTO = ['L1', 'T1', 'L2', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'];

export interface Approval {
  decision: 'approve' | 'reject';
  curator: string;
  role: string;
  date: string;
  /** Human checks H1–H6 → true when the curator confirms them. */
  checks: Record<string, boolean>;
  /** Isian id → community names; isian not listed are dropped. */
  isian: Record<string, { nameId: string; nameEn: string }>;
  notes?: string;
}

/** P1: a species is published only with ≥ minSpeciesSec of approved material across its clips. */
export function speciesTotalOk(clipSeconds: number[]): boolean {
  return clipSeconds.reduce((a, b) => a + b, 0) >= LIMITS.minSpeciesSec;
}

/** Reasons a candidate cannot be published (empty = publishable). */
export function publishBlockers(auto: Record<string, { status: CheckStatus }>, approval: Approval | undefined): string[] {
  const out: string[] = [];
  for (const id of HARD_AUTO) if (auto[id]?.status !== 'pass') out.push(`${id} failed`);
  for (const [id, cover] of Object.entries(COVERED_BY)) {
    // A region mismatch or missing community ID can be accepted by the expert; a bad grade or listed
    // background species cannot.
    if (auto[id]?.status === 'fail' && id !== 'M3' && id !== 'M4') out.push(`${id} failed`);
    // Unknown (human) or region mismatch must be explicitly covered by the curator.
    if (auto[id]?.status !== 'pass' && !approval?.checks[cover]) out.push(`${id} needs ${cover} sign-off`);
  }
  if (!approval) return [...out, 'no expert approval'];
  if (approval.decision !== 'approve') return [...out, 'rejected by curator'];
  if (!approval.curator.trim() || !approval.role.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(approval.date)) out.push('approval missing curator/role/date');
  for (const c of CHECKS.filter((c) => c.kind === 'human')) if (!approval.checks[c.id]) out.push(`${c.id} not confirmed`);
  // A clip with no kept isian is still valid masteran material (played in sessions); it simply offers
  // no Cek Isian target. Every isian the curator keeps must carry community names.
  for (const [iid, n] of Object.entries(approval.isian)) if (!n.nameId.trim() || !n.nameEn.trim()) out.push(`isian ${iid} unnamed`);
  return [...new Set(out)];
}
