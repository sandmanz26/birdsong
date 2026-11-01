import { useEffect, useRef, useState } from 'react';
import { getProgram, runCheck } from '../actions';
import { BirdRecorder } from '../audio/recorder';
import { seriesColor } from '../components/Charts';
import { db, logEvent } from '../db';
import { useI18n } from '../i18n';
import { useLoad, useNav } from '../nav';
import type { Bird } from '../types';
import { fmtDateTime, fmtDuration } from '../util';
import { CheckResult, isianColorIndex, StatusChips } from './CheckResult';

const MAX_RECORD_SEC = 120;

export function CheckTab({ bird, initialCheckId }: { bird: Bird; initialCheckId?: string }) {
  const { t, locale } = useI18n();
  const nav = useNav();
  const { data, reload } = useLoad(async () => {
    const [program, isian, tracks, checks] = await Promise.all([getProgram(bird.id), db.all('isian'), db.all('tracks'), db.byBird('checks', bird.id)]);
    return { program, isian, tracks, checks: checks.sort((a, b) => b.createdAt - a.createdAt) };
  }, [bird.id]);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialCheckId);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'analyzing'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<BirdRecorder | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      window.clearInterval(timerRef.current);
      recRef.current?.cancel();
    },
    [],
  );

  if (!data) return <p className="muted">{t('loading')}</p>;
  const { program, isian, tracks, checks } = data;
  const trackName = (id: string) => tracks.find((tr) => tr.id === id)?.name ?? '';
  const current = checks.find((c) => c.id === selectedId) ?? checks[0];

  const toggleTarget = async (id: string) => {
    const isianIds = program.isianIds.includes(id) ? program.isianIds.filter((x) => x !== id) : [...program.isianIds, id];
    await db.put('programs', { ...program, isianIds });
    logEvent('targets_changed', { count: isianIds.length });
    reload();
  };

  const analyze = async (blob: Blob, source: 'record' | 'upload') => {
    setPhase('analyzing');
    setError(null);
    try {
      const c = await runCheck(bird.id, blob, source);
      setSelectedId(c.id);
      reload();
    } catch (e) {
      console.error(e);
      setError(t('errorGeneric'));
    } finally {
      setPhase('idle');
    }
  };

  const startRecording = async () => {
    if (program.isianIds.length === 0) return setError(t('needTargets'));
    setError(null);
    const rec = new BirdRecorder();
    try {
      await rec.start();
    } catch {
      setError(t('micDenied'));
      return;
    }
    recRef.current = rec;
    setPhase('recording');
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const sec = (Date.now() - started) / 1000;
      setElapsed(sec);
      setLevel(rec.level());
      if (sec >= MAX_RECORD_SEC) void finishRecording();
    }, 100);
  };

  const finishRecording = async () => {
    const rec = recRef.current;
    if (!rec) return;
    window.clearInterval(timerRef.current);
    recRef.current = null;
    const blob = await rec.stop();
    await analyze(blob, 'record');
  };

  return (
    <div className="stack">
      <section className="card">
        <h3>{t('targets')}</h3>
        <p className="muted small">{t('targetsHint')}</p>
        {isian.length === 0 ? (
          <div className="notice">
            {t('noIsian')} <button className="link-btn" onClick={() => nav({ name: 'library' })}>{t('goLibrary')} →</button>
          </div>
        ) : (
          <ul className="checklist">
            {isian.map((i) => (
              <li key={i.id}>
                <label>
                  <input type="checkbox" checked={program.isianIds.includes(i.id)} onChange={() => void toggleTarget(i.id)} />
                  <svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="3" fill={seriesColor(isianColorIndex(isian, i.id))} /></svg>
                  <span className="grow">{i.name}</span>
                  <span className="muted small">{trackName(i.trackId)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card record-card">
        {phase === 'recording' ? (
          <>
            <div className="row between">
              <span className="rec-dot" aria-hidden /> <strong>{t('recording')}</strong>
              <span className="big-num">{fmtDuration(elapsed)} / {fmtDuration(MAX_RECORD_SEC)}</span>
            </div>
            <div className="meter level"><div className="meter-fill" style={{ width: `${level * 100}%` }} /></div>
            <button className="btn primary" onClick={() => void finishRecording()}>■ {t('stopAndAnalyze')}</button>
          </>
        ) : phase === 'analyzing' ? (
          <p className="analyzing"><span className="spinner" aria-hidden /> {t('analyzing')}</p>
        ) : (
          <>
            <button className="btn primary big" onClick={() => void startRecording()}>🎙 {t('recordBird')}</button>
            <p className="muted small">{t('recordTips')}</p>
            <button
              className="btn"
              onClick={() => (program.isianIds.length === 0 ? setError(t('needTargets')) : fileRef.current?.click())}
            >
              ⤒ {t('uploadRecording')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void analyze(f, 'upload');
              }}
            />
          </>
        )}
        {error && <p className="warn small" role="alert">{error}</p>}
      </section>

      {current && (
        <section className="card">
          <CheckResult check={current} allIsian={isian} onChanged={reload} />
        </section>
      )}

      {checks.length > 1 && (
        <section className="card">
          <h3>{t('history')}</h3>
          <ul className="log">
            {checks.map((c) => (
              <li key={c.id}>
                <button className={'history-item' + (c.id === current?.id ? ' on' : '')} onClick={() => setSelectedId(c.id)}>
                  <span>{fmtDateTime(c.createdAt, locale)}</span>
                  <StatusChips matches={c.result.matches} compact />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
