/**
 * Subsequence dynamic time warping ("spotting"): find where a short template best aligns inside a
 * longer sequence, allowing tempo differences. Frame distance is cosine distance on non-negative
 * "energy above background" vectors, which makes the score independent of loudness / mic distance.
 */

/** Frames whose total excess energy is below this are treated as silence. */
const SILENT_NORM = 3;

export interface Features {
  frames: number;
  dims: number;
  /** frames × dims, row-major */
  data: Float32Array;
}

export function sliceFeatures(f: Features, start: number, end: number): Features {
  const s = Math.max(0, start);
  const e = Math.min(f.frames, end);
  return { frames: Math.max(0, e - s), dims: f.dims, data: f.data.slice(s * f.dims, e * f.dims) };
}

/** Shift every frame up (+) or down (−) by `shift` bands, zero filling. Models a slightly higher/lower imitation. */
export function shiftBands(f: Features, shift: number): Features {
  if (shift === 0) return f;
  const out = new Float32Array(f.data.length);
  for (let i = 0; i < f.frames; i++) {
    for (let b = 0; b < f.dims; b++) {
      const src = b - shift;
      if (src >= 0 && src < f.dims) out[i * f.dims + b] = f.data[i * f.dims + src];
    }
  }
  return { frames: f.frames, dims: f.dims, data: out };
}

function norms(f: Features): Float32Array {
  const n = new Float32Array(f.frames);
  for (let i = 0; i < f.frames; i++) {
    let acc = 0;
    for (let b = 0; b < f.dims; b++) {
      const v = f.data[i * f.dims + b];
      acc += v * v;
    }
    n[i] = Math.sqrt(acc);
  }
  return n;
}

export interface SubsequenceResult {
  /** Path-length-normalised cost of the best alignment ending at each sequence frame. */
  cost: Float32Array;
  /** Sequence frame where that alignment starts. */
  start: Int32Array;
}

/** Matching configuration (tuned on real recordings, see docs/05-matcher-calibration.md). */
export const DTW_CONFIG = {
  /** Extra cost per non-diagonal step (discourages degenerate warping). */
  penalty: 0.05,
  /** Compare mean-centred frames (spectral shape correlation) instead of raw non-negative cosine. */
  centered: false,
};

/** Per-frame mean-centred copy, used for shape correlation. */
function centeredCopy(f: Features): { data: Float32Array; norm: Float32Array } {
  const data = new Float32Array(f.data.length);
  const norm = new Float32Array(f.frames);
  for (let i = 0; i < f.frames; i++) {
    let mean = 0;
    for (let b = 0; b < f.dims; b++) mean += f.data[i * f.dims + b];
    mean /= f.dims;
    let acc = 0;
    for (let b = 0; b < f.dims; b++) {
      const v = f.data[i * f.dims + b] - mean;
      data[i * f.dims + b] = v;
      acc += v * v;
    }
    norm[i] = Math.sqrt(acc) || 1e-9;
  }
  return { data, norm };
}

export function subsequenceDtw(tpl: Features, seq: Features, penalty = DTW_CONFIG.penalty): SubsequenceResult {
  const m = tpl.frames;
  const n = seq.frames;
  const d = tpl.dims;
  const tn = norms(tpl);
  const sn = norms(seq);
  const centered = DTW_CONFIG.centered;
  const tc = centered ? centeredCopy(tpl) : null;
  const sc = centered ? centeredCopy(seq) : null;
  const cost = new Float32Array(n).fill(Infinity);
  const startOut = new Int32Array(n);
  if (m === 0 || n === 0) return { cost, start: startOut };

  // Rolling rows: accumulated cost D, path length L, start index S.
  let Dp = new Float64Array(n), Lp = new Int32Array(n), Sp = new Int32Array(n);
  let Dc = new Float64Array(n), Lc = new Int32Array(n), Sc = new Int32Array(n);

  const dist = (i: number, j: number): number => {
    const a = tn[i], b = sn[j];
    const aSilent = a < SILENT_NORM, bSilent = b < SILENT_NORM;
    if (aSilent && bSilent) return 0;
    if (aSilent || bSilent) return 1;
    let dot = 0;
    const io = i * d, jo = j * d;
    if (tc && sc) {
      for (let k = 0; k < d; k++) dot += tc.data[io + k] * sc.data[jo + k];
      return (1 - dot / (tc.norm[i] * sc.norm[j])) / 2; // correlation → [0, 1]
    }
    for (let k = 0; k < d; k++) dot += tpl.data[io + k] * seq.data[jo + k];
    return 1 - dot / (a * b);
  };

  // First template row: free start anywhere in the sequence.
  for (let j = 0; j < n; j++) {
    Dp[j] = dist(0, j);
    Lp[j] = 1;
    Sp[j] = j;
  }

  for (let i = 1; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const c = dist(i, j);
      // Vertical step (template advances, sequence holds).
      let best = Dp[j] + c + penalty, L = Lp[j] + 1, S = Sp[j];
      if (j > 0) {
        const diag = Dp[j - 1] + c;
        if (diag < best) { best = diag; L = Lp[j - 1] + 1; S = Sp[j - 1]; }
        const horiz = Dc[j - 1] + c + penalty;
        if (horiz < best) { best = horiz; L = Lc[j - 1] + 1; S = Sc[j - 1]; }
      }
      Dc[j] = best; Lc[j] = L; Sc[j] = S;
    }
    [Dp, Dc] = [Dc, Dp];
    [Lp, Lc] = [Lc, Lp];
    [Sp, Sc] = [Sc, Sp];
  }
  for (let j = 0; j < n; j++) {
    cost[j] = Dp[j] / Lp[j];
    startOut[j] = Sp[j];
  }
  return { cost, start: startOut };
}

export const SPOT_CONFIG = { shifts: [-1, 0, 1], minRatio: 0.75, maxRatio: 1.35 };

export interface Hit {
  start: number; // sequence frame, inclusive
  end: number; // sequence frame, exclusive
  cost: number;
}

/**
 * Best non-overlapping alignments of `tpl` in `seq`, trying small pitch shifts.
 * Matches whose length is outside [minRatio, maxRatio] × template length are rejected.
 */
export function spot(
  tpl: Features,
  seq: Features,
  opts: { shifts?: number[]; maxCost?: number; minRatio?: number; maxRatio?: number } = {},
): Hit[] {
  const shifts = opts.shifts ?? SPOT_CONFIG.shifts;
  const maxCost = opts.maxCost ?? 0.6;
  const minRatio = opts.minRatio ?? SPOT_CONFIG.minRatio;
  const maxRatio = opts.maxRatio ?? SPOT_CONFIG.maxRatio;
  const m = tpl.frames;
  if (m === 0 || seq.frames < Math.ceil(m * minRatio)) return [];

  const n = seq.frames;
  const bestCost = new Float32Array(n).fill(Infinity);
  const bestStart = new Int32Array(n);
  for (const s of shifts) {
    const r = subsequenceDtw(shiftBands(tpl, s), seq);
    for (let j = 0; j < n; j++) {
      const len = j - r.start[j] + 1;
      if (len < m * minRatio || len > m * maxRatio) continue;
      if (r.cost[j] < bestCost[j]) {
        bestCost[j] = r.cost[j];
        bestStart[j] = r.start[j];
      }
    }
  }
  const candidates: Hit[] = [];
  for (let j = 0; j < n; j++) {
    if (bestCost[j] <= maxCost) candidates.push({ start: bestStart[j], end: j + 1, cost: bestCost[j] });
  }
  candidates.sort((a, b) => a.cost - b.cost);
  const accepted: Hit[] = [];
  for (const c of candidates) {
    const overlaps = accepted.some((a) => c.start < a.end && a.start < c.end);
    if (!overlaps) accepted.push(c);
  }
  return accepted;
}
