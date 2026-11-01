import { FFT } from './fft';

/** Analysis sample rate. Songbird hearing/song energy is concentrated below ~10 kHz (research R14). */
export const SR = 22050;
export const N_FFT = 512;
export const HOP = 256; // ≈ 11.6 ms at 22.05 kHz
export const N_MELS = 40;
export const F_MIN = 800;
export const F_MAX = 10000;
export const HOP_SEC = HOP / SR;

/** Row-major matrix: frames × bands. */
export interface Matrix {
  rows: number;
  cols: number;
  data: Float32Array;
}

const hzToMel = (f: number) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m: number) => 700 * (10 ** (m / 2595) - 1);

let cachedBank: { key: string; bank: Float32Array[]; lo: Int32Array; hi: Int32Array } | null = null;

/** Triangular mel filterbank over the FFT magnitude bins. */
export function melFilterbank(sr = SR, nFft = N_FFT, nMels = N_MELS, fMin = F_MIN, fMax = F_MAX) {
  const key = `${sr}|${nFft}|${nMels}|${fMin}|${fMax}`;
  if (cachedBank && cachedBank.key === key) return cachedBank;
  const nBins = nFft / 2 + 1;
  const mMin = hzToMel(fMin);
  const mMax = hzToMel(fMax);
  const centers: number[] = [];
  for (let i = 0; i < nMels + 2; i++) centers.push(melToHz(mMin + ((mMax - mMin) * i) / (nMels + 1)));
  const binHz = sr / nFft;
  const bank: Float32Array[] = [];
  const lo = new Int32Array(nMels);
  const hi = new Int32Array(nMels);
  for (let m = 0; m < nMels; m++) {
    const f0 = centers[m], f1 = centers[m + 1], f2 = centers[m + 2];
    const w = new Float32Array(nBins);
    let first = -1, last = -1;
    for (let k = 0; k < nBins; k++) {
      const f = k * binHz;
      let v = 0;
      if (f > f0 && f <= f1) v = (f - f0) / (f1 - f0);
      else if (f > f1 && f < f2) v = (f2 - f) / (f2 - f1);
      if (v > 0) {
        w[k] = v;
        if (first < 0) first = k;
        last = k;
      }
    }
    // Low bands can be narrower than one bin: fall back to the nearest bin.
    if (first < 0) {
      const k = Math.round(f1 / binHz);
      w[k] = 1;
      first = last = k;
    }
    bank.push(w);
    lo[m] = first;
    hi[m] = last;
  }
  cachedBank = { key, bank, lo, hi };
  return cachedBank;
}

function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/**
 * Power spectrogram frames, calling `onFrame(power, frameIndex)` for each frame.
 * Frames are centred on t = frameIndex * hop (zero padded at the edges).
 */
function stft(samples: Float32Array, nFft: number, hop: number, onFrame: (power: Float64Array, f: number) => void) {
  const fft = new FFT(nFft);
  const win = hann(nFft);
  const re = new Float64Array(nFft);
  const im = new Float64Array(nFft);
  const power = new Float64Array(nFft / 2 + 1);
  const frames = Math.max(1, Math.floor(samples.length / hop));
  const half = nFft / 2;
  for (let f = 0; f < frames; f++) {
    const start = f * hop - half;
    for (let i = 0; i < nFft; i++) {
      const s = start + i;
      re[i] = s >= 0 && s < samples.length ? samples[s] * win[i] : 0;
      im[i] = 0;
    }
    fft.transform(re, im);
    for (let k = 0; k <= half; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    onFrame(power, f);
  }
  return frames;
}

/** Log-mel spectrogram in dB (frames × N_MELS). */
export function logMel(samples: Float32Array, sr = SR): Matrix {
  const { bank, lo, hi } = melFilterbank(sr);
  const frames = Math.max(1, Math.floor(samples.length / HOP));
  const data = new Float32Array(frames * N_MELS);
  stft(samples, N_FFT, HOP, (power, f) => {
    for (let m = 0; m < N_MELS; m++) {
      const w = bank[m];
      let acc = 0;
      for (let k = lo[m]; k <= hi[m]; k++) acc += w[k] * power[k];
      data[f * N_MELS + m] = 10 * Math.log10(acc + 1e-10);
    }
  });
  return { rows: frames, cols: N_MELS, data };
}

/**
 * Display spectrogram: dB magnitude for linear bins up to `maxHz`, with an optional max number of
 * columns (frames are max-pooled so long tracks stay cheap to draw).
 */
export function displaySpectrogram(samples: Float32Array, sr = SR, maxHz = F_MAX, maxCols = 2000): Matrix & { secPerCol: number } {
  const nFft = 512;
  const hop = 128;
  const nBins = Math.min(nFft / 2 + 1, Math.ceil((maxHz / sr) * nFft));
  const frames = Math.max(1, Math.floor(samples.length / hop));
  const pool = Math.max(1, Math.ceil(frames / maxCols));
  const cols = Math.ceil(frames / pool);
  const data = new Float32Array(cols * nBins).fill(-120);
  stft(samples, nFft, hop, (power, f) => {
    const c = Math.floor(f / pool);
    for (let k = 0; k < nBins; k++) {
      const db = 10 * Math.log10(power[k] + 1e-10);
      const idx = c * nBins + k;
      if (db > data[idx]) data[idx] = db;
    }
  });
  return { rows: cols, cols: nBins, data, secPerCol: (pool * hop) / sr };
}

/** Linear-interpolation resampler (adequate for analysis; playback uses the original file). */
export function resampleLinear(input: Float32Array, fromSr: number, toSr = SR): Float32Array {
  if (fromSr === toSr) return input;
  const ratio = fromSr / toSr;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  // Simple box pre-filter when downsampling, to limit aliasing.
  const box = Math.max(1, Math.floor(ratio));
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    let a = 0, b = 0;
    for (let j = 0; j < box; j++) {
      a += input[Math.min(input.length - 1, i0 + j)];
      b += input[Math.min(input.length - 1, i0 + 1 + j)];
    }
    out[i] = ((1 - frac) * a + frac * b) / box;
  }
  return out;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const arr = Array.from(values).sort((x, y) => x - y);
  if (arr.length === 0) return 0;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.round((p / 100) * (arr.length - 1))));
  return arr[idx];
}
