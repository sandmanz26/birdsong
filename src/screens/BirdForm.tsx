import { useEffect, useState } from 'react';
import { deleteBird, saveBird } from '../actions';
import { db } from '../db';
import { useI18n, type TKey } from '../i18n';
import { useNav } from '../nav';
import type { Bird, Origin, Phase, Species } from '../types';
import { uid } from '../util';

const SPECIES: Species[] = ['murai_batu', 'kenari', 'lovebird', 'cucak_ijo', 'kacer', 'pleci', 'chao_mao', 'other'];
const PHASES: Phase[] = ['trotolan', 'muda', 'dewasa', 'mabung'];
const ORIGINS: Origin[] = ['tangkaran', 'tangkapan', 'unknown'];

export function BirdForm({ id }: { id?: string }) {
  const { t } = useI18n();
  const nav = useNav();
  const [bird, setBird] = useState<Bird>({ id: uid(), name: '', species: 'murai_batu', phase: 'trotolan', origin: 'tangkaran', createdAt: Date.now() });

  useEffect(() => {
    if (id) db.get('birds', id).then((b) => b && setBird(b));
  }, [id]);

  const set = <K extends keyof Bird>(k: K, v: Bird[K]) => setBird((b) => ({ ...b, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bird.name.trim()) return;
    await saveBird({ ...bird, name: bird.name.trim() });
    nav({ name: 'bird', id: bird.id, tab: 'masteran' });
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>{t('birdName')}</span>
        <input required value={bird.name} onChange={(e) => set('name', e.target.value)} autoFocus maxLength={40} />
      </label>
      <label className="field">
        <span>{t('species')}</span>
        <select value={bird.species} onChange={(e) => set('species', e.target.value as Species)}>
          {SPECIES.map((s) => <option key={s} value={s}>{t(`sp_${s}` as TKey)}</option>)}
        </select>
      </label>
      <fieldset className="field">
        <legend>{t('phase')}</legend>
        <div className="seg">
          {PHASES.map((p) => (
            <button type="button" key={p} className={bird.phase === p ? 'on' : ''} aria-pressed={bird.phase === p} onClick={() => set('phase', p)}>
              {t(`ph_${p}` as TKey)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>{t('origin')}</legend>
        <div className="seg">
          {ORIGINS.map((o) => (
            <button type="button" key={o} className={bird.origin === o ? 'on' : ''} aria-pressed={bird.origin === o} onClick={() => set('origin', o)}>
              {t(`or_${o}` as TKey)}
            </button>
          ))}
        </div>
        <p className="muted small">{t('originNote')}</p>
      </fieldset>
      {bird.origin === 'tangkaran' && (
        <label className="field">
          <span>{t('ring')}</span>
          <input value={bird.ring ?? ''} onChange={(e) => set('ring', e.target.value)} maxLength={30} />
        </label>
      )}
      <label className="field">
        <span>{t('hatchDate')}</span>
        <input type="date" value={bird.hatchDate ?? ''} onChange={(e) => set('hatchDate', e.target.value || undefined)} />
      </label>
      <button className="btn primary" type="submit">{t('save')}</button>
      {id && (
        <button
          type="button"
          className="btn danger"
          onClick={async () => {
            if (confirm(t('deleteBirdConfirm'))) {
              await deleteBird(id);
              nav({ name: 'birds' });
            }
          }}
        >
          {t('delete')}
        </button>
      )}
    </form>
  );
}
