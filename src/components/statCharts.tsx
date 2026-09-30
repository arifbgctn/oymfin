import { useState } from 'react';
import { formatCompactTRY, formatTRY } from '../domain/money';
import { monthLabel, shortMonthLabel } from '../domain/month';
import type { MonthKey } from '../domain/types';
import { topRoundedBar } from './charts';

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatTRY(v));

/**
 * Çizgi grafik: tek eksen, sıfır çizgisi, 2px çizgiler, üzerine gelince dikey imleç + ipucu.
 * Birden fazla seride açıklama gösterilir.
 */
export function LineChart({ series, xLabels, tooltipTitle, ariaLabel, labelEvery = 1 }: { series: LineSeries[]; xLabels: string[]; tooltipTitle: (i: number) => string; ariaLabel: string; labelEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 160;
  const top = 12;
  const base = H - 22;
  const n = xLabels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const y = (v: number) => top + ((max - v) / span) * (base - top);
  const x = (i: number) => (n <= 1 ? W / 2 : 8 + (i / (n - 1)) * (W - 16));
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <svg width="16" height="8" aria-hidden>
                <line x1="0" x2="16" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
        <span className="ml-auto tabular">
          {min < 0 ? `${formatCompactTRY(min)} … ` : ''}
          {formatCompactTRY(max)}
        </span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          <line x1="0" x2={W} y1={top} y2={top} stroke="var(--grid)" strokeDasharray="3 3" />
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeOpacity="0.5" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={base} stroke="var(--muted)" strokeOpacity="0.6" />}
          {series.map((s) => (
            <path
              key={s.id}
              d={path(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '5 4' : undefined}
              data-testid="line-series"
            />
          ))}
          {n <= 12 &&
            series.map((s) =>
              s.values.map((v, i) =>
                v === null ? null : <circle key={`${s.id}-${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill={s.color} stroke="var(--surface)" strokeWidth="2" />,
              ),
            )}
          {n > 12 &&
            hover !== null &&
            series.map((s) => {
              const v = s.values[hover];
              return v === null || v === undefined ? null : <circle key={s.id} cx={x(hover)} cy={y(v)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />;
            })}
          {xLabels.map((l, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--muted)">
                {l}
              </text>
            ) : null,
          )}
          {xLabels.map((_, i) => (
            <rect
              key={`h${i}`}
              x={x(i) - W / Math.max(n, 1) / 2}
              y={0}
              width={W / Math.max(n, 1)}
              height={H}
              fill="transparent"
              tabIndex={n <= 12 ? 0 : -1}
              aria-label={`${tooltipTitle(i)}: ${series.map((s) => `${s.label} ${fmt(s.values[i])}`).join(', ')}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => setHover((h) => (h === i ? null : i))}
            />
          ))}
        </svg>
        {hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 w-48 rounded-xl border border-border bg-surface p-2.5 text-xs shadow-lg"
            style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 6rem), calc(100% - 12rem))` }}
          >
            <div className="mb-1 font-semibold">{tooltipTitle(hover)}</div>
            {series.map((s) => (
              <div key={s.id} className="flex justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-muted">
                  <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.label}
                </span>
                <span className="tabular">{fmt(s.values[hover])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Satır içi mini çizgi (yanında sayılar gösterilir). */
export function Sparkline({ values, color = 'var(--pal-0)', label }: { values: number[]; color?: string; label: string }) {
  const W = 72;
  const H = 24;
  const max = Math.max(1, ...values);
  const coords = values.map((v, i) => [values.length <= 1 ? W / 2 : 2 + (i / (values.length - 1)) * (W - 4), H - 3 - (v / max) * (H - 6)] as const);
  const last = coords[coords.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="shrink-0">
      <polyline points={coords.map(([a, b]) => `${a},${b}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />}
    </svg>
  );
}

/** Tek seri aylık çubuklar + kesikli ortalama çizgisi. */
export function MonthBars({ points, color, average, ariaLabel }: { points: { month: MonthKey; value: number }[]; color: string; average?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 140;
  const top = 14;
  const base = H - 22;
  const max = Math.max(1, average ?? 0, ...points.map((p) => p.value));
  const colW = W / points.length;
  const barW = Math.min(28, colW - 8);
  const scale = (v: number) => (v / max) * (base - top);
  const h = hover !== null ? points[hover] : undefined;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
        {points.map((p, i) => {
          const cx = colW * i + colW / 2;
          const bh = scale(p.value);
          return (
            <g key={p.month} opacity={hover === null || hover === i ? 1 : 0.45} data-testid="month-bar">
              <path d={topRoundedBar(cx - barW / 2, base - bh, barW, bh, 4)} fill={color} />
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {shortMonthLabel(p.month)}
              </text>
              <rect
                x={colW * i}
                y={0}
                width={colW}
                height={H}
                fill="transparent"
                tabIndex={0}
                aria-label={`${monthLabel(p.month)}: ${formatTRY(p.value)}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
        {average !== undefined && average > 0 && (
          <g pointerEvents="none">
            <line x1="0" x2={W} y1={base - scale(average)} y2={base - scale(average)} stroke="var(--text)" strokeOpacity="0.6" strokeDasharray="4 3" />
            <text x={W - 2} y={base - scale(average) - 4} textAnchor="end" fontSize="10" fill="var(--muted)">
              ort. {formatCompactTRY(average)}
            </text>
          </g>
        )}
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--muted)" strokeOpacity="0.4" />
      </svg>
      {h && hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `clamp(0px, calc(${((hover + 0.5) / points.length) * 100}% - 4.5rem), calc(100% - 9rem))` }}
        >
          <span className="font-semibold">{monthLabel(h.month)}</span> · <span className="tabular">{formatTRY(h.value)}</span>
        </div>
      )}
    </div>
  );
}
