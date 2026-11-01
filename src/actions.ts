/** Domain operations shared by screens. */
import { decodeCached, decodeMono, MAX_EDITABLE_SEC } from './audio/decode';
import { db, logEvent } from './db';
import { workerAnalyze } from './dsp/client';
import { SR } from './dsp/spectrogram';
import type { Bird, Check, Isian, Program, SessionSlot, Track } from './types';
import { startOfDay, uid } from './util';

export const PRESETS: Record<'pagi' | 'malam' | 'pagiMalam', Omit<SessionSlot, 'id'>[]> = {
  pagi: [{ start: '06:30', minutes: 60, volume: 0.7 }],
  malam: [{ start: '19:00', minutes: 60, volume: 0.35 }],
  pagiMalam: [
    { start: '06:30', minutes: 60, volume: 0.7 },
    { start: '19:00', minutes: 60, volume: 0.35 },
  ],
};

/** Research R6: keep masteran material 2–4 weeks before changing. */
export const MIN_MATERIAL_DAYS = 14;

export function defaultProgram(birdId: string): Program {
  return {
    birdId,
    trackIds: [],
    isianIds: [],
    sessions: PRESETS.pagiMalam.map((s) => ({ ...s, id: uid() })),
    gapMinSec: 2,
    gapMaxSec: 8,
    dailyCapMin: 180,
    materialChangedAt: Date.now(),
  };
}

export async function getProgram(birdId: string): Promise<Program> {
  return (await db.get('programs', birdId)) ?? defaultProgram(birdId);
}

export async function saveBird(bird: Bird) {
  const isNew = !(await db.get('birds', bird.id));
  await db.put('birds', bird);
  if (isNew) {
    await db.put('programs', defaultProgram(bird.id));
    logEvent('bird_created', { species: bird.species, phase: bird.phase, origin: bird.origin });
  }
}

export async function deleteBird(id: string) {
  for (const c of await db.byBird('checks', id)) {
    await db.delete('checks', c.id);
    await db.delete('blobs', 'check:' + c.id);
  }
  for (const s of await db.byBird('sessions', id)) await db.delete('sessions', s.id);
  await db.delete('programs', id);
  await db.delete('birds', id);
}

export async function deleteTrack(id: string) {
  for (const i of await db.all('isian')) if (i.trackId === id) await db.delete('isian', i.id);
  for (const p of await db.all('programs')) {
    if (p.trackIds.includes(id)) await db.put('programs', { ...p, trackIds: p.trackIds.filter((x) => x !== id) });
  }
  await db.delete('blobs', 'track:' + id);
  await db.delete('tracks', id);
}

export async function trackSamples(track: Track): Promise<Float32Array> {
  if (track.durationSec > MAX_EDITABLE_SEC) throw new Error('too-long');
  const blob = await db.getBlob('track:' + track.id);
  if (!blob) throw new Error('missing');
  return decodeCached(track.id, blob);
}

export async function playedTodaySec(birdId: string): Promise<number> {
  const since = startOfDay();
  return (await db.byBird('sessions', birdId)).filter((s) => s.startedAt >= since).reduce((n, s) => n + s.playedSec, 0);
}

/** Run "Cek Isian" on a recording and store the result (PRD F2). */
export async function runCheck(birdId: string, blob: Blob, source: Check['source']): Promise<Check> {
  const program = await getProgram(birdId);
  const samples = await decodeMono(blob);
  const allIsian = await db.all('isian');
  const tracks = new Map((await db.all('tracks')).map((t) => [t.id, t]));
  const targets: Isian[] = program.isianIds.map((id) => allIsian.find((i) => i.id === id)).filter((i): i is Isian => !!i);
  const templates = [];
  for (const isian of targets) {
    const track = tracks.get(isian.trackId);
    if (!track) continue;
    templates.push({ id: isian.id, track: await trackSamples(track), startSec: isian.startSec, endSec: isian.endSec });
  }
  const t0 = performance.now();
  const result = await workerAnalyze(samples, templates);
  const check: Check = {
    id: uid(),
    birdId,
    createdAt: Date.now(),
    source,
    durationSec: samples.length / SR,
    result,
    isianNames: Object.fromEntries(targets.map((i) => [i.id, i.name])),
    feedback: {},
  };
  await db.putBlob('check:' + check.id, blob);
  await db.put('checks', check);
  logEvent('check_completed', {
    source,
    durationSec: Math.round(check.durationSec),
    targets: templates.length,
    ms: Math.round(performance.now() - t0),
    statuses: result.matches.map((m) => m.status),
  });
  return check;
}
