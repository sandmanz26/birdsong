/** Read-only curated catalogue: browse, preview and see credits. Owners never upload music. */
import { useRef, useState } from 'react';
import { audioUrl, appTrackId, loadCatalog } from '../catalog/client';
import type { CatalogTrack } from '../catalog/types';
import { db } from '../db';
import { useI18n } from '../i18n';
import { useLoad, useNav } from '../nav';
import { fmtDuration } from '../util';
import { CatalogError } from './PackPicker';

export function LibraryScreen() {
  const { t, lang } = useI18n();
  const nav = useNav();
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { data, error, reload } = useLoad(async () => {
    const [catalog, local] = await Promise.all([loadCatalog(), db.all('tracks')]);
    return { catalog, installed: new Set(local.map((x) => x.id)) };
  }, []);

  if (error) return <CatalogError onRetry={reload} />;
  if (!data) return <p className="muted pad">{t('loading')}</p>;

  const preview = (tr: CatalogTrack) => {
    audioRef.current?.pause();
    if (playing === tr.id) return setPlaying(null);
    const el = new Audio(audioUrl(tr));
    el.onended = () => setPlaying((p) => (p === tr.id ? null : p));
    void el.play().catch(() => setPlaying(null));
    audioRef.current = el;
    setPlaying(tr.id);
  };

  const groups: ['master' | 'isian', string][] = [
    ['master', t('roleMaster')],
    ['isian', t('roleIsian')],
  ];

  return (
    <div className="stack">
      <h2 className="title">{t('catalogTitle')}</h2>
      <p className="muted small">{t('catalogHint')}</p>
      {data.catalog.tracks.length === 0 && <p className="notice">{t('catalogEmpty')}</p>}
      <p className="muted small">{t('standardNote', { v: data.catalog.standardVersion })}</p>
      {groups.map(([role, label]) => {
        const list = data.catalog.tracks.filter((x) => x.role === role).sort((a, b) => a.nameId.localeCompare(b.nameId) || a.id.localeCompare(b.id));
        if (list.length === 0) return null;
        return (
          <section key={role} className="stack">
            <h3>{label}</h3>
            {list.map((tr) => {
              const isInstalled = data.installed.has(appTrackId(tr.id));
              return (
                <div className="card track-row" key={tr.id}>
                  <button className="icon-btn play" onClick={() => preview(tr)} aria-label={playing === tr.id ? t('pause') : t('preview')}>
                    {playing === tr.id ? '■' : '▶'}
                  </button>
                  <button
                    className="grow track-main"
                    disabled={!isInstalled}
                    onClick={() => nav({ name: 'track', id: appTrackId(tr.id) })}
                    aria-label={`${tr.nameId} – ${t('details')}`}
                  >
                    <strong>{lang === 'id' ? tr.nameId : tr.nameEn}</strong> <em className="muted small">{tr.sci}</em>
                    {(() => {
                      const same = list.filter((x) => x.species === tr.species);
                      return same.length > 1 ? <span className="chip">{t('clipN', { n: same.indexOf(tr) + 1, of: same.length })}</span> : null;
                    })()}
                    <span className="muted small block">
                      {fmtDuration(tr.durationSec)} · {t('isianCount', { n: tr.isian.length })} · {tr.license}
                      {isInstalled && <> · ✓ {t('installed')}</>}
                    </span>
                    <span className="muted small block">{t('recordedBy')}: {tr.recordist}{tr.country ? ` · ${tr.country}` : ''}</span>
                    <span className="curated small block">
                      ✓ {t('curatedBy', { name: tr.curation.curator, role: tr.curation.role, date: tr.curation.date })}
                    </span>
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
