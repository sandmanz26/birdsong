/** Full-screen masteran player and Stand-by mode (PRD F1.4–F1.7). */
import { useEffect, useRef, useState } from 'react';
import { getProgram, playedTodaySec } from '../actions';
import { MasteranEngine, WakeLock, type EngineStatus } from '../audio/engine';
import { audioContext } from '../audio/decode';
import { planSession } from '../audio/planner';
import { db, logEvent } from '../db';
import { useI18n } from '../i18n';
import { useNav } from '../nav';
import type { Bird, Program, SessionSlot, Track } from '../types';
import { fmtDuration, nextOccurrence, uid } from '../util';

interface Running {
  engine: MasteranEngine;
  startedAt: number;
  trigger: 'manual' | 'schedule';
  slotId?: string;
}

export function Player({ birdId, mode, minutes }: { birdId: string; mode: 'now' | 'standby'; minutes?: number }) {
  const { t } = useI18n();
  const nav = useNav();
  const [bird, setBird] = useState<Bird>();
  const [program, setProgram] = useState<Program>();
  const [tracks, setTracks] = useState<Map<string, Track>>(new Map());
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [wakeOk, setWakeOk] = useState<boolean | null>(null);
  const [volume, setVolume] = useState(0.5);
  const running = useRef<Running | null>(null);
  const wake = useRef(new WakeLock());
  const firedSlots = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      setBird(await db.get('birds', birdId));
      setProgram(await getProgram(birdId));
      setTracks(new Map((await db.all('tracks')).map((tr) => [tr.id, tr])));
    })();
  }, [birdId]);

  // Keep the screen on while this screen is open.
  useEffect(() => {
    const w = wake.current;
    void w.acquire().then(setWakeOk);
    return () => w.release();
  }, []);

  const startSession = async (sessionMin: number, vol: number, trigger: Running['trigger'], slotId?: string) => {
    if (!program || running.current) return;
    const capLeftSec = program.dailyCapMin * 60 - (await playedTodaySec(birdId));
    // Scheduled sessions respect the daily cap automatically (manual starts were confirmed already).
    let sessionSec = sessionMin * 60;
    if (trigger === 'schedule') {
      if (capLeftSec < 60) {
        setMessage(t('capReachedSkip'));
        logEvent('session_skipped_cap', { birdId });
        return;
      }
      // Playback is ~half of wall time (gaps), so cap wall time at 2× remaining playback budget.
      sessionSec = Math.min(sessionSec, capLeftSec * 2);
    }
    const blobs = new Map<string, Blob>();
    for (const id of program.trackIds) {
      const b = await db.getBlob('track:' + id);
      if (b) blobs.set(id, b);
    }
    const plan = planSession(
      program.trackIds.filter((id) => tracks.has(id) && blobs.has(id)).map((id) => ({ id, durationSec: tracks.get(id)!.durationSec })),
      { sessionSec, gapMinSec: program.gapMinSec, gapMaxSec: program.gapMaxSec, seed: Date.now() % 100000 },
    );
    const engine = new MasteranEngine();
    const startedAt = Date.now();
    running.current = { engine, startedAt, trigger, slotId };
    setVolume(vol);
    setMessage(null);
    engine.onStatus = setStatus;
    engine.onEnd = async (playedSec) => {
      await db.put('sessions', { id: uid(), birdId, startedAt, endedAt: Date.now(), playedSec, trackIds: [...blobs.keys()], trigger });
      logEvent('session_ended', { trigger, plannedMin: Math.round(sessionSec / 60), playedSec, wallSec: Math.round((Date.now() - startedAt) / 1000) });
      running.current = null;
      if (!mounted.current) return;
      setStatus(null);
      setMessage(t('sessionDone', { d: fmtDuration(playedSec) }));
      if (mode === 'now') setTimeout(() => nav({ name: 'bird', id: birdId, tab: 'masteran' }), 2500);
    };
    await engine.start(plan, blobs, sessionSec, vol);
    logEvent('session_started', { trigger, minutes: Math.round(sessionSec / 60), tracks: blobs.size, volume: vol });
  };

  // Manual start: needs the user gesture that brought us here (AudioContext was created on tap).
  useEffect(() => {
    if (mode === 'now' && program && tracks.size && !running.current) {
      const first = program.sessions[0];
      void startSession(minutes ?? 30, first?.volume ?? 0.5, 'manual');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, program, tracks]);

  // Stand-by scheduler: check every 5 s whether a slot is due (fires within 2 min of its start).
  useEffect(() => {
    if (mode !== 'standby' || !program) return;
    void audioContext().resume();
    const tick = () => {
      setNow(Date.now());
      if (running.current) return;
      for (const slot of program.sessions) {
        const due = nextOccurrence(slot.start, Date.now() - 120000);
        const key = `${slot.id}@${due}`;
        if (Date.now() >= due && Date.now() - due < 120000 && !firedSlots.current.has(key)) {
          firedSlots.current.add(key);
          void startSession(slot.minutes, slot.volume, 'schedule', slot.id);
          break;
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, program, tracks]);

  // Stop on unmount.
  useEffect(() => () => running.current?.engine.stop(), []);

  if (!bird || !program) return <p className="muted pad">{t('loading')}</p>;

  const nextSlot: { slot: SessionSlot; at: number } | null = program.sessions.length
    ? program.sessions.map((slot) => ({ slot, at: nextOccurrence(slot.start, now) })).sort((a, b) => a.at - b.at)[0]
    : null;
  const nowTrack = status?.nowPlaying ? tracks.get(status.nowPlaying)?.name : null;

  return (
    <div className="player">
      <p className="muted small">{bird.name}</p>
      {status ? (
        <>
          <div className="pulse" aria-hidden data-active={!!nowTrack} />
          <h2>{t('playing')}</h2>
          <p className="big-time">{fmtDuration(status.elapsedSec)}</p>
          <p className="muted">
            {fmtDuration(Math.max(0, status.sessionSec - status.elapsedSec))} {t('remaining')}
          </p>
          <p className="now-playing" aria-live="polite">{nowTrack ? `♪ ${nowTrack}` : t('naturalPause')}</p>
          <label className="field wide">
            <span>{t('volume')} {Math.round(volume * 100)}%</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                running.current?.engine.setVolume(v);
              }}
            />
          </label>
          {bird.phase === 'mabung' && volume > 0.6 && <p className="warn small">⚠ {t('mabungWarn')}</p>}
          <button className="btn danger wide" onClick={() => running.current?.engine.stop()}>■ {t('stop')}</button>
        </>
      ) : (
        <>
          {mode === 'standby' && nextSlot && (
            <>
              <div className="moon" aria-hidden>☾</div>
              <h2>{t('waitingNext')}</h2>
              <p className="big-time">{nextSlot.slot.start}</p>
              <p className="muted">{t('inTime', { t: fmtDuration((nextSlot.at - now) / 1000) })} · {nextSlot.slot.minutes} {t('min')}</p>
              <button className="btn primary wide" onClick={() => void startSession(nextSlot.slot.minutes, nextSlot.slot.volume, 'manual')}>
                ▶ {t('startNow')}
              </button>
            </>
          )}
          {message && <p className="notice">{message}</p>}
        </>
      )}
      <p className={'small ' + (wakeOk === false ? 'warn' : 'muted')}>{wakeOk === false ? t('screenOnFail') : wakeOk ? `☀ ${t('screenOn')}` : ''}</p>
      <button className="btn ghost wide" onClick={() => nav({ name: 'bird', id: birdId, tab: 'masteran' })}>
        {mode === 'standby' ? t('exitStandby') : t('close')}
      </button>
    </div>
  );
}
