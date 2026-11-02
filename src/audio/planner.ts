/**
 * Session planner: turns a set of masteran tracks into a timeline that sounds like a tutor, not a tape
 * loop (research R8): shuffled order without back-to-back repeats, natural silent gaps, slight level
 * variation, random entry points into long tracks. Pure + seeded so it is testable and reproducible.
 */
import { mulberry32 } from './random';

export interface PlanTrack {
  id: string;
  durationSec: number;
}

export interface PlanOptions {
  sessionSec: number;
  /** Silence between short clips (s). */
  gapMinSec: number;
  gapMaxSec: number;
  /** Clips longer than this are "long tracks": played as a whole block with a longer pause after. */
  longClipSec?: number;
  longGapMinSec?: number;
  longGapMaxSec?: number;
  /** Per-item level variation: gain drawn from [-levelJitterDb, 0] dB (never boosts, so never clips). */
  levelJitterDb?: number;
  seed: number;
}

export interface PlanItem {
  trackId: string;
  /** Seconds from session start. */
  at: number;
  /** Offset into the track (s). */
  offset: number;
  /** Seconds to play. */
  length: number;
  gainDb: number;
}

export function planSession(tracks: PlanTrack[], o: PlanOptions): PlanItem[] {
  const usable = tracks.filter((t) => t.durationSec > 0.05);
  if (usable.length === 0 || o.sessionSec <= 0) return [];
  const rnd = mulberry32(o.seed);
  const longClip = o.longClipSec ?? 60;
  const longGapMin = o.longGapMinSec ?? 10;
  const longGapMax = o.longGapMaxSec ?? 30;
  const jitter = o.levelJitterDb ?? 3;
  const uniform = (a: number, b: number) => a + (b - a) * rnd();

  const items: PlanItem[] = [];
  let bag: PlanTrack[] = [];
  let last: string | null = null;
  let t = 0;

  const refill = () => {
    bag = usable.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // Avoid the same track twice in a row across bag boundaries.
    if (bag.length > 1 && bag[bag.length - 1].id === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  };

  // Safety bound: even 0.05 s clips can't create an unbounded loop.
  for (let guard = 0; guard < 100000; guard++) {
    if (bag.length === 0) refill();
    const track = bag.pop()!;
    const remaining = o.sessionSec - t;
    const length = Math.min(track.durationSec, remaining);
    // Stop when what's left can't hold a meaningful play (≥3 s, or the whole clip if shorter).
    if (length < Math.min(3, track.durationSec) || remaining <= 0) break;
    const offset = track.durationSec > length ? Math.round(uniform(0, track.durationSec - length) * 10) / 10 : 0;
    items.push({
      trackId: track.id,
      at: Math.round(t * 1000) / 1000,
      offset,
      length: Math.round(length * 1000) / 1000,
      gainDb: Math.round(-uniform(0, jitter) * 10) / 10,
    });
    last = track.id;
    const isLong = track.durationSec > longClip;
    t += length + (isLong ? uniform(longGapMin, longGapMax) : uniform(o.gapMinSec, o.gapMaxSec));
  }
  return items;
}

export const plannedPlaySeconds = (plan: PlanItem[]) => plan.reduce((s, p) => s + p.length, 0);
