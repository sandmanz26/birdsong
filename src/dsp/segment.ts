import { HOP_SEC, Matrix, percentile } from './spectrogram';

/** Half-open frame interval [start, end). */
export interface Segment {
  start: number;
  end: number;
}

export interface Segmentation {
  /** Per-band background level (dB). */
  floor: Float32Array;
  /** Energy above background minus a small margin, clamped at 0 (frames × bands). Used as matching features. */
  excess: Matrix;
  /** Per-frame activity in dB above background. */
  activity: Float32Array;
  syllables: Segment[];
  phrases: Segment[];
  thresholdDb: number;
}

export const EXCESS_MARGIN_DB = 3;
/** Syllables closer than this are merged into one phrase. */
export const PHRASE_GAP_SEC = 0.12;
const MIN_SYLLABLE_FRAMES = 2;

/** Background level per band = low percentile over time (robust to the bird singing much of the time). */
export function noiseFloor(mel: Matrix, p = 20): Float32Array {
  const floor = new Float32Array(mel.cols);
  const col = new Float32Array(mel.rows);
  for (let b = 0; b < mel.cols; b++) {
    for (let f = 0; f < mel.rows; f++) col[f] = mel.data[f * mel.cols + b];
    floor[b] = percentile(col, p);
  }
  return floor;
}

export function excessMatrix(mel: Matrix, floor: Float32Array, margin = EXCESS_MARGIN_DB): Matrix {
  const data = new Float32Array(mel.data.length);
  for (let f = 0; f < mel.rows; f++) {
    for (let b = 0; b < mel.cols; b++) {
      const v = mel.data[f * mel.cols + b] - floor[b] - margin;
      data[f * mel.cols + b] = v > 0 ? v : 0;
    }
  }
  return { rows: mel.rows, cols: mel.cols, data };
}

/** Per-frame activity: mean of the 3 strongest bands above background, lightly smoothed. */
export function frameActivity(mel: Matrix, floor: Float32Array): Float32Array {
  const raw = new Float32Array(mel.rows);
  const top = [0, 0, 0];
  for (let f = 0; f < mel.rows; f++) {
    top[0] = top[1] = top[2] = -Infinity;
    for (let b = 0; b < mel.cols; b++) {
      const v = mel.data[f * mel.cols + b] - floor[b];
      if (v > top[0]) { top[2] = top[1]; top[1] = top[0]; top[0] = v; }
      else if (v > top[1]) { top[2] = top[1]; top[1] = v; }
      else if (v > top[2]) top[2] = v;
    }
    raw[f] = (top[0] + top[1] + top[2]) / 3;
  }
  const out = new Float32Array(mel.rows);
  for (let f = 0; f < mel.rows; f++) {
    const a = raw[Math.max(0, f - 1)], b = raw[f], c = raw[Math.min(mel.rows - 1, f + 1)];
    out[f] = 0.25 * a + 0.5 * b + 0.25 * c;
  }
  return out;
}

export function segment(mel: Matrix, floorOverride?: Float32Array): Segmentation {
  const floor = floorOverride ?? noiseFloor(mel);
  const activity = frameActivity(mel, floor);
  // Adaptive threshold: at least 10 dB above background, and clear of the background's own fluctuation.
  const thrOn = Math.max(10, percentile(activity, 25) + 8);
  const thrOff = thrOn - 4;

  const syllables: Segment[] = [];
  let inSyl = false;
  let s0 = 0;
  for (let f = 0; f < activity.length; f++) {
    const a = activity[f];
    if (!inSyl && a >= thrOn) {
      inSyl = true;
      s0 = f;
      // Extend backwards over the soft onset.
      while (s0 > 0 && activity[s0 - 1] >= thrOff) s0--;
    } else if (inSyl && a < thrOff) {
      inSyl = false;
      if (f - s0 >= MIN_SYLLABLE_FRAMES) syllables.push({ start: s0, end: f });
    }
  }
  if (inSyl && activity.length - s0 >= MIN_SYLLABLE_FRAMES) syllables.push({ start: s0, end: activity.length });

  const maxGap = Math.round(PHRASE_GAP_SEC / HOP_SEC);
  const phrases: Segment[] = [];
  for (const syl of syllables) {
    const last = phrases[phrases.length - 1];
    if (last && syl.start - last.end <= maxGap) last.end = syl.end;
    else phrases.push({ start: syl.start, end: syl.end });
  }
  return { floor, excess: excessMatrix(mel, floor), activity, syllables, phrases, thresholdDb: thrOn };
}
