import { describe, expect, it } from 'vitest';
import registry from '../content/species.json';
import { generatePacks, packAvailable } from '../scripts/publish-catalog';
import { envelopeAlignment } from '../src/dsp/fingerprint';
import { searchSpecies, TARGET_SPECIES } from '../src/species';

const species = (registry as { species: { id: string; nameId: string; nameEn: string; roles: string[]; recommendedIsian?: string[]; sci: string }[] }).species;

describe('species registry', () => {
  it('has unique ids, binomial names and valid isian references', () => {
    const ids = new Set(species.map((s) => s.id));
    expect(ids.size).toBe(species.length);
    for (const s of species) {
      expect(s.sci).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
      for (const r of s.recommendedIsian ?? []) expect(ids.has(r)).toBe(true);
    }
  });

  it('covers far more birds than v1 (≥ 25 target species, ≥ 15 isian sources)', () => {
    expect(TARGET_SPECIES.length).toBeGreaterThanOrEqual(25);
    expect(species.filter((s) => s.roles.includes('isian')).length).toBeGreaterThanOrEqual(15);
  });

  it('finds species by local alias, name or scientific name', () => {
    expect(searchSpecies('pentet')[0].id).toBe('cendet');
    expect(searchSpecies('konin')[0].id).toBe('kolibri_ninja');
    expect(searchSpecies('Copsychus mal')[0].id).toBe('murai_batu');
    expect(searchSpecies('cucak rowo')[0].id).toBe('cucak_rawa');
  });
});

describe('pack generation', () => {
  const packs = generatePacks(species, [{ id: 'umum', target: ['other'], nameId: 'U', nameEn: 'U', descId: '', descEn: '', species: ['ciblek', 'kenari'], preset: 'pagi' }]);

  it('creates a basic pack for every target species plus extras', () => {
    expect(packs.filter((p) => p.id.endsWith('_dasar')).length).toBe(TARGET_SPECIES.length);
    const murai = packs.find((p) => p.id === 'murai_batu_dasar')!;
    expect(murai.species[0]).toBe('murai_batu');
    expect(murai.species).toContain('cililin');
    expect(packs.some((p) => p.id === 'umum')).toBe(true);
  });

  it("offers a target pack only with the bird's own master song and at least one isian", () => {
    const murai = packs.find((p) => p.id === 'murai_batu_dasar')!;
    expect(packAvailable(murai, new Set(['cililin', 'ciblek']))).toBe(false);
    expect(packAvailable(murai, new Set(['murai_batu']))).toBe(false);
    expect(packAvailable(murai, new Set(['murai_batu', 'ciblek']))).toBe(true);
    const cucakRawa = packs.find((p) => p.id === 'cucak_rawa_dasar')!; // master-only by design
    expect(packAvailable(cucakRawa, new Set(['cucak_rawa']))).toBe(true);
    const umum = packs.find((p) => p.id === 'umum')!;
    expect(packAvailable(umum, new Set(['ciblek']))).toBe(false);
    expect(packAvailable(umum, new Set(['ciblek', 'kenari']))).toBe(true);
  });
});

describe('duplicate detection', () => {
  it('aligns a crop of the same envelope, not a different one', () => {
    const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const r1 = rnd(7);
    const a = Array.from({ length: 1500 }, r1);
    const crop = a.slice(300, 1200).map((x) => x + 0.05 * Math.sin(x * 50));
    const r2 = rnd(99);
    const other = Array.from({ length: 900 }, r2);
    expect(envelopeAlignment(a, crop)).toBeGreaterThan(0.95);
    expect(envelopeAlignment(a, other)).toBeLessThan(0.5);
  });
});

describe('calibration metrics', () => {
  it('computes AUC and acceptance at a fixed false-match rate', async () => {
    const { auc, atFpr } = await import('../scripts/calibrate');
    expect(auc([3, 4], [1, 2])).toBe(1);
    expect(auc([1], [1])).toBe(0.5);
    const imp = Array.from({ length: 100 }, (_, i) => i / 100); // scores 0.00 … 0.99
    const p = atFpr([0.97, 0.5, 0.2], imp, 0.05);
    expect(p.threshold).toBeCloseTo(0.95, 5); // 5 impostors (0.95–0.99) at or above
    expect(p.tpr).toBeCloseTo(1 / 3, 5);
  });
});
