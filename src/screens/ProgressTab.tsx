import { useState } from 'react';
import { getProgram } from '../actions';
import { DailyBars, LineChart, type Series } from '../components/Charts';
import { db } from '../db';
import { THRESHOLD_MASUK, THRESHOLD_MIRIP } from '../dsp/analyze';
import { useI18n } from '../i18n';
import { speciesName } from '../species';
import { useLoad } from '../nav';
import type { Bird } from '../types';
import { fmtDate, startOfDay } from '../util';
import { isianColorIndex } from './CheckResult';

export function ProgressTab({ bird }: { bird: Bird }) {
  const { t, locale, lang } = useI18n();
  const [group, setGroup] = useState<string | null>(null);
  const { data } = useLoad(async () => {
    const [checks, sessions, isian, program, tracks] = await Promise.all([db.byBird('checks', bird.id), db.byBird('sessions', bird.id), db.all('isian'), getProgram(bird.id), db.all('tracks')]);
    return { checks: checks.sort((a, b) => a.createdAt - b.createdAt), sessions, isian, program, tracks };
  }, [bird.id]);
  if (!data) return <p className="muted">{t('loading')}</p>;
  const { checks, sessions, isian, program, tracks } = data;
  // Group isian by the species they come from, so one chart never needs more than 8 colours.
  const groupOf = (isianId: string) => {
    const i = isian.find((x) => x.id === isianId);
    return tracks.find((tr) => tr.id === i?.trackId)?.species ?? 'other';
  };

  // One series per isian ever checked (entity-stable colour).
  const byIsian = new Map<string, Series>();
  for (const c of checks) {
    for (const m of c.result.matches) {
      if (!byIsian.has(m.templateId)) {
        byIsian.set(m.templateId, { id: m.templateId, name: c.isianNames[m.templateId] ?? '—', colorIndex: isianColorIndex(isian, m.templateId), points: [] });
      }
      byIsian.get(m.templateId)!.points.push({ t: c.createdAt, v: m.bestSimilarity });
    }
  }
  const allSeries = [...byIsian.values()].sort((a, b) => a.colorIndex - b.colorIndex);
  const groups = [...new Set(allSeries.map((x) => groupOf(x.id)))];
  const active = group && groups.includes(group) ? group : groups[0];
  // Colours are assigned in fixed order within the group (≤ 8 slots, never cycled).
  const series = (groups.length > 1 ? allSeries.filter((x) => groupOf(x.id) === active) : allSeries)
    .slice(0, 8)
    .map((x, k) => ({ ...x, colorIndex: k }));

  // Masteran exposure per day, last 14 days.
  const today = startOfDay();
  const days = Array.from({ length: 14 }, (_, i) => ({ t: today - (13 - i) * 86400000, v: 0 }));
  for (const s of sessions) {
    const d = days.find((x) => s.startedAt >= x.t && s.startedAt < x.t + 86400000);
    if (d) d.v += s.playedSec / 60;
  }
  days.forEach((d) => (d.v = Math.round(d.v)));

  return (
    <div className="stack">
      <section className="card">
        <h3>{t('progressTitle')}</h3>
        {checks.length < 2 && <p className="muted small">{t('progressEmpty')}</p>}
        {groups.length > 1 && (
          <div className="seg small" role="tablist" aria-label={t('isianSource')}>
            {groups.map((g) => (
              <button key={g} role="tab" aria-selected={g === active} className={g === active ? 'on' : ''} onClick={() => setGroup(g)}>
                {speciesName(g, lang)}
              </button>
            ))}
          </div>
        )}
        {series.length > 0 && (
          <LineChart
            series={series}
            thresholds={[
              { v: THRESHOLD_MASUK, label: t('thresholdMasuk') },
              { v: THRESHOLD_MIRIP, label: t('thresholdMirip') },
            ]}
          />
        )}
      </section>
      <section className="card">
        <h3>{t('exposureTitle')}</h3>
        <DailyBars days={days} cap={program.dailyCapMin} capLabel={`${t('dailyCap')} ${program.dailyCapMin}`} unit={t('min')} />
      </section>
      {checks.length > 0 && (
        <section className="card">
          <h3>{t('variasiTitle')}</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('date')}</th>
                <th>{t('mVariasi')}</th>
                <th>{t('mKerja')}</th>
                <th>{t('mPhrases')}</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDate(c.createdAt, locale)}</td>
                  <td>{c.result.metrics.variasi}</td>
                  <td>{c.result.metrics.kerjaPct}%</td>
                  <td>{c.result.metrics.phraseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
