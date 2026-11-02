/** Choose a curated masteran pack for a bird: one tap downloads it and sets up the whole program. */
import { useState } from 'react';
import { MIN_MATERIAL_DAYS } from '../actions';
import { applyPack, loadCatalog, materialInUseDays, packMegabytes, packSeconds, packsFor } from '../catalog/client';
import { fmtDuration } from '../util';
import type { Catalog, CatalogPack } from '../catalog/types';
import { db } from '../db';
import { speciesName } from '../species';
import { useI18n } from '../i18n';
import { useLoad, useNav } from '../nav';

export function PackPicker({ birdId }: { birdId: string }) {
  const { t, lang } = useI18n();
  const nav = useNav();
  const { data, error, reload } = useLoad(async () => {
    const [catalog, bird, program] = await Promise.all([loadCatalog(), db.get('birds', birdId), db.get('programs', birdId)]);
    return { catalog, bird, program };
  }, [birdId]);
  const [busy, setBusy] = useState<{ pack: string; done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);

  if (error) return <CatalogError onRetry={reload} />;
  if (!data?.bird) return <p className="muted pad">{t('loading')}</p>;
  const { catalog, bird, program } = data;
  const { recommended, others, usable } = packsFor(catalog, bird.species);

  const use = async (pack: CatalogPack) => {
    const days = await materialInUseDays(birdId);
    if (days !== null && days < MIN_MATERIAL_DAYS && !confirm(t('materialChangeWarn', { n: days }))) return;
    setFailed(false);
    setBusy({ pack: pack.id, done: 0, total: pack.trackIds.length });
    try {
      await applyPack(birdId, pack, catalog, (done, total) => setBusy({ pack: pack.id, done, total }));
      nav({ name: 'bird', id: birdId, tab: 'masteran' });
    } catch (e) {
      console.error(e);
      setFailed(true);
      setBusy(null);
    }
  };

  const card = (p: CatalogPack) => (
    <PackCard key={p.id} pack={p} catalog={catalog} lang={lang} inUse={program?.packId === p.id} busy={busy} disabled={!!busy || !usable(p)} onUse={() => void use(p)} />
  );

  return (
    <div className="stack">
      <h2 className="title">{t('packsTitle')}</h2>
      <p className="muted small">{t('packsHint')}</p>
      {failed && <p className="warn small" role="alert">{t('catalogError')}</p>}
      {catalog.packs.length === 0 && <p className="notice">{t('noPacksYet')}</p>}
      {recommended.length > 0 && (
        <>
          <h3>{t('recommendedFor', { species: speciesName(bird.species, lang) })}</h3>
          {recommended.map(card)}
        </>
      )}
      {others.length > 0 && <h3>{t('otherPacks')}</h3>}
      {others.map(card)}
      <button className="btn ghost" onClick={() => nav({ name: 'bird', id: birdId, tab: 'masteran' })}>{t('skipForNow')}</button>
    </div>
  );
}

function PackCard({ pack, catalog, lang, inUse, busy, disabled, onUse }: {
  pack: CatalogPack; catalog: Catalog; lang: string; inUse: boolean;
  busy: { pack: string; done: number; total: number } | null; disabled: boolean; onUse: () => void;
}) {
  const { t } = useI18n();
  const tracks = pack.trackIds.map((id) => catalog.tracks.find((tr) => tr.id === id)!).filter(Boolean);
  const mine = busy?.pack === pack.id;
  return (
    <section className={'card pack-card' + (inUse ? ' in-use' : '')}>
      <div className="row between">
        <h3>{lang === 'id' ? pack.nameId : pack.nameEn}</h3>
        {inUse && <span className="chip">{t('packInUse')}</span>}
      </div>
      <p className="small">{lang === 'id' ? pack.descId : pack.descEn}</p>
      {tracks.length > 0 ? (
        <>
          <div className="pack-species">
            {[...new Set(tracks.map((tr) => tr.species))].map((sp) => {
              const clips = tracks.filter((tr) => tr.species === sp);
              const own = pack.target.includes(sp);
              return (
                <span key={sp} className={'species-chip ' + (own ? 'master' : 'isian')}>
                  {own ? '★ ' : ''}
                  {lang === 'id' ? clips[0].nameId : clips[0].nameEn}
                  {clips.length > 1 && <span className="muted"> ×{clips.length}</span>}
                </span>
              );
            })}
          </div>
          <p className="muted small">
            {t('packStats', { n: tracks.length, m: fmtDuration(packSeconds(pack, catalog)), mb: packMegabytes(pack, catalog).toFixed(1) })}
            {pack.missingSpecies.length > 0 && ` · ${t('packIncomplete', { n: pack.missingSpecies.length })}`}
          </p>
          <button className="btn primary" onClick={onUse} disabled={disabled}>
            {mine ? t('downloading', { done: busy!.done, total: busy!.total }) : inUse ? `↻ ${t('usePack')}` : t('usePack')}
          </button>
        </>
      ) : (
        <p className="chip soon">{t('packSoon')}</p>
      )}
    </section>
  );
}

export function CatalogError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="empty">
      <p>{t('catalogError')}</p>
      <button className="btn" onClick={onRetry}>{t('retry')}</button>
    </div>
  );
}
