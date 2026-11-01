/** Promise wrapper around the analysis Web Worker (keeps the UI responsive, PRD F2.2). */
import type { AnalysisResult } from './analyze';
import { SR, type Matrix } from './spectrogram';

export type DisplaySpec = Matrix & { secPerCol: number };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; value?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.value);
      else p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

function call<T>(msg: Record<string, unknown>): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ ...msg, id });
  });
}

// Samples are copied (not transferred) because callers keep them cached for playback/analysis.
export const workerSpectrogram = (samples: Float32Array, maxCols = 1600) => call<DisplaySpec>({ type: 'spectrogram', samples, maxCols });
export const workerPhrases = (samples: Float32Array) => call<{ startSec: number; endSec: number }[]>({ type: 'phrases', samples });

const CONTEXT_SEC = 15;
export function workerAnalyze(samples: Float32Array, templates: { id: string; track: Float32Array; startSec: number; endSec: number }[]) {
  const t = templates.map((tpl) => {
    const from = Math.max(0, Math.floor((tpl.startSec - CONTEXT_SEC) * SR));
    const to = Math.min(tpl.track.length, Math.ceil((tpl.endSec + CONTEXT_SEC) * SR));
    return { id: tpl.id, window: tpl.track.slice(from, to), startSec: tpl.startSec - from / SR, endSec: tpl.endSec - from / SR };
  });
  return call<AnalysisResult>({ type: 'analyze', samples, templates: t });
}
