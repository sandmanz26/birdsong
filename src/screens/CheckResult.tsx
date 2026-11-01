import { useEffect, useRef, useState } from 'react';
import { decodeCached, playExcerpt } from '../audio/decode';
import { seriesColor } from '../components/Charts';
import { Spectrogram, type Region } from '../components/Spectrogram';
import { db, logEvent } from '../db';
import { workerSpectrogram, type DisplaySpec } from '../dsp/client';
import type { IsianMatch, IsianStatus } from '../dsp/analyze';
import { useI18n } from '../i18n';
import type { Check, Isian } from '../types';
import { fmtDateTime, fmtDuration } from '../util';

const STATUS_ICON: Record<IsianStatus, string> = { masuk: '✓', mirip: '◐', belum: '○' };

/** Entity-stable colour slot for an isian: its creation order among all isian (never its rank). */
export function isianColorIndex(all: Isian[], id: string): number {
  const sorted = [...all].sort((a, b) => a.createdAt - b.createdAt);
  const i = sorted.findIndex((x) => x.id === id);
  if (i >= 0) return i;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 8;
}

export function StatusBadge({ status }: { status: IsianStatus }) {
  const { t } = useI18n();
  return (
    <span className={`status status-${status}`}>
      <span aria-hidden>{STATUS_ICON[status]}</span> {t(`st_${status}`)}
    </span>
  );
}

export function StatusChips({ matches, compact }: { matches: IsianMatch[]; compact?: boolean }) {
  const { t } = useI18n();
  const counts = { masuk: 0, mirip: 0, belum: 0 } as Record<IsianStatus, number>;
  matches.forEach((m) => counts[m.status]++);
  return (
    <span className={'status-chips' + (compact ? ' compact' : '')}>
      {(['masuk', 'mirip', 'belum'] as IsianStatus[]).map((s) => (
        <span key={s} className={`status status-${s}`}>
          <span aria-hidden>{STATUS_ICON[s]}</span> {counts[s]} {t(`st_${s}`)}
        </span>
      ))}
    </span>
  );
}

export function CheckResult({ check, allIsian, onChanged }: { check: Check; allIsian: Isian[]; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const [spec, setSpec] = useState<DisplaySpec | null>(null);
  const [feedback, setFeedback] = useState(check.feedback);
  const [playing, setPlaying] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const r = check.result;

  useEffect(() => {
    setSpec(null);
    setFeedback(check.feedback);
    let alive = true;
    void (async () => {
      const blob = await db.getBlob('check:' + check.id);
      if (!blob) return;
      const samples = await decodeCached('check:' + check.id, blob);
      const s = await workerSpectrogram(samples, Math.ceil(check.durationSec * 70));
      if (alive) setSpec(s);
    })();
    return () => {
      alive = false;
      stopRef.current?.();
    };
  }, [check.id, check.durationSec, check.feedback]);

  const play = async (key: string, blobKey: string, start: number, end: number) => {
    stopRef.current?.();
    if (playing === key) {
      setPlaying(null);
      return;
    }
    const blob = await db.getBlob(blobKey);
    if (!blob) return;
    setPlaying(key);
    stopRef.current = playExcerpt(blob, Math.max(0, start - 0.15), end + 0.15, () => setPlaying((p) => (p === key ? null : p)));
  };

  const vote = async (isianId: string, v: 'agree' | 'disagree') => {
    const next = { ...feedback, [isianId]: v };
    setFeedback(next);
    await db.put('checks', { ...check, feedback: next });
    const m = r.matches.find((x) => x.templateId === isianId);
    logEvent('verdict_feedback', { vote: v, status: m?.status, similarity: m?.bestSimilarity });
    onChanged();
  };

  const regions: Region[] = r.phrases.map((p, i) => {
    const matched = p.matchedTemplateId;
    return {
      key: String(i),
      startSec: p.startSec,
      endSec: p.endSec,
      color: matched ? seriesColor(isianColorIndex(allIsian, matched)) : undefined,
      label: matched ? `${check.isianNames[matched] ?? ''} ${p.similarity ?? ''}%` : undefined,
      selected: playing === `ph${i}`,
    };
  });

  const m = r.metrics;
  return (
    <div className="stack">
      <div className="row between">
        <h3>{t('result')}</h3>
        <span className="muted small">{fmtDateTime(check.createdAt, locale)} · {t('recordingLen', { d: fmtDuration(check.durationSec) })}</span>
      </div>
      <Spectrogram
        spec={spec}
        durationSec={check.durationSec}
        regions={regions}
        onRegionClick={(k) => {
          const p = r.phrases[Number(k)];
          void play(`ph${k}`, 'check:' + check.id, p.startSec, p.endSec);
        }}
        ariaLabel={t('result')}
      />
      <p className="muted small">{t('legendHint')}</p>

      <ul className="isian-results">
        {r.matches.map((match) => {
          const isian = allIsian.find((i) => i.id === match.templateId);
          const best = match.occurrences.reduce<(typeof match.occurrences)[number] | null>((a, o) => (!a || o.similarity > a.similarity ? o : a), null);
          return (
            <li key={match.templateId} className="isian-row">
              <div className="row between">
                <span className="row gap">
                  <svg width="14" height="14" aria-hidden><rect width="14" height="14" rx="4" fill={seriesColor(isianColorIndex(allIsian, match.templateId))} /></svg>
                  <strong>{check.isianNames[match.templateId] ?? '—'}</strong>
                </span>
                <StatusBadge status={match.status} />
              </div>
              <div className="score-bar" aria-hidden>
                <div className="score-fill" style={{ width: `${match.bestSimilarity}%` }} />
                <div className="score-tick" style={{ left: '50%' }} />
                <div className="score-tick" style={{ left: '70%' }} />
              </div>
              <div className="row between wrap small">
                <span>
                  <strong>{match.bestSimilarity}%</strong> {t('similarity')} · {t('heard', { n: match.occurrences.length })}
                </span>
                <span className="row gap">
                  {best && (
                    <button className="btn small" onClick={() => void play(`b${match.templateId}`, 'check:' + check.id, best.startSec, best.endSec)}>
                      {playing === `b${match.templateId}` ? '■' : '▶'} {t('listen')}
                    </button>
                  )}
                  {isian && (
                    <button className="btn small ghost" onClick={() => void play(`t${match.templateId}`, 'track:' + isian.trackId, isian.startSec, isian.endSec)}>
                      {playing === `t${match.templateId}` ? '■' : '▶'} {t('listenTutor')}
                    </button>
                  )}
                </span>
              </div>
              <div className="row between small feedback">
                <span className="muted">{t('agreeQ')}</span>
                <span className="seg small">
                  <button className={feedback[match.templateId] === 'agree' ? 'on' : ''} aria-pressed={feedback[match.templateId] === 'agree'} onClick={() => void vote(match.templateId, 'agree')}>
                    👍 {t('agree')}
                  </button>
                  <button className={feedback[match.templateId] === 'disagree' ? 'on' : ''} aria-pressed={feedback[match.templateId] === 'disagree'} onClick={() => void vote(match.templateId, 'disagree')}>
                    👎 {t('disagree')}
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <section>
        <h3>{t('metricsTitle')}</h3>
        <div className="metrics">
          <div className="metric"><span className="metric-value">{m.singingSec}<small> {t('sec')}</small></span><span className="metric-label">{t('mSinging')}</span></div>
          <div className="metric"><span className="metric-value">{m.kerjaPct}<small>%</small></span><span className="metric-label">{t('mKerja')}</span></div>
          <div className="metric"><span className="metric-value">{m.phraseCount}</span><span className="metric-label">{t('mPhrases')}</span></div>
          <div className="metric"><span className="metric-value">{m.variasi}</span><span className="metric-label">{t('mVariasi')}</span></div>
          <div className="metric" title={t('mLoudHint')}><span className="metric-value">{m.loudnessDb}<small> dB</small></span><span className="metric-label">{t('mLoud')}</span></div>
        </div>
        <p className="muted small">{t('mLoudHint')}</p>
      </section>
      <p className="muted small">ⓘ {t('scoreDisclaimer')}</p>
      <button
        className="btn small danger"
        onClick={async () => {
          if (!confirm(t('deleteCheckConfirm'))) return;
          await db.delete('checks', check.id);
          await db.delete('blobs', 'check:' + check.id);
          onChanged();
        }}
      >
        {t('delete')}
      </button>
    </div>
  );
}
