/** Curated masteran catalogue: produced by scripts/build-catalog.ts, consumed by the app. */

export interface CatalogIsian {
  id: string;
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
  license: string;
  licenseUrl: string;
  recordist: string;
  source: 'xeno-canto' | 'wikimedia-commons';
  sourceUrl: string;
  country?: string;
  /** 'auto' = passed automatic QC; 'approved' = also approved by an expert listener. */
  review: 'auto' | 'approved';
  qc: { snrDb: number; kerjaPct: number; phrases: number; variasi: number };
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
  /** Species in the pack definition that have no cleared track yet. */
  missingSpecies: string[];
}

export interface Catalog {
  version: number;
  generatedAt: string;
  licensePolicy: 'commercial' | 'beta';
  tracks: CatalogTrack[];
  packs: CatalogPack[];
}
