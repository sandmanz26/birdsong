import { useEffect, useState } from 'react';
import { getProgram, MIN_MATERIAL_DAYS, playedTodaySec, PRESETS } from '../actions';
import { audioContext } from '../audio/decode';
import { db, logEvent } from '../db';
import { useI18n } from '../i18n';
import { useLoad, useNav } from '../nav';
import type { Bird, Program, SessionSlot } from '../types';
import { daysBetween, fmtDateTime, fmtDuration, uid } from '../util';

export function MasteranTab({ bird }: { bird: Bird }) {
  const { t, locale } = useI18n();
  const nav = useNav();
  const { data } = useLoad(async () => {
    const [program, tracks, sessions, used] = await Promise.all([
      getProgram(bird.id),
      db.all('tracks'),
      db.byBird('sessions', bird.id),
      playedTodaySec(bird.id),
    ]);
    return { program, tracks: tracks.sort((a, b) => b.createdAt - a.createdAt), sessions: sessions.sort((a, b) => b.startedAt - a.startedAt), used };
  }, [bird.id]);
  const [program, setProgram] = useState<Program | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(30);

  useEffect(() => {
    if (data) setProgram(data.program);
  }, [data]);

  if (!data || !program) return <p className="muted">{t('loading')}</p>;

  const persist = (p: Program) => {
    setProgram(p);
    void db.put('programs', p);
  };

  const toggleTrack = (trackId: string) => {
    const age = daysBetween(program.materialChangedAt, Date.now());
    // Guardrail (R6): warn when changing material that the bird has been hearing for < 2 weeks.
    // Only once it has actually been played, so initial setup isn't nagged.
    const inUse = program.trackIds.length > 0 && data.sessions.some((s) => s.startedAt >= program.materialChangedAt);
    const warn = inUse && age < MIN_MATERIAL_DAYS;
    if (warn && !confirm(t('materialChangeWarn', { n: age }))) return;
    const trackIds = program.trackIds.includes(trackId) ? program.trackIds.filter((x) => x !== trackId) : [...program.trackIds, trackId];
    persist({ ...program, trackIds, materialChangedAt: inUse || program.trackIds.length === 0 ? Date.now() : program.materialChangedAt });
    logEvent('material_changed', { count: trackIds.length, daysSinceLast: age, warned: warn });
  };

  const updateSlot = (id: string, patch: Partial<SessionSlot>) =>
    persist({ ...program, sessions: program.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const applyPreset = (k: keyof typeof PRESETS) => {
    persist({ ...program, sessions: PRESETS[k].map((s) => ({ ...s, id: uid() })) });
    logEvent('preset_applied', { preset: k });
  };

  const usedMin = Math.round(data.used / 60);
  const materialAge = daysBetween(program.materialChangedAt, Date.now());
  const canPlay = program.trackIds.length > 0;

  const startNow = () => {
    if (!canPlay) return alert(t('needTracks'));
    void audioContext().resume(); // unlock audio inside the user gesture
    if (usedMin + nowMinutes > program.dailyCapMin && !confirm(t('capExceeded', { cap: program.dailyCapMin, used: usedMin }))) return;
    nav({ name: 'player', birdId: bird.id, mode: 'now', minutes: nowMinutes });
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <h3>{t('usageToday')}</h3>
          <span className="small"><strong>{usedMin}</strong> / {program.dailyCapMin} {t('min')}</span>
        </div>
        <div className="meter"><div className="meter-fill" style={{ width: `${Math.min(100, (100 * usedMin) / program.dailyCapMin)}%` }} /></div>
        <div className="row gap wrap">
          <label className="inline-field">
            {t('sessionMinutesPrompt')}
            <select value={nowMinutes} onChange={(e) => setNowMinutes(Number(e.target.value))}>
              {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} {t('min')}</option>)}
            </select>
          </label>
        </div>
        <div className="row gap">
          <button className="btn primary grow" onClick={startNow} disabled={!canPlay}>▶ {t('startNow')}</button>
          <button className="btn grow" onClick={() => {
              void audioContext().resume();
              nav({ name: 'player', birdId: bird.id, mode: 'standby' });
            }} disabled={!canPlay}>
            ☾ {t('standby')}
          </button>
        </div>
        <p className="muted small">{t('standbyHint')}</p>
      </section>

      <section className="card">
        <h3>{t('material')}</h3>
        <p className="muted small">{t('materialHint')}</p>
        {data.tracks.length === 0 ? (
          <div className="notice">
            {t('noTracks')} <button className="link-btn" onClick={() => nav({ name: 'library' })}>{t('goLibrary')} →</button>
          </div>
        ) : (
          <ul className="checklist">
            {data.tracks.map((tr) => (
              <li key={tr.id}>
                <label>
                  <input type="checkbox" checked={program.trackIds.includes(tr.id)} onChange={() => toggleTrack(tr.id)} />
                  <span className="grow">{tr.name} {tr.source === 'demo' && <span className="badge">{t('demoBadge')}</span>}</span>
                  <span className="muted small">{fmtDuration(tr.durationSec)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {program.trackIds.length > 0 && (
          <p className={'small ' + (materialAge < MIN_MATERIAL_DAYS ? 'muted' : 'good-text')}>
            {t('materialAge', { n: materialAge })}. {t('materialTip')}
          </p>
        )}
      </section>

      <section className="card">
        <div className="row between wrap">
          <h3>{t('schedule')}</h3>
          <div className="seg small">
            <button onClick={() => applyPreset('pagi')}>{t('presetPagi')}</button>
            <button onClick={() => applyPreset('malam')}>{t('presetMalam')}</button>
            <button onClick={() => applyPreset('pagiMalam')}>{t('presetPagiMalam')}</button>
          </div>
        </div>
        {program.sessions.map((s) => (
          <div className="slot" key={s.id}>
            <label className="inline-field">
              {t('start')}
              <input type="time" value={s.start} onChange={(e) => updateSlot(s.id, { start: e.target.value })} />
            </label>
            <label className="inline-field">
              {t('duration')}
              <select value={s.minutes} onChange={(e) => updateSlot(s.id, { minutes: Number(e.target.value) })}>
                {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m} {t('min')}</option>)}
              </select>
            </label>
            <label className="inline-field grow">
              {t('volume')} {Math.round(s.volume * 100)}%
              <input type="range" min={0.1} max={1} step={0.05} value={s.volume} onChange={(e) => updateSlot(s.id, { volume: Number(e.target.value) })} />
            </label>
            <button className="icon-btn" aria-label={t('delete')} onClick={() => persist({ ...program, sessions: program.sessions.filter((x) => x.id !== s.id) })}>✕</button>
            {bird.phase === 'mabung' && s.volume > 0.6 && <p className="warn small full">⚠ {t('mabungWarn')}</p>}
          </div>
        ))}
        <button className="btn small" onClick={() => persist({ ...program, sessions: [...program.sessions, { id: uid(), start: '12:00', minutes: 30, volume: 0.5 }] })}>
          + {t('addSession')}
        </button>
        <button className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>{t('advanced')} {showAdvanced ? '▴' : '▾'}</button>
        {showAdvanced && (
          <div className="stack">
            <label className="field">
              <span>{t('gapRange')}: {program.gapMinSec}–{program.gapMaxSec}</span>
              <div className="row gap">
                <input type="number" min={0} max={60} value={program.gapMinSec} onChange={(e) => persist({ ...program, gapMinSec: Math.min(Number(e.target.value), program.gapMaxSec) })} />
                <input type="number" min={1} max={120} value={program.gapMaxSec} onChange={(e) => persist({ ...program, gapMaxSec: Math.max(Number(e.target.value), program.gapMinSec) })} />
              </div>
            </label>
            <label className="field">
              <span>{t('dailyCap')}</span>
              <input type="number" min={15} max={600} step={15} value={program.dailyCapMin} onChange={(e) => persist({ ...program, dailyCapMin: Math.max(15, Number(e.target.value)) })} />
              <span className="muted small">{t('capHint')}</span>
            </label>
          </div>
        )}
      </section>

      <section className="card">
        <h3>{t('sessionLog')}</h3>
        {data.sessions.length === 0 ? (
          <p className="muted small">{t('noSessions')}</p>
        ) : (
          <ul className="log">
            {data.sessions.slice(0, 10).map((s) => (
              <li key={s.id}>
                <span>{fmtDateTime(s.startedAt, locale)}</span>
                <span className="muted small">{s.trigger === 'manual' ? t('manual') : t('scheduled')}</span>
                <span><strong>{fmtDuration(s.playedSec)}</strong> {t('played')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
