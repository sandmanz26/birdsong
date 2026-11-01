/**
 * "Cek Isian" analysis: which target phrases (isian) does the bird sing, how closely, how often,
 * plus contest-style indicators (research R7, R10).
 */
import { Features, spot } from './dtw';
import { segment, noiseFloor, excessMatrix, frameActivity, Segment } from './segment';
import { HOP_SEC, logMel, percentile, SR } from './spectrogram';

export const ANALYSIS_VERSION = 1;

/** Cost → similarity calibration (normalised cosine-DTW path cost). Tuned on synthetic tests; to be
 * re-calibrated against expert labels collected in user testing (see docs/03-user-testing-plan.md). */
/** Calibrated on real catalogue recordings (genuine repeats vs other species): "masuk" (70) sits at the
 * cost where ≈5% of cross-species pairs would pass. See docs/05-matcher-calibration.md. */
export const SCORE_CONFIG = { costPerfect: 0.115, costUnrelated: 0.365 };

export const THRESHOLD_MASUK = 70;
export const THRESHOLD_MIRIP = 50;
export const VARIASI_THRESHOLD = 50;

export type IsianStatus = 'masuk' | 'mirip' | 'belum';

export const costToSimilarity = (cost: number): number => {
  const { costPerfect, costUnrelated } = SCORE_CONFIG;
  const s = (costUnrelated - cost) / (costUnrelated - costPerfect);
  return Math.round(100 * Math.min(1, Math.max(0, s)));
};

export const statusFor = (similarity: number): IsianStatus =>
  similarity >= THRESHOLD_MASUK ? 'masuk' : similarity >= THRESHOLD_MIRIP ? 'mirip' : 'belum';

export interface PreparedTemplate {
  id: string;
  features: Features;
}

/** Window of context (s) around a marked isian used to estimate the background level. */
const TEMPLATE_CONTEXT_SEC = 15;

/**
 * Build a template from a region of a tutor track. Background is estimated from surrounding context,
 * and leading/trailing quiet frames are trimmed so the template is just the phrase.
 */
export function prepareTemplate(id: string, track: Float32Array, startSec: number, endSec: number, sr = SR): PreparedTemplate {
  const ctxStart = Math.max(0, Math.floor((startSec - TEMPLATE_CONTEXT_SEC) * sr));
  const ctxEnd = Math.min(track.length, Math.ceil((endSec + TEMPLATE_CONTEXT_SEC) * sr));
  const ctx = track.subarray(ctxStart, ctxEnd);
  const mel = logMel(ctx, sr);
  const floor = noiseFloor(mel);
  const excess = excessMatrix(mel, floor);
  const activity = frameActivity(mel, floor);
  let f0 = Math.max(0, Math.floor((startSec - ctxStart / sr) / HOP_SEC));
  let f1 = Math.min(mel.rows, Math.ceil((endSec - ctxStart / sr) / HOP_SEC));
  // Trim quiet edges (activity below 8 dB over background).
  while (f0 < f1 - 1 && activity[f0] < 8) f0++;
  while (f1 > f0 + 1 && activity[f1 - 1] < 8) f1--;
  const d = mel.cols;
  return { id, features: { frames: f1 - f0, dims: d, data: excess.data.slice(f0 * d, f1 * d) } };
}

export interface Occurrence {
  startSec: number;
  endSec: number;
  similarity: number;
}

export interface IsianMatch {
  templateId: string;
  bestSimilarity: number;
  status: IsianStatus;
  /** Occurrences at or above the "mirip" threshold, sorted by time. */
  occurrences: Occurrence[];
  bestAtSec: number | null;
}

export interface PhraseInfo {
  startSec: number;
  endSec: number;
  /** Phrase type index (variasi cluster). */
  type: number;
  matchedTemplateId: string | null;
  similarity: number | null;
}

export interface AnalysisResult {
  version: number;
  durationSec: number;
  matches: IsianMatch[];
  phrases: PhraseInfo[];
  metrics: {
    /** Seconds of actual sound (syllables). */
    singingSec: number;
    /** % of the recording covered by phrases ("kerja"). */
    kerjaPct: number;
    phraseCount: number;
    /** Distinct phrase types ("variasi"). */
    variasi: number;
    /** Typical peak level above background, dB (uncalibrated; compare like with like). */
    loudnessDb: number;
  };
}

const PAD = 3; // frames of context around phrases when spotting
const MAX_CLUSTER_PHRASES = 150;
const MAX_CLUSTER_FRAMES = 300;

function phraseFeatures(all: Features, seg: Segment, pad = PAD): { feats: Features; offset: number } {
  const s = Math.max(0, seg.start - pad);
  const e = Math.min(all.frames, seg.end + pad);
  return { feats: { frames: e - s, dims: all.dims, data: all.data.subarray(s * all.dims, e * all.dims) }, offset: s };
}

/** Symmetric-ish phrase similarity for variasi clustering (shorter phrase spotted within the longer). */
function phraseSimilarity(a: Features, b: Features): number {
  const [short, long] = a.frames <= b.frames ? [a, b] : [b, a];
  if (long.frames > short.frames * 2) return 0;
  const hits = spot(short, long, { minRatio: 0.6, maxRatio: 1.6 });
  return hits.length ? costToSimilarity(hits[0].cost) : 0;
}

/** Greedy clustering of phrases into types (variasi). Returns a type index per phrase (-1 = not clustered). */
export function clusterPhrases(all: Features, phrases: Segment[]): { types: number[]; typeCount: number } {
  const reps: Features[] = [];
  const types: number[] = [];
  phrases.forEach((ph, i) => {
    if (i >= MAX_CLUSTER_PHRASES) {
      types.push(-1);
      return;
    }
    const capped: Segment = { start: ph.start, end: Math.min(ph.end, ph.start + MAX_CLUSTER_FRAMES) };
    const { feats } = phraseFeatures(all, capped, 0);
    let bestType = -1;
    let bestSim = VARIASI_THRESHOLD;
    reps.forEach((r, ti) => {
      const s = phraseSimilarity(feats, r);
      if (s >= bestSim) {
        bestSim = s;
        bestType = ti;
      }
    });
    if (bestType < 0) {
      reps.push(feats);
      bestType = reps.length - 1;
    }
    types.push(bestType);
  });
  return { types, typeCount: reps.length };
}

export interface PhraseType {
  type: number;
  count: number;
  /** Representative occurrence: the strongest member within the allowed length. */
  startSec: number;
  endSec: number;
  peakDb: number;
}

/**
 * Phrase types of a recording, most frequent first. Used by the catalogue pipeline to pre-mark
 * isian on curated tracks, so owners never have to mark phrases themselves.
 */
export function phraseTypes(samples: Float32Array, sr = SR, minSec = 0.5, maxSec = 3): PhraseType[] {
  const mel = logMel(samples, sr);
  const seg = segment(mel);
  const all: Features = { frames: seg.excess.rows, dims: seg.excess.cols, data: seg.excess.data };
  const { types } = clusterPhrases(all, seg.phrases);
  const byType = new Map<number, PhraseType>();
  seg.phrases.forEach((ph, i) => {
    const t = types[i];
    if (t < 0) return;
    const dur = (ph.end - ph.start) * HOP_SEC;
    let peak = 0;
    for (let f = ph.start; f < ph.end; f++) peak = Math.max(peak, seg.activity[f]);
    const cur = byType.get(t) ?? { type: t, count: 0, startSec: 0, endSec: 0, peakDb: -1 };
    cur.count++;
    if (dur >= minSec && dur <= maxSec && peak > cur.peakDb) {
      cur.startSec = +(ph.start * HOP_SEC).toFixed(3);
      cur.endSec = +(ph.end * HOP_SEC).toFixed(3);
      cur.peakDb = Math.round(peak);
    }
    byType.set(t, cur);
  });
  return [...byType.values()].filter((p) => p.peakDb >= 0).sort((a, b) => b.count - a.count || b.peakDb - a.peakDb);
}

export function analyzeRecording(samples: Float32Array, templates: PreparedTemplate[], sr = SR): AnalysisResult {
  const mel = logMel(samples, sr);
  const seg = segment(mel);
  const all: Features = { frames: seg.excess.rows, dims: seg.excess.cols, data: seg.excess.data };
  const toSec = (f: number) => +(f * HOP_SEC).toFixed(3);

  // --- Isian spotting -------------------------------------------------------------------------
  const phraseBest: { id: string; sim: number }[] = seg.phrases.map(() => ({ id: '', sim: -1 }));
  const matches: IsianMatch[] = templates.map((tpl) => {
    const occ: Occurrence[] = [];
    let best = 0;
    let bestAt: number | null = null;
    seg.phrases.forEach((ph, pi) => {
      const { feats, offset } = phraseFeatures(all, ph);
      for (const h of spot(tpl.features, feats)) {
        const sim = costToSimilarity(h.cost);
        if (sim > best) {
          best = sim;
          bestAt = toSec(offset + h.start);
        }
        if (sim > phraseBest[pi].sim) phraseBest[pi] = { id: tpl.id, sim };
        if (sim >= THRESHOLD_MIRIP) occ.push({ startSec: toSec(offset + h.start), endSec: toSec(offset + h.end), similarity: sim });
      }
    });
    occ.sort((a, b) => a.startSec - b.startSec);
    return { templateId: tpl.id, bestSimilarity: best, status: statusFor(best), occurrences: occ, bestAtSec: bestAt };
  });

  // --- Variasi: greedy clustering of phrases into types ------------------------------------------
  const { types, typeCount } = clusterPhrases(all, seg.phrases);

  // --- Contest-style indicators -------------------------------------------------------------------
  const sylFrames = seg.syllables.reduce((n, s) => n + (s.end - s.start), 0);
  const phraseFrames = seg.phrases.reduce((n, s) => n + (s.end - s.start), 0);
  const activeLevels: number[] = [];
  for (const s of seg.syllables) for (let f = s.start; f < s.end; f++) activeLevels.push(seg.activity[f]);

  const phrases: PhraseInfo[] = seg.phrases.map((ph, i) => ({
    startSec: toSec(ph.start),
    endSec: toSec(ph.end),
    type: types[i],
    matchedTemplateId: phraseBest[i].sim >= THRESHOLD_MIRIP ? phraseBest[i].id : null,
    similarity: phraseBest[i].sim >= 0 ? phraseBest[i].sim : null,
  }));

  return {
    version: ANALYSIS_VERSION,
    durationSec: +(samples.length / sr).toFixed(2),
    matches,
    phrases,
    metrics: {
      singingSec: +(sylFrames * HOP_SEC).toFixed(1),
      kerjaPct: mel.rows ? Math.round((100 * phraseFrames) / mel.rows) : 0,
      phraseCount: seg.phrases.length,
      variasi: typeCount,
      loudnessDb: activeLevels.length ? Math.round(percentile(activeLevels, 95)) : 0,
    },
  };
}

/** Phrase boundaries of a track (for the "tap a phrase to mark isian" editor). */
export function detectPhrases(samples: Float32Array, sr = SR): { startSec: number; endSec: number }[] {
  const seg = segment(logMel(samples, sr));
  return seg.phrases.map((p) => ({ startSec: +(p.start * HOP_SEC).toFixed(3), endSec: +(p.end * HOP_SEC).toFixed(3) }));
}
