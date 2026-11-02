import { resampleLinear, SR } from '../dsp/spectrogram';

/** Tracks longer than this are playable but not decoded in full for the isian editor (phone memory). */
export const MAX_EDITABLE_SEC = 5 * 60;

let shared: AudioContext | null = null;
export function audioContext(): AudioContext {
  if (!shared) shared = new AudioContext({ latencyHint: 'playback' });
  return shared;
}

/** Duration via a media element: works for long files without decoding them. */
export function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      if (Number.isFinite(d)) resolve(d);
      else {
        // Some recorder outputs (webm) report Infinity until fully scanned: fall back to decoding.
        decodeMono(blob).then((x) => resolve(x.length / SR), reject);
      }
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unsupported'));
    };
    el.src = url;
  });
}

/** Decode any browser-supported audio/video file to mono Float32 at the analysis rate (22.05 kHz). */
export async function decodeMono(blob: Blob): Promise<Float32Array> {
  const ctx = audioContext();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  // Let the browser resample (higher quality than linear) where possible.
  try {
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * SR)), SR);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination); // down-mixes to mono
    src.start();
    const out = await off.startRendering();
    return out.getChannelData(0).slice();
  } catch {
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
    }
    return resampleLinear(mono, buf.sampleRate, SR);
  }
}

/** Small cache so the editor/analysis don't decode the same track repeatedly. */
const cache = new Map<string, Promise<Float32Array>>();
export function decodeCached(key: string, blob: Blob): Promise<Float32Array> {
  if (!cache.has(key)) {
    if (cache.size > 6) cache.delete(cache.keys().next().value!);
    cache.set(key, decodeMono(blob).catch((e) => {
      cache.delete(key);
      throw e;
    }));
  }
  return cache.get(key)!;
}

/** Play a short excerpt of a blob (preview / "listen to this occurrence"). Returns a stop function. */
export function playExcerpt(blob: Blob, startSec: number, endSec?: number, onEnd?: () => void): () => void {
  const el = new Audio(URL.createObjectURL(blob));
  let timer: number | undefined;
  const stop = () => {
    window.clearTimeout(timer);
    el.pause();
    URL.revokeObjectURL(el.src);
    onEnd?.();
  };
  el.currentTime = startSec;
  el.onended = stop;
  el.play().catch(stop);
  if (endSec !== undefined) timer = window.setTimeout(stop, Math.max(100, (endSec - startSec) * 1000 + 150));
  return stop;
}
