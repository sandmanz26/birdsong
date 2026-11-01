import { describe, expect, it } from 'vitest';
import { autoChecks, publishBlockers, type Approval, type Measurements } from '../scripts/standard';

const good: Measurements = {
  licenseAllowed: true,
  attribution: { title: 'XC123', author: 'A. Recordist', sourceUrl: 'https://xeno-canto.org/123', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  durationSec: 90,
  integratedLufs: -20.2,
  truePeakDbtp: -2,
  snrDb: 38,
  kerjaPct: 45,
  clippedFraction: 0,
  sourceSampleRate: 48000,
  sourceGrade: 'A',
  backgroundSpecies: 0,
  country: 'Indonesia',
  preferredCountries: ['Indonesia', 'Malaysia'],
  isianCount: 2,
};

const approval: Approval = {
  decision: 'approve',
  curator: 'Budi Santoso',
  role: 'Juri lomba',
  date: '2026-11-02',
  checks: { H1: true, H2: true, H3: true, H4: true, H5: true, H6: true },
  isian: { 'x-i1': { nameId: 'Cililin – cerecet', nameEn: 'Crested jay – chatter' } },
};

describe('content standard', () => {
  it('passes a clean, licensed, regional, A-grade recording', () => {
    const a = autoChecks(good);
    expect(Object.values(a).every((c) => c.status === 'pass')).toBe(true);
    expect(publishBlockers(a, approval)).toEqual([]);
  });

  it('never publishes on automation alone', () => {
    expect(publishBlockers(autoChecks(good), undefined)).toContain('no expert approval');
  });

  it('blocks hard technical/legal failures even with an approval', () => {
    for (const bad of [{ durationSec: 13 }, { licenseAllowed: false }, { snrDb: 12 }, { clippedFraction: 0.01 }, { integratedLufs: -30 }, { sourceSampleRate: 22050 }]) {
      const b = publishBlockers(autoChecks({ ...good, ...bad }), approval);
      expect(b.length).toBeGreaterThan(0);
    }
  });

  it('requires explicit expert sign-off for unknown grade, unknown background, or region mismatch', () => {
    const unknown = autoChecks({ ...good, sourceGrade: '?', backgroundSpecies: null, country: 'India' });
    expect(unknown.M1.status).toBe('human');
    expect(unknown.M3.status).toBe('fail');
    const noRegion = { ...approval, checks: { ...approval.checks, H5: false } };
    expect(publishBlockers(unknown, noRegion)).toEqual(expect.arrayContaining(['M3 needs H5 sign-off', 'H5 not confirmed']));
    expect(publishBlockers(unknown, approval)).toEqual([]);
  });

  it('rejects a B-grade or background-species recording outright', () => {
    expect(publishBlockers(autoChecks({ ...good, sourceGrade: 'B' }), approval)).toContain('M1 failed');
    expect(publishBlockers(autoChecks({ ...good, backgroundSpecies: 2 }), approval)).toContain('M2 failed');
  });

  it('requires a complete, signed approval with named isian', () => {
    const a = autoChecks(good);
    expect(publishBlockers(a, { ...approval, curator: '' })).toContain('approval missing curator/role/date');
    expect(publishBlockers(a, { ...approval, checks: { ...approval.checks, H4: false } })).toContain('H4 not confirmed');
    expect(publishBlockers(a, { ...approval, isian: {} })).toContain('no named isian');
    expect(publishBlockers(a, { ...approval, decision: 'reject' })).toContain('rejected by curator');
  });
});
