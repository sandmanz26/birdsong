/** "Tap a phrase to mark it as isian" editor (PRD F2 user story 1). */
import { useEffect, useRef, useState } from 'react';
import { trackSamples } from '../actions';
import { MAX_EDITABLE_SEC, playExcerpt } from '../audio/decode';
import { seriesColor } from '../components/Charts';
import { Spectrogram, type Region } from '../components/Spectrogram';
import { db, logEvent } from '../db';
import { workerPhrases, workerSpectrogram, type DisplaySpec } from '../dsp/client';
import { useI18n } from '../i18n';
import { useLoad } from '../nav';
import type { Isian } from '../types';
import { fmtDuration, uid } from '../util';
import { isianColorIndex } from './CheckResult';

export function TrackEditor({ id }: { id: string }) {
  const { t } = useI18n();
  const { data, reload } = useLoad(async () => ({ track: await db.get('tracks', id), isian: await db.all('isian') }), [id]);
  const [spec, setSpec] = useState<DisplaySpec | null>(null);
  const [phrases, setPhrases] = useState<{ startSec: number; endSec: number }[] | null>(null);
  const [selected, setSelected] = useState<{ startSec: number; endSec: number } | null>(null);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const track = data?.track;

  useEffect(() => {
    if (!track || track.durationSec > MAX_EDITABLE_SEC) return;
    let alive = true;
    void (async () => {
      try {
        const samples = await trackSamples(track);
        const [s, p] = await Promise.all([workerSpectrogram(samples, Math.ceil(track.durationSec * 70)), workerPhrases(samples)]);
        if (alive) {
          setSpec(s);
          setPhrases(p);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      stopRef.current?.();
    };
  }, [track]);

  if (!data || !track) return <p className="muted pad">{t('loading')}</p>;
  const mine = data.isian.filter((i) => i.trackId === id);

  const play = async (startSec: number, endSec: number) => {
    stopRef.current?.();
    const blob = await db.getBlob('track:' + id);
    if (blob) stopRef.current = playExcerpt(blob, Math.max(0, startSec - 0.1), endSec + 0.1);
  };

  const overlapsIsian = (p: { startSec: number; endSec: number }) => mine.find((i) => p.startSec < i.endSec && i.startSec < p.endSec);

  const regions: Region[] = (phrases ?? []).map((p, i) => {
    const marked = overlapsIsian(p);
    return {
      key: String(i),
      startSec: p.startSec,
      endSec: p.endSec,
      color: marked ? seriesColor(isianColorIndex(data.isian, marked.id)) : undefined,
      label: marked?.name,
      selected: selected?.startSec === p.startSec,
    };
  });

  const save = async () => {
    if (!selected || !name.trim()) return;
    const isian: Isian = { id: uid(), trackId: id, name: name.trim(), startSec: selected.startSec, endSec: selected.endSec, createdAt: Date.now() };
    await db.put('isian', isian);
    logEvent('isian_marked', { lengthSec: +(selected.endSec - selected.startSec).toFixed(2) });
    setSelected(null);
    setName('');
    reload();
  };

  return (
    <div className="stack">
      <h2 className="title">{track.name}</h2>
      <p className="muted small">{fmtDuration(track.durationSec)}{phrases ? ` · ${t('phrasesFound', { n: phrases.length })}` : ''}</p>
      {track.source === 'demo' && <p className="notice small">{t('demoTrackNote')}</p>}
      {track.license && (
        <p className="muted small">
          {t('recordedBy')}: {track.attribution?.split(' · ')[0]} · {t('license')}:{' '}
          <a href={track.licenseUrl} target="_blank" rel="noreferrer">{track.license}</a>
          {track.sourceUrl && <> · <a href={track.sourceUrl} target="_blank" rel="noreferrer">{t('source')}</a></>}
        </p>
      )}
      {failed || track.durationSec > MAX_EDITABLE_SEC ? (
        <p className="warn">{t('errorGeneric')}</p>
      ) : (
        <>
          <p className="muted small">{t('editorHint')}</p>
          <Spectrogram
            spec={spec}
            durationSec={track.durationSec}
            regions={regions}
            height={170}
            onRegionClick={(k) => {
              const p = phrases![Number(k)];
              void play(p.startSec, p.endSec);
              if (!overlapsIsian(p)) setSelected(p);
            }}
            ariaLabel={track.name}
          />
          {selected && (
            <div className="card stack">
              <p className="small">
                {t('selected')}: {selected.startSec.toFixed(2)}–{selected.endSec.toFixed(2)} s ({(selected.endSec - selected.startSec).toFixed(2)} s)
              </p>
              <label className="field">
                <span>{t('isianName')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
              </label>
              <div className="row gap">
                <button className="btn primary grow" onClick={() => void save()} disabled={!name.trim()}>{t('markIsian')}</button>
                <button className="btn" onClick={() => setSelected(null)}>{t('cancel')}</button>
              </div>
            </div>
          )}
        </>
      )}
      {mine.length > 0 && (
        <section className="card">
          <h3>{t('markedIsian')}</h3>
          <ul className="checklist">
            {mine.map((i) => (
              <li key={i.id} className="row gap">
                <svg width="12" height="12" aria-hidden><rect width="12" height="12" rx="3" fill={seriesColor(isianColorIndex(data.isian, i.id))} /></svg>
                <span className="grow">{i.name}</span>
                <button className="btn small" onClick={() => void play(i.startSec, i.endSec)}>▶</button>
                <button
                  className="icon-btn"
                  aria-label={t('delete')}
                  onClick={async () => {
                    await db.delete('isian', i.id);
                    reload();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
