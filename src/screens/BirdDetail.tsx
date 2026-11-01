import { db } from '../db';
import { useI18n, type TKey } from '../i18n';
import { useLoad, useNav, type BirdTab } from '../nav';
import { CheckTab } from './CheckTab';
import { MasteranTab } from './MasteranTab';
import { ProgressTab } from './ProgressTab';

export function BirdDetail({ id, tab, checkId }: { id: string; tab: BirdTab; checkId?: string }) {
  const { t } = useI18n();
  const nav = useNav();
  const { data: bird } = useLoad(() => db.get('birds', id), [id]);
  if (!bird) return <p className="muted pad">{t('loading')}</p>;

  const tabs: [BirdTab, TKey][] = [
    ['masteran', 'tabMasteran'],
    ['check', 'tabCheck'],
    ['progress', 'tabProgress'],
  ];
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h2 className="title">{bird.name}</h2>
          <p className="muted small">
            {t(`sp_${bird.species}` as TKey)} · {t(`ph_${bird.phase}` as TKey)} · {t(`or_${bird.origin}` as TKey)}
            {bird.ring ? ` · ${bird.ring}` : ''}
          </p>
        </div>
        <button className="btn small" onClick={() => nav({ name: 'birdForm', id })}>{t('edit')}</button>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => nav({ name: 'bird', id, tab: k })}>
            {t(label)}
          </button>
        ))}
      </div>
      {tab === 'masteran' && <MasteranTab bird={bird} />}
      {tab === 'check' && <CheckTab bird={bird} initialCheckId={checkId} />}
      {tab === 'progress' && <ProgressTab bird={bird} />}
    </div>
  );
}
