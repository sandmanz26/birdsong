/**
 * Coarse audio fingerprint for duplicate detection in the catalogue pipeline: the same recording often
 * appears in several archives (e.g. a xeno-canto file mirrored on Commons, or a re-cropped copy).
 * Fingerprint = per-band mean and 90th-percentile level over song frames, z-normalised.
 */
import { segment } from './segment';
import { logMel, percentile, SR } from './spectrogram';

export interface Fingerprint {
  durationSec: number;
  /** Spectral profile (z-normalised per-band mean and P90 level). */
  vector: number[];
  /** Activity envelope at ~21.5 frames/s (z-normalised), for alignment-based duplicate detection. */
  envelope?: number[];
}

const ENV_POOL = 4; // 4 × 11.6 ms ≈ 46 ms per envelope step

export function fingerprint(samples: Float32Array, sr = SR): Fingerprint {
  const mel = logMel(samples, sr);
  const seg = segment(mel);
  const frames: number[] = [];
  for (const s of seg.syllables) for (let f = s.start; f < s.end; f++) frames.push(f);
  const use = frames.length >= 20 ? frames : Array.from({ length: mel.rows }, (_, i) => i);
  const vec: number[] = [];
  for (let b = 0; b < mel.cols; b++) {
    const col = use.map((f) => mel.data[f * mel.cols + b] - seg.floor[b]);
    vec.push(col.reduce((a, x) => a + x, 0) / col.length, percentile(col, 90));
  }
  const mean = vec.reduce((a, x) => a + x, 0) / vec.length;
  const sd = Math.sqrt(vec.reduce((a, x) => a + (x - mean) ** 2, 0) / vec.length) || 1;
  const env: number[] = [];
  for (let f = 0; f + ENV_POOL <= seg.activity.length; f += ENV_POOL) {
    let a = 0;
    for (let k = 0; k < ENV_POOL; k++) a += Math.max(0, seg.activity[f + k]);
    env.push(a / ENV_POOL);
  }
  const em = env.reduce((a, x) => a + x, 0) / (env.length || 1);
  const es = Math.sqrt(env.reduce((a, x) => a + (x - em) ** 2, 0) / (env.length || 1)) || 1;
  return { durationSec: samples.length / sr, vector: vec.map((x) => (x - mean) / sd), envelope: env.map((x) => +((x - em) / es).toFixed(3)) };
}

/**
 * Maximum normalised cross-correlation of activity envelopes over all lags with ≥ minOverlapSec of
 * overlap. A crop/re-encode of the same recording aligns almost perfectly at one lag (≈ 1); different
 * recordings — even of the same species — do not.
 */
export function envelopeAlignment(a: number[], b: number[], minOverlapSec = 8): number {
  const minOverlap = Math.round(minOverlapSec / (ENV_POOL * 0.0116));
  let best = -1;
  for (let lag = -(b.length - minOverlap); lag <= a.length - minOverlap; lag++) {
    const i0 = Math.max(0, lag), j0 = Math.max(0, -lag);
    const n = Math.min(a.length - i0, b.length - j0);
    if (n < minOverlap) continue;
    let sab = 0, saa = 0, sbb = 0, ma = 0, mb = 0;
    for (let k = 0; k < n; k++) { ma += a[i0 + k]; mb += b[j0 + k]; }
    ma /= n; mb /= n;
    for (let k = 0; k < n; k++) {
      const x = a[i0 + k] - ma, y = b[j0 + k] - mb;
      sab += x * y; saa += x * x; sbb += y * y;
    }
    const r = sab / Math.sqrt(saa * sbb || 1);
    if (r > best) best = r;
  }
  return best;
}

/** Pearson correlation of two fingerprints. */
export function fingerprintSimilarity(a: Fingerprint, b: Fingerprint): number {
  const n = Math.min(a.vector.length, b.vector.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a.vector[i] * b.vector[i];
  return s / n;
}

/** Thresholds validated on mirrored archive files (docs/07-species-coverage.md). */
export const DUPLICATE = { minSpectral: 0.9, minAlignment: 0.9 };

/** Same recording (possibly a different crop or re-encode): similar spectrum AND near-perfect time alignment. */
export function isDuplicate(a: Fingerprint, b: Fingerprint): boolean {
  if (fingerprintSimilarity(a, b) < DUPLICATE.minSpectral) return false;
  if (!a.envelope || !b.envelope) return false;
  return envelopeAlignment(a.envelope, b.envelope) >= DUPLICATE.minAlignment;
}
