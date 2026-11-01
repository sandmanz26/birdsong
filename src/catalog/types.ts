/** Published masteran catalogue: produced by scripts/publish-catalog.ts, consumed by the app.
 * Every track here passed the content standard and was approved by a named expert. */

export interface CatalogIsian {
  id: string;
  /** Community name given by the curator. */
  nameId: string;
  nameEn: string;
  startSec: number;
  endSec: number;
}

export interface CatalogTrack {
  id: string;
  /** content/species.json id */
  species: string;
  role: 'master' | 'isian';
  nameId: string;
  nameEn: string;
  sci: string;
  /** Path relative to the catalogue folder. */
  file: string;
  bytes: number;
  durationSec: number;
  /** TASL attribution. */
  title: string;
  recordist: string;
  source: 'xeno-canto' | 'wikimedia-commons';
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  country?: string;
  /** Modification notice (CC best practice). */
  modified: string;
  curation: { curator: string; role: string; date: string; standardVersion: number; notes?: string };
  isian: CatalogIsian[];
}

export interface CatalogPack {
  id: string;
  /** App Species ids this pack is recommended for. */
  target: string[];
  nameId: string;
  nameEn: string;
  descId: string;
  descEn: string;
  preset: 'pagi' | 'malam' | 'pagiMalam';
  trackIds: string[];
  /** Species in the pack definition still awaiting approved material. */
  missingSpecies: string[];
}

export interface Catalog {
  version: number;
  standardVersion: number;
  generatedAt: string;
  tracks: CatalogTrack[];
  packs: CatalogPack[];
}
