import { describe, expect, it } from 'vitest';
import { planSession, plannedPlaySeconds } from '../src/audio/planner';

const short = [
  { id: 'a', durationSec: 4 },
  { id: 'b', durationSec: 6 },
  { id: 'c', durationSec: 3 },
];
const base = { sessionSec: 600, gapMinSec: 2, gapMaxSec: 8, seed: 42 };

describe('planSession', () => {
  it('never runs past the session length', () => {
    for (let seed = 1; seed < 50; seed++) {
      const plan = planSession(short, { ...base, seed });
      for (const p of plan) expect(p.at + p.length).toBeLessThanOrEqual(600 + 1e-6);
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(planSession(short, base)).toEqual(planSession(short, base));
    expect(planSession(short, base)).not.toEqual(planSession(short, { ...base, seed: 43 }));
  });

  it('never plays the same clip twice in a row when alternatives exist', () => {
    for (let seed = 1; seed < 50; seed++) {
      const plan = planSession(short, { ...base, seed });
      for (let i = 1; i < plan.length; i++) expect(plan[i].trackId).not.toBe(plan[i - 1].trackId);
    }
  });

  it('balances the clips (shuffle-bag)', () => {
    const plan = planSession(short, { ...base, sessionSec: 3600 });
    const counts = new Map<string, number>();
    for (const p of plan) counts.set(p.trackId, (counts.get(p.trackId) ?? 0) + 1);
    const values = [...counts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it('inserts natural gaps within the configured range and never boosts the level', () => {
    const plan = planSession(short, base);
    for (let i = 1; i < plan.length; i++) {
      const gap = plan[i].at - (plan[i - 1].at + plan[i - 1].length);
      expect(gap).toBeGreaterThanOrEqual(2 - 1e-3);
      expect(gap).toBeLessThanOrEqual(8 + 1e-3);
    }
    for (const p of plan) {
      expect(p.gainDb).toBeLessThanOrEqual(0);
      expect(p.gainDb).toBeGreaterThanOrEqual(-3);
    }
  });

  it('plays long tracks as blocks with longer pauses and random entry points', () => {
    const plan = planSession([{ id: 'long', durationSec: 3600 }], { ...base, sessionSec: 1800 });
    expect(plan).toHaveLength(1);
    expect(plan[0].length).toBe(1800);
    expect(plan[0].offset).toBeGreaterThanOrEqual(0);
    expect(plan[0].offset).toBeLessThanOrEqual(1800);

    const mixed = planSession([{ id: 'long', durationSec: 120 }, { id: 'a', durationSec: 4 }], { ...base, sessionSec: 900 });
    for (let i = 1; i < mixed.length; i++) {
      if (mixed[i - 1].trackId === 'long') {
        const gap = mixed[i].at - (mixed[i - 1].at + mixed[i - 1].length);
        expect(gap).toBeGreaterThanOrEqual(10 - 1e-3);
      }
    }
  });

  it('fills a reasonable share of the session with sound', () => {
    const plan = planSession(short, base);
    const ratio = plannedPlaySeconds(plan) / 600;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.8);
  });

  it('handles empty input', () => {
    expect(planSession([], base)).toEqual([]);
    expect(planSession(short, { ...base, sessionSec: 0 })).toEqual([]);
  });
});
