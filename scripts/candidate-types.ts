import type { SourceRecord } from './sources';
import type { CheckStatus, Measurements } from './standard';

/** Written permission from a rights holder for a non-commercial recording (curation.json → permissions). */
export interface Permission {
  grantedBy: string;
  date: string;
  scope: string;
  /** Where the written permission is stored (e-mail id, document link). */
  evidence: string;
}

/** A processed recording awaiting expert review (review/candidates/candidates.json). */
export interface Candidate {
  id: string;
  /** Source key, e.g. 'xc:123456' or 'commons:File:X.ogg'. */
  key: string;
  species: string;
  role: 'master' | 'isian';
  nameId: string;
  nameEn: string;
  sci: string;
  file: string;
  bytes: number;
  durationSec: number;
  license: string;
  licenseUrl: string;
  recordist: string;
  source: SourceRecord['source'];
  sourceUrl: string;
  /** Original recording title (TASL "title"). */
  title: string;
  country?: string;
  /** Which part of the original was used (for the modification notice). */
  sourceWindow: { startSec: number; lengthSec: number };
  /** Taxon as identified by the source. */
  sourceTaxon: string;
  permission?: Permission;
  /** Coarse spectral fingerprint used for duplicate detection. */
  fingerprint: number[];
  measurements: Measurements;
  auto: Record<string, { status: CheckStatus; value: string }>;
  /** Auto-proposed isian markers; names are given by the expert. */
  isian: { id: string; nameId: string; nameEn: string; startSec: number; endSec: number; repeats: number }[];
}

export interface CandidateFile {
  standardVersion: number;
  generatedAt: string;
  candidates: Candidate[];
  coverage?: { id: string; name: string; roles: string; taxonomy: string; found: number; usable: number; permissionPossible: number; duplicates: number; processed: number; autoPass: number; autoPassSec: number; preferredRegionSec?: number }[];
  permissionRequests?: { species: string; rec: SourceRecord }[];
}
