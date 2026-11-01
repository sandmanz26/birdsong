/** Domain operations shared by screens. */
import { decodeCached, decodeMono, MAX_EDITABLE_SEC, probeDuration } from './audio/decode';
import { db, logEvent } from './db';
import { workerAnalyze, workerPhrases } from './dsp/client';
import { SR } from './dsp/spectrogram';
import { demoBirdRecording, demoTutorTrack, renderScene } from './dsp/synth';
import type { Bird, Check, Isian, Program, SessionSlot, Track } from './types';
import { encodeWav, startOfDay, uid } from './util';

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

export async function importTrack(file: File | Blob, name: string, source: Track['source'] = 'import'): Promise<Track> {
  const durationSec = await probeDuration(file);
  const track: Track = { id: uid(), name, durationSec, mime: file.type || 'audio/*', size: file.size, source, createdAt: Date.now() };
  await db.putBlob('track:' + track.id, file);
  await db.put('tracks', track);
  logEvent('track_imported', { durationSec: Math.round(durationSec), mime: track.mime, source });
  return track;
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

/**
 * One-tap demo (PRD F2.4): a demo bird, a synthetic tutor track with 3 marked isian, a program, a few
 * logged sessions and one analysed check. Clearly labelled "Demo"; synthetic audio is never offered as
 * training material.
 */
export async function createDemo(names: { bird: string; track: string; isian: [string, string, string] }): Promise<Bird> {
  const tutor = demoTutorTrack();
  const track = await importTrack(encodeWav(tutor, SR), names.track, 'demo');
  const phrases = await workerPhrases(tutor);
  const isian: Isian[] = names.isian.map((name, i) => ({
    id: uid(),
    trackId: track.id,
    name,
    startSec: phrases[i].startSec,
    endSec: phrases[i].endSec,
    createdAt: Date.now(),
  }));
  for (const i of isian) await db.put('isian', i);
  const bird: Bird = { id: uid(), name: names.bird, species: 'murai_batu', phase: 'trotolan', origin: 'tangkaran', ring: 'DEMO-001', demo: true, createdAt: Date.now() };
  await saveBird(bird);
  const program = { ...defaultProgram(bird.id), trackIds: [track.id], isianIds: isian.map((i) => i.id), materialChangedAt: Date.now() - 9 * 86400000 };
  await db.put('programs', program);
  // A week of plausible session history so the Progress view isn't empty.
  for (let d = 6; d >= 0; d--) {
    for (const slot of program.sessions) {
      const [h, m] = slot.start.split(':').map(Number);
      const start = new Date(startOfDay(Date.now() - d * 86400000));
      start.setHours(h, m);
      if (start.getTime() > Date.now()) continue;
      const played = slot.minutes * 60 * (0.45 + 0.1 * Math.sin(d + h));
      await db.put('sessions', {
        id: uid(),
        birdId: bird.id,
        startedAt: start.getTime(),
        endedAt: start.getTime() + slot.minutes * 60000,
        playedSec: Math.round(played),
        trackIds: [track.id],
        trigger: 'schedule',
      });
    }
  }
  // Two earlier, weaker checks (A imitated off-pitch, no C yet) to show a learning curve.
  const early = (pitch: number, seed: number) =>
    renderScene(30, [
      { phrase: 'D', at: 1 }, { phrase: 'E', at: 4 }, { phrase: 'A', at: 7, opts: { pitch } },
      { phrase: 'D', at: 11 }, { phrase: 'E', at: 15 }, { phrase: 'D', at: 20 }, { phrase: 'E', at: 25 },
    ], 0.012, seed);
  for (const [daysAgo, pitch] of [[14, 1.3], [7, 1.2]] as const) {
    const c = await runCheck(bird.id, encodeWav(early(pitch, daysAgo), SR), 'demo');
    await db.put('checks', { ...c, createdAt: Date.now() - daysAgo * 86400000 });
  }
  await runCheck(bird.id, encodeWav(demoBirdRecording(), SR), 'demo');
  logEvent('demo_created');
  return bird;
}
