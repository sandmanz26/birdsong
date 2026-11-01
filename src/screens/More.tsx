import { loadCatalog } from '../catalog/client';
import { db } from '../db';
import { useI18n, type Lang } from '../i18n';
import { useLoad, useNav } from '../nav';
import { downloadBlob } from '../util';

declare const __APP_VERSION__: string;

/** Test-data export (PRD: metrics). Contains no audio. */
async function exportTestData() {
  const [birds, tracks, isian, programs, sessions, checks, events] = await Promise.all([
    db.all('birds'), db.all('tracks'), db.all('isian'), db.all('programs'), db.all('sessions'), db.all('checks'), db.all('events'),
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'kicau-coach',
    version: __APP_VERSION__,
    userAgent: navigator.userAgent,
    birds: birds.map(({ name: _n, ...b }) => b), // drop free-text names
    tracks: tracks.map(({ name: _n, ...tr }) => tr),
    isian,
    programs,
    sessions,
    checks: checks.map((c) => ({ ...c, isianNames: undefined })),
    events,
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `kicau-coach-test-${Date.now()}.json`);
}

export function MoreScreen() {
  const { t, lang, setLang } = useI18n();
  const nav = useNav();
  const { data: catalog } = useLoad(() => loadCatalog().catch(() => null), []);
  return (
    <div className="stack">
      <h2 className="title">{t('moreTitle')}</h2>
      <section className="card">
        <h3>{t('language')}</h3>
        <div className="seg">
          {(['id', 'en'] as Lang[]).map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l === 'id' ? 'Bahasa Indonesia' : 'English'}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <button className="btn primary" onClick={() => void exportTestData()}>⤓ {t('exportData')}</button>
        <p className="muted small">{t('exportHint')}</p>
      </section>
      <section className="card">
        <h3>{t('aboutTitle')}</h3>
        <p>{t('about1')}</p>
        <p>{t('about2')}</p>
        <p>{t('about3')}</p>
        <p className="muted small">{t('version')} {__APP_VERSION__}</p>
      </section>
      {catalog && catalog.tracks.length > 0 && (
        <section className="card">
          <h3>{t('credits')}</h3>
          <p className="muted small">{t('creditsHint')}</p>
          <ul className="log">
            {catalog.tracks.map((tr) => (
              <li key={tr.id}>
                <span>
                  {lang === 'id' ? tr.nameId : tr.nameEn} <em className="muted">{tr.sci}</em>
                  <span className="muted small block">{tr.recordist}</span>
                </span>
                <span className="small">
                  <a href={tr.licenseUrl} target="_blank" rel="noreferrer">{tr.license}</a> ·{' '}
                  <a href={tr.sourceUrl} target="_blank" rel="noreferrer">{tr.source}</a>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button
        className="btn danger"
        onClick={async () => {
          if (confirm(t('resetConfirm'))) {
            await db.clearAll();
            nav({ name: 'birds' });
          }
        }}
      >
        {t('resetAll')}
      </button>
    </div>
  );
}
