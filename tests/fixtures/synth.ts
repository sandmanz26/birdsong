/**
 * TEST FIXTURE ONLY. Synthetic chirps with known ground truth for the analyser's unit tests.
 * Lives under tests/ so it can never be bundled into the product: the app ships no synthetic or dummy
 * audio (content standard, docs/06-curation-standard.md).
 */
import { SR } from '../../src/dsp/spectrogram';
import { mulberry32 } from '../../src/audio/random';
export { mulberry32 };

export interface Syllable {
  /** Start and end frequency of the sweep (Hz). */
  f0: number;
  f1: number;
  /** Duration (s). */
  dur: number;
  /** Silence after the syllable (s). */
  gap: number;
  /** Optional frequency modulation (trill) depth in Hz and rate in Hz. */
  fmDepth?: number;
  fmRate?: number;
  /** Relative level of the 2nd harmonic. */
  h2?: number;
}

export type PhraseSpec = Syllable[];

/** A few distinct phrase "types" used by the tests. */
export const PHRASES: Record<string, PhraseSpec> = {
  // Rising whistles
  A: [
    { f0: 2000, f1: 3500, dur: 0.12, gap: 0.04 },
    { f0: 2200, f1: 3800, dur: 0.12, gap: 0.04 },
    { f0: 2500, f1: 4200, dur: 0.15, gap: 0.0 },
  ],
  // Fast descending trill
  B: [
    { f0: 6000, f1: 4000, dur: 0.05, gap: 0.03 },
    { f0: 5800, f1: 3900, dur: 0.05, gap: 0.03 },
    { f0: 5600, f1: 3800, dur: 0.05, gap: 0.03 },
    { f0: 5400, f1: 3700, dur: 0.05, gap: 0.03 },
    { f0: 5200, f1: 3600, dur: 0.05, gap: 0.0 },
  ],
  // Long warbled note with harmonic
  C: [{ f0: 3000, f1: 3000, dur: 0.45, gap: 0.0, fmDepth: 400, fmRate: 18, h2: 0.4 }],
  // Low "chuk" notes then a high upsweep
  D: [
    { f0: 1500, f1: 1300, dur: 0.07, gap: 0.08 },
    { f0: 1500, f1: 1300, dur: 0.07, gap: 0.08 },
    { f0: 5000, f1: 7500, dur: 0.18, gap: 0.0 },
  ],
  // Two-note "tee-oo"
  E: [
    { f0: 7000, f1: 7000, dur: 0.15, gap: 0.05 },
    { f0: 4500, f1: 4500, dur: 0.2, gap: 0.0 },
  ],
};

export interface RenderOptions {
  /** Multiply all frequencies (e.g. 1.05 = 5% higher). */
  pitch?: number;
  /** Multiply all durations (e.g. 1.15 = 15% slower). */
  tempo?: number;
  amplitude?: number;
}

export function phraseDuration(spec: PhraseSpec, tempo = 1): number {
  return spec.reduce((t, s) => t + (s.dur + s.gap) * tempo, 0);
}

/** Render a phrase into `out` starting at sample `at` (additive). */
export function renderPhrase(out: Float32Array, at: number, spec: PhraseSpec, opts: RenderOptions = {}, sr = SR): void {
  const pitch = opts.pitch ?? 1;
  const tempo = opts.tempo ?? 1;
  const amp = opts.amplitude ?? 0.3;
  let pos = at;
  for (const syl of spec) {
    const n = Math.round(syl.dur * tempo * sr);
    let phase = 0;
    let phase2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let f = (syl.f0 + (syl.f1 - syl.f0) * t) * pitch;
      if (syl.fmDepth) f += syl.fmDepth * pitch * Math.sin((2 * Math.PI * (syl.fmRate ?? 10) * i) / sr);
      phase += (2 * Math.PI * f) / sr;
      phase2 += (2 * Math.PI * 2 * f) / sr;
      // Smooth attack/decay envelope.
      const env = Math.sin(Math.PI * t) ** 0.6;
      const idx = pos + i;
      if (idx >= 0 && idx < out.length) out[idx] += amp * env * (Math.sin(phase) + (syl.h2 ?? 0) * Math.sin(phase2));
    }
    pos += n + Math.round(syl.gap * tempo * sr);
  }
}

/** Add background noise (white, lightly low-passed, like room/traffic noise). */
export function addNoise(out: Float32Array, level: number, seed = 1): void {
  const rnd = mulberry32(seed);
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rnd() * 2 - 1;
    prev = 0.7 * prev + 0.3 * w;
    out[i] += level * (0.6 * prev + 0.4 * w);
  }
}

export interface Placement {
  phrase: string;
  at: number; // seconds
  opts?: RenderOptions;
}

export function renderScene(durationSec: number, placements: Placement[], noise = 0.01, seed = 1, sr = SR): Float32Array {
  const out = new Float32Array(Math.round(durationSec * sr));
  addNoise(out, noise, seed);
  for (const p of placements) renderPhrase(out, Math.round(p.at * sr), PHRASES[p.phrase], p.opts, sr);
  return out;
}

/** Fixture "tutor" track: phrase types A, B and C repeated with natural gaps (≈24 s). */
export function demoTutorTrack(sr = SR): Float32Array {
  const placements: Placement[] = [];
  const order = ['A', 'B', 'C', 'A', 'C', 'B', 'A', 'B', 'C'];
  let t = 1;
  const rnd = mulberry32(7);
  for (const p of order) {
    placements.push({ phrase: p, at: t });
    t += phraseDuration(PHRASES[p]) + 1.5 + rnd() * 1.5;
  }
  return renderScene(t + 1, placements, 0.004, 11, sr);
}

/**
 * Fixture "bird" recording (≈30 s): has learned A (slightly higher and slower), is part-way on C
 * (distorted), has not learned B, and sings its own phrases D and E.
 */
export function demoBirdRecording(sr = SR): Float32Array {
  const placements: Placement[] = [
    { phrase: 'D', at: 1.0 },
    { phrase: 'A', at: 3.2, opts: { pitch: 1.04, tempo: 1.1 } },
    { phrase: 'E', at: 5.5 },
    { phrase: 'D', at: 8.0 },
    { phrase: 'A', at: 10.4, opts: { pitch: 1.03, tempo: 1.12 } },
    { phrase: 'E', at: 13.0 },
    { phrase: 'A', at: 16.1, opts: { pitch: 1.05, tempo: 1.08 } },
    { phrase: 'D', at: 19.0 },
    { phrase: 'E', at: 22.5 },
    { phrase: 'D', at: 25.0 },
  ];
  const out = renderScene(30, placements, 0.012, 23, sr);
  // A rough, half-learned version of C: right pitch region, wrong modulation, shorter.
  renderPhrase(out, Math.round(27.2 * sr), [{ f0: 2955, f1: 3135, dur: 0.39, gap: 0, fmDepth: 280, fmRate: 12, h2: 0.22 }], {}, sr);
  return out;
}
