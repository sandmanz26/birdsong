import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DisplaySpec } from '../dsp/client';

export interface Region {
  key: string;
  startSec: number;
  endSec: number;
  /** CSS color for identity (isian); omit for a neutral phrase box. */
  color?: string;
  label?: string;
  selected?: boolean;
}

interface Props {
  spec: DisplaySpec | null;
  durationSec: number;
  regions?: Region[];
  onRegionClick?: (key: string) => void;
  height?: number;
  /** Minimum horizontal zoom so short phrases stay tappable; the view scrolls horizontally. */
  minPxPerSec?: number;
  playheadSec?: number | null;
  ariaLabel: string;
}

// Perceptually ordered dark→bright colormap (inferno-like), readable in light and dark themes.
const STOPS: [number, number, number][] = [
  [8, 6, 22], [45, 11, 89], [100, 22, 110], [158, 40, 100], [210, 70, 60], [244, 130, 20], [250, 200, 60], [252, 255, 164],
];
function colormap(v: number): [number, number, number] {
  const x = Math.min(0.9999, Math.max(0, v)) * (STOPS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = STOPS[i], b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Renders the spectrogram matrix once into an offscreen canvas at native resolution. */
function useSpecImage(spec: DisplaySpec | null) {
  return useMemo(() => {
    if (!spec) return null;
    const { rows: cols, cols: bins, data } = spec; // rows = time columns, cols = freq bins
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
    const range = 70;
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = bins;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(cols, bins);
    for (let c = 0; c < cols; c++) {
      for (let b = 0; b < bins; b++) {
        const v = (data[c * bins + b] - (max - range)) / range;
        const [r, g, bl] = colormap(v);
        const o = ((bins - 1 - b) * cols + c) * 4; // low frequencies at the bottom
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = bl;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }, [spec]);
}

export function Spectrogram({ spec, durationSec, regions = [], onRegionClick, height = 150, minPxPerSec = 70, playheadSec, ariaLabel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wrapWidth, setWrapWidth] = useState(320);
  const image = useSpecImage(spec);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapWidth(el.clientWidth));
    ro.observe(el);
    setWrapWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const width = Math.min(16000, Math.max(wrapWidth, Math.ceil(durationSec * minPxPerSec)));
  const pxPerSec = width / Math.max(0.001, durationSec);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const dpr = width > 4000 ? 1 : Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    const specSec = image.width * (spec?.secPerCol ?? 0);
    ctx.drawImage(image, 0, 0, canvas.width * Math.min(1, specSec / durationSec), canvas.height);
  }, [image, width, height, durationSec, spec]);

  return (
    <div className="spec-wrap" ref={wrapRef} role="img" aria-label={ariaLabel}>
      <div className="spec-inner" style={{ width, height }}>
        <canvas ref={canvasRef} style={{ width, height }} />
        {!spec && <div className="spec-loading shimmer" />}
        {regions.map((r) => (
          <button
            key={r.key}
            type="button"
            className={'spec-region' + (r.color ? ' tagged' : '') + (r.selected ? ' selected' : '')}
            style={{
              left: r.startSec * pxPerSec,
              width: Math.max(14, (r.endSec - r.startSec) * pxPerSec),
              ...(r.color ? { borderColor: r.color, ['--region' as string]: r.color } : {}),
            }}
            onClick={() => onRegionClick?.(r.key)}
            aria-label={r.label ?? `${r.startSec.toFixed(1)}–${r.endSec.toFixed(1)} s`}
            aria-pressed={r.selected}
          >
            {r.label && <span className="spec-label">{r.label}</span>}
          </button>
        ))}
        {playheadSec != null && <div className="spec-playhead" style={{ left: playheadSec * pxPerSec }} />}
      </div>
    </div>
  );
}
