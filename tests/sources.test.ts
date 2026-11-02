import { describe, expect, it } from 'vitest';
import { countryFromPlace, parseINatObservation, parseXenoCanto, taxonMatches, xcNumber, type SpeciesDef } from '../scripts/sources';

const shama: SpeciesDef = { id: 'murai_batu', sci: 'Copsychus malabaricus', nameId: 'Murai batu', nameEn: 'White-rumped shama', roles: ['master'], types: [], country: ['Indonesia'] };

describe('iNaturalist parsing', () => {
  const obs = {
    id: 42,
    quality_grade: 'research',
    place_guess: 'Bogor, Jawa Barat, Indonesia',
    observed_on: '2026-05-01',
    user: { login: 'rec', name: 'A. Recordist' },
    taxon: { name: 'Copsychus malabaricus' },
    sounds: [
      { id: 1, license_code: 'cc-by', file_url: 'https://static.inaturalist.org/sounds/1.m4a' },
      { id: 2, license_code: 'cc-by-nc', file_url: 'https://static.inaturalist.org/sounds/2.m4a' },
      { id: 3, license_code: 'cc-by-nc-nd', file_url: 'https://static.inaturalist.org/sounds/3.m4a' },
      { id: 4, license_code: null, file_url: 'https://static.inaturalist.org/sounds/4.m4a' },
      { id: 5, license_code: 'cc0', file_url: 'https://static.inaturalist.org/sounds/5.m4a', hidden: true },
    ],
  };
  const recs = parseINatObservation(obs);

  it('uses the per-sound licence and skips all-rights-reserved or hidden sounds', () => {
    expect(recs.map((r) => r.key)).toEqual(['inat:1', 'inat:2', 'inat:3']);
  });

  it('marks commercial licences usable and NC (not ND) as permission-possible', () => {
    const [by, nc, ncnd] = recs;
    expect(by).toMatchObject({ licenseAllowed: true, permissionPossible: false, license: 'CC BY 4.0' });
    expect(nc).toMatchObject({ licenseAllowed: false, permissionPossible: true });
    expect(ncnd).toMatchObject({ licenseAllowed: false, permissionPossible: false });
  });

  it('keeps TASL attribution, community ID and country', () => {
    expect(recs[0]).toMatchObject({ recordist: 'A. Recordist', sourceUrl: 'https://www.inaturalist.org/observations/42', communityVerified: true, country: 'Indonesia', sourceTaxon: 'Copsychus malabaricus' });
    expect(recs[0].title).toContain('observation 42');
  });

  it('reads countries from names or ISO codes', () => {
    expect(countryFromPlace('臺灣島, 南區, 臺南市, TW')).toBe('Taiwan');
    expect(countryFromPlace('Kuala Lumpur, Malaysia')).toBe('Malaysia');
    expect(countryFromPlace(null)).toBe('');
  });
});

describe('xeno-canto parsing', () => {
  const r = parseXenoCanto({ id: '123456', gen: 'Copsychus', sp: 'malabaricus', rec: 'B', cnt: 'Indonesia', lic: '//creativecommons.org/licenses/by-nc-sa/4.0/', q: 'A', length: '1:05', also: ['Pycnonotus aurigaster'], type: 'song', file: '//xeno-canto.org/123456/download' });
  it('parses grade, length, background species and licence', () => {
    expect(r).toMatchObject({ key: 'xc:123456', quality: 'A', lengthSec: 65, background: 1, licenseAllowed: false, permissionPossible: true, downloadUrl: 'https://xeno-canto.org/123456/download' });
    expect(xcNumber(r)).toBe('123456');
  });
});

describe('taxon matching', () => {
  it('accepts the species and its subspecies, rejects other species', () => {
    expect(taxonMatches(shama, 'Copsychus malabaricus')).toBe(true);
    expect(taxonMatches(shama, 'Copsychus malabaricus tricolor')).toBe(true);
    expect(taxonMatches(shama, 'Copsychus saularis')).toBe(false);
    expect(taxonMatches(shama, 'Copsychus malabaricusx')).toBe(false);
  });
  it('detects xeno-canto mirrors on Commons by catalogue number', () => {
    expect(xcNumber({ source: 'wikimedia-commons', key: 'commons:File:X.ogg', title: 'Copsychus saularis - Oriental Magpie-Robin XC126472.ogg' } as never)).toBe('126472');
  });
});
