import { describe, expect, it } from 'vitest';
import { analyzeRecording, costToSimilarity, detectPhrases, prepareTemplate, statusFor } from '../src/dsp/analyze';
import { FFT } from '../src/dsp/fft';
import { logMel, resampleLinear, SR } from '../src/dsp/spectrogram';
import { segment } from '../src/dsp/segment';
import { demoBirdRecording, demoTutorTrack, PHRASES, phraseDuration, renderScene } from './fixtures/synth';

/** Tutor track with A, B, C at known times + templates cut from it (as a user would in the editor). */
function tutorTemplates() {
  const tutor = renderScene(6, [{ phrase: 'A', at: 1 }, { phrase: 'B', at: 2.5 }, { phrase: 'C', at: 4 }], 0.005, 3);
  const cut = (id: string, at: number) => prepareTemplate(id, tutor, at - 0.05, at + phraseDuration(PHRASES[id]) + 0.05);
  return [cut('A', 1), cut('B', 2.5), cut('C', 4)];
}

const bestOf = (r: ReturnType<typeof analyzeRecording>, id: string) => r.matches.find((m) => m.templateId === id)!.bestSimilarity;

describe('FFT', () => {
  it('puts a pure tone in the right bin', () => {
    const n = 256;
    const fft = new FFT(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 10 * i) / n);
    fft.transform(re, im);
    const mags = Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k], im[k]));
    expect(mags.indexOf(Math.max(...mags))).toBe(10);
  });

  it('rejects non power-of-two sizes', () => {
    expect(() => new FFT(300)).toThrow();
  });
});

describe('spectrogram & segmentation', () => {
  it('finds each phrase separated by silence', () => {
    const rec = renderScene(8, ['A', 'B', 'C', 'D'].map((p, i) => ({ phrase: p, at: 0.8 + i * 1.8 })), 0.02, 5);
    const seg = segment(logMel(rec));
    expect(seg.phrases).toHaveLength(4);
  });

  it('finds nothing in background noise', () => {
    const rec = renderScene(5, [], 0.03, 8);
    expect(segment(logMel(rec)).phrases.length).toBe(0);
  });

  it('resamples 44.1 kHz input to the analysis rate', () => {
    const x = new Float32Array(44100).fill(0.5);
    const y = resampleLinear(x, 44100, SR);
    expect(y.length).toBe(SR);
    expect(y[100]).toBeCloseTo(0.5, 5);
  });

  it('detects phrases in the fixture tutor track', () => {
    expect(detectPhrases(demoTutorTrack())).toHaveLength(9);
  });
});

describe('isian matching', () => {
  const templates = tutorTemplates();

  it('scores an exact copy as learned ("masuk")', () => {
    const r = analyzeRecording(renderScene(4, [{ phrase: 'A', at: 1.3 }], 0.02, 9), templates);
    expect(bestOf(r, 'A')).toBeGreaterThanOrEqual(80);
    expect(r.matches[0].status).toBe('masuk');
  });

  it('tolerates natural imitation differences: slightly higher and slower', () => {
    const r = analyzeRecording(renderScene(4, [{ phrase: 'A', at: 1.3, opts: { pitch: 1.05, tempo: 1.15 } }], 0.02, 9), templates);
    expect(bestOf(r, 'A')).toBeGreaterThanOrEqual(75);
  });

  it('does not accept a strongly transposed phrase as learned', () => {
    const r = analyzeRecording(renderScene(4, [{ phrase: 'A', at: 1.3, opts: { pitch: 1.3 } }], 0.02, 9), templates);
    expect(bestOf(r, 'A')).toBeLessThan(60);
  });

  it('does not confuse different phrases', () => {
    for (const other of ['D', 'E']) {
      const r = analyzeRecording(renderScene(4, [{ phrase: other, at: 1.3 }], 0.02, 9), templates);
      for (const m of r.matches) expect(m.bestSimilarity).toBeLessThan(30);
    }
    const rb = analyzeRecording(renderScene(4, [{ phrase: 'B', at: 1.3 }], 0.02, 9), templates);
    expect(bestOf(rb, 'A')).toBeLessThan(30);
    expect(bestOf(rb, 'C')).toBeLessThan(30);
  });

  it('is independent of loudness (mic distance)', () => {
    const quiet = analyzeRecording(renderScene(4, [{ phrase: 'A', at: 1.3, opts: { amplitude: 0.08 } }], 0.005, 9), templates);
    const loud = analyzeRecording(renderScene(4, [{ phrase: 'A', at: 1.3, opts: { amplitude: 0.6 } }], 0.04, 9), templates);
    expect(Math.abs(bestOf(quiet, 'A') - bestOf(loud, 'A'))).toBeLessThanOrEqual(10);
  });

  it('counts occurrences and locates them in time', () => {
    const rec = renderScene(10, [
      { phrase: 'A', at: 1 },
      { phrase: 'D', at: 3 },
      { phrase: 'A', at: 5 },
      { phrase: 'B', at: 7.5 },
    ], 0.02, 12);
    const r = analyzeRecording(rec, templates);
    const a = r.matches.find((m) => m.templateId === 'A')!;
    expect(a.occurrences).toHaveLength(2);
    expect(a.occurrences[0].startSec).toBeGreaterThan(0.85);
    expect(a.occurrences[0].startSec).toBeLessThan(1.2);
    expect(a.occurrences[1].startSec).toBeGreaterThan(4.85);
    expect(r.matches.find((m) => m.templateId === 'B')!.occurrences).toHaveLength(1);
    expect(r.matches.find((m) => m.templateId === 'C')!.occurrences).toHaveLength(0);
  });

  it('spots an isian embedded inside a longer phrase (continuous singing)', () => {
    // D immediately followed by A with no pause → segmented as one phrase.
    const rec = renderScene(5, [{ phrase: 'D', at: 1 }, { phrase: 'A', at: 1 + phraseDuration(PHRASES.D) + 0.05 }], 0.02, 13);
    const r = analyzeRecording(rec, templates);
    expect(r.metrics.phraseCount).toBe(1);
    expect(bestOf(r, 'A')).toBeGreaterThanOrEqual(75);
  });
});

describe('learning scenario & contest metrics', () => {
  it('reports the expected story: A learned, C getting close, B not yet', () => {
    const tutor = demoTutorTrack();
    // Mark the first three tutor phrases (A, B, C) as targets, like a user tapping them.
    const ph = detectPhrases(tutor);
    const templates = ['A', 'B', 'C'].map((id, i) => prepareTemplate(id, tutor, ph[i].startSec, ph[i].endSec));
    const r = analyzeRecording(demoBirdRecording(), templates);
    const byId = Object.fromEntries(r.matches.map((m) => [m.templateId, m]));
    expect(byId.A.status).toBe('masuk');
    expect(byId.A.occurrences.length).toBe(3);
    expect(byId.C.status).toBe('mirip');
    expect(byId.B.status).toBe('belum');
    // Bird sings A, D, E and a C-like phrase → 4 distinct phrase types.
    expect(r.metrics.variasi).toBe(4);
    expect(r.metrics.phraseCount).toBe(11);
    expect(r.metrics.kerjaPct).toBeGreaterThan(5);
    expect(r.metrics.kerjaPct).toBeLessThan(40);
    expect(r.metrics.loudnessDb).toBeGreaterThan(15);
  });
});

describe('score mapping', () => {
  it('maps cost to a clamped 0–100 similarity and status', () => {
    expect(costToSimilarity(0)).toBe(100);
    expect(costToSimilarity(1)).toBe(0);
    expect(statusFor(85)).toBe('masuk');
    expect(statusFor(60)).toBe('mirip');
    expect(statusFor(20)).toBe('belum');
  });
});
