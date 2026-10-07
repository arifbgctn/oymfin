import { useState } from 'react';
import { formatCompactMoney, formatPercent, formatMoney } from '../domain/money';
import { monthLabel, shortMonthLabel } from '../domain/month';
import { chartColor } from '../domain/seed';
import type { TrendPoint } from '../domain/summary';
import type { MonthKey } from '../domain/types';

export interface DonutSlice {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  value: number;
  share: number;
}

/** Halka grafik: dilimler arasında 2px boşluk, üzerine gelince ortada ad + tutar + pay. */
export function DonutChart({ slices, centerLabel, centerValue, ariaLabel }: { slices: DonutSlice[]; centerLabel: string; centerValue: string; ariaLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  const R = 46;
  const C = 2 * Math.PI * R;
  const gap = slices.length > 1 ? 1.6 : 0;
  let offset = 0;
  const hovered = slices.find((s) => s.id === active);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative size-44 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={ariaLabel}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
          {slices.map((s) => {
            const len = s.share * C;
            const el = (
              <circle
                key={s.id}
                data-testid="donut-slice"
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={chartColor(s.color)}
                strokeWidth={active === s.id ? 17 : 14}
                strokeDasharray={`${Math.max(len - gap, 0.01)} ${C - Math.max(len - gap, 0.01)}`}
                strokeDashoffset={-offset}
                onMouseEnter={() => setActive(s.id)}
                onMouseLeave={() => setActive(null)}
                onClick={() => setActive((a) => (a === s.id ? null : s.id))}
                className="cursor-pointer transition-[stroke-width]"
              >
                <title>{`${s.name}: ${formatMoney(s.value)} (${formatPercent(s.share * 100)})`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-xs text-muted">{hovered ? hovered.name : centerLabel}</span>
          <span className="text-[15px] font-bold leading-tight">{hovered ? formatMoney(hovered.value) : centerValue}</span>
          {hovered && <span className="text-xs text-muted">{formatPercent(hovered.share * 100)}</span>}
        </div>
      </div>
      <ul className="w-full space-y-1" aria-label="Açıklama">
        {slices.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onMouseEnter={() => setActive(s.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.id)}
              onBlur={() => setActive(null)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${active === s.id ? 'bg-surface-2' : ''}`}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: chartColor(s.color) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {s.emoji && <span aria-hidden>{s.emoji} </span>}
                {s.name}
              </span>
              <span className="tabular text-muted">{formatPercent(s.share * 100, 0)}</span>
              <span className="tabular w-28 text-right font-medium">{formatMoney(s.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function topRoundedBar(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Aylara göre gelir (mavi) / gider (turuncu) çubukları; tek eksen, üzerine gelince ipucu. */
export function TrendBars({ data, selected }: { data: TrendPoint[]; selected?: MonthKey }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 150;
  const top = 12;
  const base = H - 22;
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const colW = W / data.length;
  const barW = Math.min(18, (colW - 14) / 2);
  const scale = (v: number) => (v / max) * (base - top);
  const h = hover !== null ? data[hover] : undefined;

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--chart-income)]" aria-hidden /> Gelir
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--chart-expense)]" aria-hidden /> Gider
        </span>
        <span className="ml-auto tabular">en yüksek {formatCompactMoney(max)}</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Son ${data.length} ayın gelir ve gideri`}>
          <line x1="0" x2={W} y1={top} y2={top} stroke="var(--grid)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="0" x2={W} y1={(top + base) / 2} y2={(top + base) / 2} stroke="var(--grid)" strokeWidth="1" strokeDasharray="3 3" />
          {data.map((d, i) => {
            const cx = colW * i + colW / 2;
            const hi = scale(d.income);
            const he = scale(d.expense);
            const isSel = d.month === selected;
            return (
              <g key={d.month} data-testid="trend-group" opacity={hover === null || hover === i ? 1 : 0.45}>
                <path d={topRoundedBar(cx - barW - 1, base - hi, barW, hi, 4)} fill="var(--chart-income)" />
                <path d={topRoundedBar(cx + 1, base - he, barW, he, 4)} fill="var(--chart-expense)" />
                <text x={cx} y={H - 6} textAnchor="middle" fontSize="11" fill={isSel ? 'var(--text)' : 'var(--muted)'} fontWeight={isSel ? 700 : 400}>
                  {shortMonthLabel(d.month)}
                </text>
                <rect
                  x={colW * i}
                  y={0}
                  width={colW}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${monthLabel(d.month)}: gelir ${formatMoney(d.income)}, gider ${formatMoney(d.expense)}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => setHover((x) => (x === i ? null : i))}
                />
              </g>
            );
          })}
          <line x1="0" x2={W} y1={base} y2={base} stroke="var(--muted)" strokeOpacity="0.4" strokeWidth="1" />
        </svg>
        {h && hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border border-border bg-surface p-2.5 text-xs shadow-lg"
            style={{ left: `clamp(0px, calc(${((hover + 0.5) / data.length) * 100}% - 5.5rem), calc(100% - 11rem))` }}
          >
            <div className="mb-1 font-semibold">{monthLabel(h.month)}</div>
            <div className="flex justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-muted">
                <span className="size-2 rounded-sm bg-[var(--chart-income)]" /> Gelir
              </span>
              <span className="tabular">{formatMoney(h.income)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-muted">
                <span className="size-2 rounded-sm bg-[var(--chart-expense)]" /> Gider
              </span>
              <span className="tabular">{formatMoney(h.expense)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-2 border-t border-border pt-1 font-semibold">
              <span>Net</span>
              <span className="tabular">{formatMoney(h.income - h.expense)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
