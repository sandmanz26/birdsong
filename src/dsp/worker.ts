/// <reference lib="webworker" />
import { analyzeRecording, detectPhrases, prepareTemplate, type PreparedTemplate } from './analyze';
import { displaySpectrogram } from './spectrogram';

export type WorkerRequest =
  | { id: number; type: 'spectrogram'; samples: Float32Array; maxCols?: number }
  | { id: number; type: 'phrases'; samples: Float32Array }
  | { id: number; type: 'prepare'; windows: { id: string; window: Float32Array; startSec: number; endSec: number }[] }
  | { id: number; type: 'analyzePrepared'; samples: Float32Array; templates: PreparedTemplate[] };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'spectrogram') {
      const s = displaySpectrogram(msg.samples, undefined, undefined, msg.maxCols);
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value: s }, [s.data.buffer]);
    } else if (msg.type === 'phrases') {
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value: detectPhrases(msg.samples) });
    } else if (msg.type === 'prepare') {
      const value = msg.windows.map((t) => prepareTemplate(t.id, t.window, t.startSec, t.endSec));
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value });
    } else if (msg.type === 'analyzePrepared') {
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true, value: analyzeRecording(msg.samples, msg.templates) });
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, error: String(err) });
  }
};
