import { playedTodaySec, getProgram } from '../actions';
import { db } from '../db';
import { useI18n, type TKey } from '../i18n';
import { useLoad, useNav } from '../nav';
import { StatusChips } from './CheckResult';

export function BirdsScreen() {
  const { t } = useI18n();
  const nav = useNav();
  const { data } = useLoad(async () => {
    const birds = (await db.all('birds')).sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(
      birds.map(async (b) => {
        const checks = (await db.byBird('checks', b.id)).sort((x, y) => y.createdAt - x.createdAt);
        return { bird: b, playedMin: Math.round((await playedTodaySec(b.id)) / 60), program: await getProgram(b.id), last: checks[0] };
      }),
    );
  }, []);

  if (!data) return <p className="muted pad">{t('loading')}</p>;

  if (data.length === 0)
    return (
      <div className="empty">
        <div className="empty-art" aria-hidden>
          <svg viewBox="0 0 64 64" width="72" height="72"><path d="M14 40c8 0 12-6 14-14 2-8 8-14 18-12l6-4-2 8c2 10-4 22-18 24l-4 10-4-9c-4 0-8-1-10-3z" fill="var(--accent)" /><circle cx="44" cy="20" r="2" fill="var(--surface)" /></svg>
        </div>
        <h2>{t('birdsEmptyTitle')}</h2>
        <p className="muted">{t('birdsEmptyBody')}</p>
        <button className="btn primary" onClick={() => nav({ name: 'birdForm' })}>{t('addBird')}</button>
      </div>
    );

  return (
    <div className="stack">
      {data.map(({ bird, playedMin, program, last }) => (
        <button key={bird.id} className="card bird-card" onClick={() => nav({ name: 'bird', id: bird.id, tab: 'masteran' })}>
          <div className="row between">
            <h3>{bird.name}</h3>
            <span className="chip">{t(`ph_${bird.phase}` as TKey)}</span>
          </div>
          <p className="muted small">{t(`sp_${bird.species}` as TKey)}</p>
          <div className="meter" aria-label={`${t('todayMasteran')} ${playedMin}/${program.dailyCapMin}`}>
            <div className="meter-fill" style={{ width: `${Math.min(100, (100 * playedMin) / program.dailyCapMin)}%` }} />
          </div>
          <p className="small">{t('todayMasteran')}: <strong>{playedMin}</strong> / {program.dailyCapMin} {t('min')}</p>
          {last ? (
            <div className="small">{t('lastCheck')}: <StatusChips matches={last.result.matches} compact /></div>
          ) : (
            <p className="muted small">{t('noCheckYet')}</p>
          )}
        </button>
      ))}
      <button className="btn primary" onClick={() => nav({ name: 'birdForm' })}>+ {t('addBird')}</button>
    </div>
  );
}
