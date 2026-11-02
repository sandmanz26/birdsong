import type { AnalysisResult } from './dsp/analyze';

/** content/species.json id (or 'other'); data-driven so new species need no code change. */
export type Species = string;
/** trotolan = juvenile; muda = young; dewasa = adult; mabung = moulting */
export type Phase = 'trotolan' | 'muda' | 'dewasa' | 'mabung';
/** tangkaran = captive-bred (ideally ringed); tangkapan = wild-caught */
export type Origin = 'tangkaran' | 'tangkapan' | 'unknown';

export interface Bird {
  id: string;
  name: string;
  species: Species;
  phase: Phase;
  origin: Origin;
  ring?: string;
  hatchDate?: string;
  createdAt: number;
}

export interface Track {
  id: string;
  name: string;
  durationSec: number;
  mime: string;
  size: number;
  /** Masteran material only ever comes from the curated catalogue (no uploads, no synthetic audio). */
  source: 'catalog';
  catalogId?: string;
  species?: string;
  role?: 'master' | 'isian';
  attribution?: string;
  license?: string;
  licenseUrl?: string;
  sourceUrl?: string;
  createdAt: number;
}

export interface Isian {
  id: string;
  trackId: string;
  name: string;
  startSec: number;
  endSec: number;
  createdAt: number;
  /** Precomputed matching template (computed once at install / first use). */
  template?: { frames: number; dims: number; data: Float32Array };
  /** Cohort statistics from the catalogue (for cohort-normalised scoring). */
  cohort?: { mu: number; sd: number };
}

export interface SessionSlot {
  id: string;
  /** HH:MM local time */
  start: string;
  minutes: number;
  /** 0–1 */
  volume: number;
}

export interface Program {
  birdId: string;
  /** Curated pack currently applied, if any. */
  packId?: string;
  trackIds: string[];
  isianIds: string[];
  sessions: SessionSlot[];
  gapMinSec: number;
  gapMaxSec: number;
  dailyCapMin: number;
  /** When the masteran material (trackIds) last changed. */
  materialChangedAt: number;
}

export interface SessionLog {
  id: string;
  birdId: string;
  startedAt: number;
  endedAt: number;
  playedSec: number;
  trackIds: string[];
  trigger: 'manual' | 'schedule';
}

export interface Check {
  id: string;
  birdId: string;
  createdAt: number;
  source: 'record' | 'upload';
  durationSec: number;
  result: AnalysisResult;
  /** Snapshot of isian names at analysis time. */
  isianNames: Record<string, string>;
  /** Owner's agreement with each isian verdict — the human label used to calibrate thresholds. */
  feedback: Record<string, 'agree' | 'disagree'>;
}

export interface AppEvent {
  id?: number;
  t: number;
  name: string;
  props?: Record<string, unknown>;
}
