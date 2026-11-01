/**
 * Masteran playback engine.
 *
 * Tracks play through <audio> elements (streamed from IndexedDB blobs, so hour-long masteran files don't
 * have to be decoded into memory), routed through Web Audio for per-item gain and a master gain with
 * sample-accurate session fades (PRD F1.4). A 250 ms tick drives the plan; with the screen awake (Wake
 * Lock in Stand-by) timers are not throttled, and gaps of seconds tolerate tick jitter.
 */
import { audioContext } from './decode';
import type { PlanItem } from './planner';

export interface EngineStatus {
  elapsedSec: number;
  sessionSec: number;
  nowPlaying: string | null;
  playedSec: number;
}

interface Voice {
  el: HTMLAudioElement;
  gain: GainNode;
  url: string;
}

const FADE_SEC = 30;
const ITEM_FADE_SEC = 0.05;

export class MasteranEngine {
  private ctx = audioContext();
  private master: GainNode;
  private voices = new Map<string, Voice>();
  private timer: number | undefined;
  private startedAt = 0; // ctx time
  private plan: PlanItem[] = [];
  private sessionSec = 0;
  private volume = 0.5;
  private active = new Set<number>();
  private done = new Set<number>();
  private playedSec = 0;
  private finished = false;
  onStatus?: (s: EngineStatus) => void;
  onEnd?: (playedSec: number) => void;

  constructor() {
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
  }

  async start(plan: PlanItem[], blobs: Map<string, Blob>, sessionSec: number, volume: number) {
    await this.ctx.resume();
    this.plan = plan;
    this.sessionSec = sessionSec;
    this.volume = volume;
    for (const [id, blob] of blobs) {
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.preload = 'auto';
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.master);
      this.voices.set(id, { el, gain, url });
    }
    this.startedAt = this.ctx.currentTime + 0.2;
    this.scheduleMasterEnvelope();
    this.timer = window.setInterval(() => this.tick(), 250);
    this.tick();
  }

  private scheduleMasterEnvelope() {
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    const end = this.startedAt + this.sessionSec;
    const fade = Math.min(FADE_SEC, this.sessionSec / 4);
    g.cancelScheduledValues(now);
    const elapsed = Math.max(0, now - this.startedAt);
    if (elapsed < fade) {
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(this.volume, this.startedAt + fade);
    } else {
      g.setTargetAtTime(this.volume, now, 0.1);
    }
    g.setValueAtTime(this.volume, Math.max(now + 0.5, end - fade));
    g.linearRampToValueAtTime(0, end);
  }

  setVolume(v: number) {
    this.volume = v;
    if (!this.finished) this.scheduleMasterEnvelope();
  }

  private tick() {
    const t = this.ctx.currentTime - this.startedAt;
    let nowPlaying: string | null = null;
    this.plan.forEach((item, i) => {
      if (this.done.has(i)) return;
      const voice = this.voices.get(item.trackId);
      if (!voice) return;
      const g = voice.gain.gain;
      if (!this.active.has(i) && t >= item.at && t < item.at + item.length) {
        this.active.add(i);
        voice.el.currentTime = item.offset + (t - item.at);
        void voice.el.play().catch(() => undefined);
        const now = this.ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(10 ** (item.gainDb / 20), now + ITEM_FADE_SEC);
      }
      if (this.active.has(i)) {
        nowPlaying = item.trackId;
        if (t >= item.at + item.length || voice.el.ended) {
          const now = this.ctx.currentTime;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(0, now + ITEM_FADE_SEC);
          window.setTimeout(() => voice.el.pause(), ITEM_FADE_SEC * 1000 + 30);
          this.active.delete(i);
          this.done.add(i);
          this.playedSec += item.length;
        }
      }
    });
    this.onStatus?.({ elapsedSec: Math.max(0, t), sessionSec: this.sessionSec, nowPlaying, playedSec: this.playedSec });
    if (t >= this.sessionSec + 0.5) this.finish();
  }

  /** Fade out over 2 s and stop. */
  stop() {
    if (this.finished) return;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 2);
    // Count partially played items.
    const t = now - this.startedAt;
    this.active.forEach((i) => (this.playedSec += Math.max(0, Math.min(this.plan[i].length, t - this.plan[i].at))));
    this.active.clear();
    window.setTimeout(() => this.finish(), 2100);
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    window.clearInterval(this.timer);
    for (const v of this.voices.values()) {
      v.el.pause();
      v.gain.disconnect();
      URL.revokeObjectURL(v.url);
    }
    this.master.disconnect();
    this.onEnd?.(Math.round(this.playedSec));
  }
}

/** Screen Wake Lock helper (Stand-by mode). Re-acquires when the page becomes visible again. */
export class WakeLock {
  private lock: WakeLockSentinel | null = null;
  private wanted = false;
  private onVis = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };
  get supported() {
    return 'wakeLock' in navigator;
  }
  async acquire() {
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVis);
    try {
      this.lock = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }
  release() {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVis);
    void this.lock?.release().catch(() => undefined);
    this.lock = null;
  }
}
