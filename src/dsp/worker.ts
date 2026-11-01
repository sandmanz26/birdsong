/// <reference lib="webworker" />
import { analyzeRecording, detectPhrases, prepareTemplate } from './analyze';
import { displaySpectrogram } from './spectrogram';

export type WorkerRequest =
  | { id: number; type: 'spectrogram'; samples: Float32Array; maxCols?: number }
  | { id: number; type: 'phrases'; samples: Float32Array }
  | {
      id: number;
      type: 'analyze';
      samples: Float32Array;
      /** Each template comes with a context window of its tutor track (not the whole track). */
      templates: { id: string; window: Float32Array; startSec: number; endSec: number }[];
    };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'spectrogram') {
      const s = displaySpectrogram(msg.samples, undefined, undefined, msg.maxCols);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value: s }, [s.data.buffer]);
    } else if (msg.type === 'phrases') {
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value: detectPhrases(msg.samples) });
    } else if (msg.type === 'analyze') {
      const templates = msg.templates.map((t) => prepareTemplate(t.id, t.window, t.startSec, t.endSec));
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value: analyzeRecording(msg.samples, templates) });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, error: String(err) });
  }
};
