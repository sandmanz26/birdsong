import type { CheckStatus, Measurements } from './standard';

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
  source: 'xeno-canto' | 'wikimedia-commons';
  sourceUrl: string;
  /** Original recording title (TASL "title"). */
  title: string;
  country?: string;
  /** Which part of the original was used (for the modification notice). */
  sourceWindow: { startSec: number; lengthSec: number };
  measurements: Measurements;
  auto: Record<string, { status: CheckStatus; value: string }>;
  /** Auto-proposed isian markers; names are given by the expert. */
  isian: { id: string; nameId: string; nameEn: string; startSec: number; endSec: number; repeats: number }[];
}

export interface CandidateFile {
  standardVersion: number;
  generatedAt: string;
  candidates: Candidate[];
}
