import { useRef, useState } from 'react';
import { deleteTrack, importTrack } from '../actions';
import { playExcerpt } from '../audio/decode';
import { db } from '../db';
import { useI18n } from '../i18n';
import { useLoad, useNav } from '../nav';
import { fmtDuration } from '../util';

export function LibraryScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const { data, reload } = useLoad(async () => {
    const [tracks, isian] = await Promise.all([db.all('tracks'), db.all('isian')]);
    return { tracks: tracks.sort((a, b) => b.createdAt - a.createdAt), isian };
  }, []);

  const onFiles = async (files: FileList) => {
    setBusy(true);
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      try {
        await importTrack(f, f.name.replace(/\.[^.]+$/, ''));
      } catch {
        errs.push(t('importFailed', { name: f.name }));
      }
    }
    setErrors(errs);
    setBusy(false);
    reload();
  };

  const toggle = async (id: string) => {
    stopRef.current?.();
    if (playing === id) return setPlaying(null);
    const blob = await db.getBlob('track:' + id);
    if (!blob) return;
    setPlaying(id);
    stopRef.current = playExcerpt(blob, 0, undefined, () => setPlaying((p) => (p === id ? null : p)));
  };

  return (
    <div className="stack">
      <h2 className="title">{t('libraryTitle')}</h2>
      <p className="muted small">{t('libraryHint')}</p>
      <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? t('importing') : `+ ${t('importAudio')}`}
      </button>
      <input ref={fileRef} type="file" accept="audio/*,video/*" multiple hidden onChange={(e) => e.target.files && void onFiles(e.target.files).then(() => (e.target.value = ''))} />
      {errors.map((e) => <p key={e} className="warn small" role="alert">{e}</p>)}
      {data?.tracks.map((tr) => {
        const n = data.isian.filter((i) => i.trackId === tr.id).length;
        return (
          <div className="card track-row" key={tr.id}>
            <button className="icon-btn play" onClick={() => void toggle(tr.id)} aria-label={playing === tr.id ? t('pause') : t('play')}>
              {playing === tr.id ? '■' : '▶'}
            </button>
            <button className="grow track-main" onClick={() => nav({ name: 'track', id: tr.id })}>
              <strong>{tr.name}</strong> {tr.source === 'demo' && <span className="badge">{t('demoBadge')}</span>}
              <span className="muted small block">
                {fmtDuration(tr.durationSec)} · {t('isianCount', { n })}
              </span>
            </button>
            <button
              className="icon-btn"
              aria-label={t('delete')}
              onClick={async () => {
                if (confirm(t('deleteTrackConfirm'))) {
                  await deleteTrack(tr.id);
                  reload();
                }
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
