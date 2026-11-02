/**
 * Small SVG charts following the dataviz method: fixed categorical order (entity-stable colours), thin
 * 2px lines with ≥8px markers, recessive grid, one y-axis, legend + direct labels, crosshair tooltip,
 * and a table view. Text uses text tokens, never series colours.
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useI18n } from '../i18n';
import { fmtDate } from '../util';

/** Categorical slots in fixed order (validated reference palette); CSS vars swap per theme. */
export const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];
export const seriesColor = (index: number) => `var(${SERIES_VARS[index % SERIES_VARS.length]})`;

export interface Series {
  id: string;
  name: string;
  colorIndex: number;
  points: { t: number; v: number }[];
}

const M = { top: 12, right: 92, bottom: 26, left: 34 };

/** Measure the container so 1 SVG unit = 1 CSS px (text stays legible on phones). */
function useWidth(ref: RefObject<HTMLElement>, fallback = 340) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(260, el.clientWidth));
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function LineChart({ series, height = 220, thresholds }: { series: Series[]; height?: number; thresholds: { v: number; label: string }[] }) {
  const { t, locale } = useI18n();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const width = useWidth(plotRef);
  const times = [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
  if (times.length === 0) return null;
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const span = Math.max(1, tMax - tMin);
  const pad = times.length === 1 ? 86400000 : span * 0.04;
  const x = (tt: number) => M.left + ((tt - (tMin - pad)) / (span + 2 * pad)) * (width - M.left - M.right);
  const y = (v: number) => M.top + (1 - v / 100) * (height - M.top - M.bottom);

  const onMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    let best = times[0];
    for (const tt of times) if (Math.abs(x(tt) - px) < Math.abs(x(best) - px)) best = tt;
    setHoverT(best);
  };

  const labelled = series.length <= 4;
  // Direct labels at line ends, nudged apart to avoid collisions.
  const ends = series
    .map((s) => ({ s, last: s.points[s.points.length - 1] }))
    .filter((e) => e.last)
    .sort((a, b) => y(a.last.v) - y(b.last.v));
  let prevY = -Infinity;
  const labelY = new Map<string, number>();
  for (const e of ends) {
    const yy = Math.max(y(e.last.v), prevY + 13);
    labelY.set(e.s.id, yy);
    prevY = yy;
  }

  const hoverX = hoverT != null ? x(hoverT) : null;
  return (
    <div className="chart">
      <div className="legend" role="list">
        {series.map((s) => (
          <span className="legend-item" role="listitem" key={s.id}>
            <svg width="16" height="8" aria-hidden><line x1="0" y1="4" x2="16" y2="4" stroke={seriesColor(s.colorIndex)} strokeWidth="2" strokeLinecap="round" /></svg>
            {s.name}
          </span>
        ))}
      </div>
      <div className="chart-plot" ref={plotRef}>
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="chart-svg" onPointerMove={onMove} onPointerLeave={() => setHoverT(null)} role="img" aria-label={series.map((s) => s.name).join(', ')}>
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} className="grid" />
              <text x={M.left - 6} y={y(v) + 4} className="axis-label" textAnchor="end">{v}</text>
            </g>
          ))}
          {thresholds.map((th) => (
            <g key={th.v}>
              <line x1={M.left} x2={width - M.right} y1={y(th.v)} y2={y(th.v)} className="ref-line" />
              <text x={M.left + 4} y={y(th.v) - 4} className="axis-label">{th.label} {th.v}</text>
            </g>
          ))}
          {times.map((tt, i) =>
            i === 0 || i === times.length - 1 || times.length <= Math.floor(width / 70) ? (
              <text key={tt} x={x(tt)} y={height - 8} className="axis-label" textAnchor="middle">{fmtDate(tt, locale)}</text>
            ) : null,
          )}
          {series.map((s) => (
            <g key={s.id}>
              <polyline
                fill="none"
                stroke={seriesColor(s.colorIndex)}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}
              />
              {s.points.map((p) => (
                <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={4.5} fill={seriesColor(s.colorIndex)} className="marker" />
              ))}
              {labelled && s.points.length > 0 && (
                <text x={x(s.points[s.points.length - 1].t) + 9} y={(labelY.get(s.id) ?? 0) + 4} className="direct-label">
                  {s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name}
                </text>
              )}
            </g>
          ))}
          {hoverX != null && <line x1={hoverX} x2={hoverX} y1={M.top} y2={height - M.bottom} className="crosshair" />}
        </svg>
        {hoverT != null && hoverX != null && (
          <div className="tooltip" style={{ left: `${(hoverX / width) * 100}%` }}>
            <div className="tooltip-title">{fmtDate(hoverT, locale)}</div>
            {series.map((s) => {
              const p = s.points.find((pp) => pp.t === hoverT);
              return p ? (
                <div className="tooltip-row" key={s.id}>
                  <svg width="12" height="8" aria-hidden><line x1="0" y1="4" x2="12" y2="4" stroke={seriesColor(s.colorIndex)} strokeWidth="2" /></svg>
                  <strong>{p.v}</strong> <span>{s.name}</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
      <button type="button" className="link-btn" onClick={() => setShowTable((v) => !v)}>
        {showTable ? t('hideTable') : t('showTable')}
      </button>
      {showTable && (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('date')}</th>
              {series.map((s) => <th key={s.id}>{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {times.map((tt) => (
              <tr key={tt}>
                <td>{fmtDate(tt, locale)}</td>
                {series.map((s) => <td key={s.id}>{s.points.find((p) => p.t === tt)?.v ?? '–'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Single-series daily bars with a reference line (daily cap) and per-bar hover tooltip. */
export function DailyBars({ days, cap, capLabel, unit }: { days: { t: number; v: number }[]; cap: number; capLabel: string; unit: string }) {
  const { locale } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const width = useWidth(plotRef);
  const height = 150;
  const m = { top: 14, right: 12, bottom: 24, left: 34 };
  const maxV = Math.max(cap * 1.15, ...days.map((d) => d.v), 1);
  const bw = (width - m.left - m.right) / days.length;
  const y = (v: number) => m.top + (1 - v / maxV) * (height - m.top - m.bottom);
  const base = y(0);
  return (
    <div className="chart">
      <div className="chart-plot" ref={plotRef}>
        <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label={capLabel}>
          {[0, Math.round(cap / 2)].map((v) => (
            <g key={v}>
              <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} className="grid" />
              <text x={m.left - 6} y={y(v) + 4} className="axis-label" textAnchor="end">{v}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const h = base - y(d.v);
            const bx = m.left + i * bw + 1; // 2px surface gap between bars
            const w = bw - 2;
            return (
              <g key={d.t} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={m.left + i * bw} y={m.top} width={bw} height={height - m.top - m.bottom} fill="transparent" />
                {d.v > 0 && (
                  <path
                    d={`M${bx},${base} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${Math.max(0, h - 4)} z`}
                    fill="var(--series-1)"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                {(i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2)) && (
                  <text x={bx + w / 2} y={height - 8} className="axis-label" textAnchor="middle">{fmtDate(d.t, locale)}</text>
                )}
              </g>
            );
          })}
          <line x1={m.left} x2={width - m.right} y1={y(cap)} y2={y(cap)} className="ref-line" />
          <text x={width - m.right} y={y(cap) - 4} className="axis-label" textAnchor="end">{capLabel}</text>
        </svg>
        {hover != null && (
          <div className="tooltip" style={{ left: `${((m.left + (hover + 0.5) * bw) / width) * 100}%` }}>
            <div className="tooltip-title">{fmtDate(days[hover].t, locale)}</div>
            <div className="tooltip-row"><strong>{days[hover].v}</strong> <span>{unit}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
