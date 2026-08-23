"use client";
// ============================================================
// ASCEND — Libreria chart condivisa (SVG puro, zero dipendenze)
// Dark-adaptata, minimal. Numeri in tabular-nums nei tooltip.
// ACCENTO: blu #4C7EFF. Verde/rosso SOLO per valori P&L.
// Serie multi-colore vivaci: VIOLET/CYAN/MAGENTA/AMBER (costanti
// esportate); dentro i chart var(--...) per seguire il tema.
// ============================================================

import { useId } from "react";

import { isMarketOpen, marketDaysInMonth } from "@/lib/market-days";

export const ACCENT = "#4C7EFF";
export const SUCCESS = "#2ddf9e";
export const DANGER = "#ff5c5c";
export const MUTED = "#3a3a3f";
// Palette multi-serie vivace: usata per donut/serie categoriche.
// Hex solo qui (costanti esportate); dentro i chart si usa var(--...)
// così i colori seguono il tema (default / black).
export const VIOLET = "#a78bfa";
export const CYAN = "#22d3ee";
export const MAGENTA = "#ec4899";
export const AMBER = "#fbbf24";

/** Ruota serie multi-colore (donut, barre raggruppate, sparkline multiple). */
export const SERIES_COLORS = [ACCENT, VIOLET, CYAN, MAGENTA, AMBER, SUCCESS] as const;

/** Colore i-esimo della rotazione serie. */
export function seriesColor(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}

function fmtY(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "M";
  if (abs >= 10_000) return (n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "k";
  if (abs >= 1000) return n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
  return n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}

// ------------------------------------------------------------
// LineChart — curva (equity, trend). Area con gradiente opzionale.
// ------------------------------------------------------------
export interface LinePoint {
  x: string; // label (es. day key o mese)
  y: number;
}

export function LineChart({
  data,
  height = 180,
  color = "var(--accent)", // ≡ ACCENT (#4C7EFF) ma adattato al tema via CSS var
  fill = true,
  yFormatter = fmtY,
  strokeWidth = 2,
  label, // aria-label opzionale → <title> nel svg
}: {
  data: LinePoint[];
  height?: number;
  color?: string;
  fill?: boolean;
  yFormatter?: (n: number) => string;
  strokeWidth?: number;
  label?: string;
}) {
  const gid = useId();
  const W = 600;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  if (data.length === 0) {
    return <ChartEmpty height={height} />;
  }
  const ys = data.map((d) => d.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const pts = data.map((d, i) => {
    const x = padL + (i / Math.max(1, data.length - 1)) * iw;
    const y = padT + ((max - d.y) / span) * ih;
    return { x, y };
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1].x.toFixed(1)},${(H - padB).toFixed(1)} L${pts[0].x.toFixed(1)},${(H - padB).toFixed(1)} Z`;
  const step = Math.max(1, Math.round(data.length / 5));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={label}>
        {label && <title>{label}</title>}
        {fill && (
          <>
            <defs>
              <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.45" />
                <stop offset="55%" stopColor={color} stopOpacity="0.16" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#g${gid})`} />
          </>
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        {/* ultimo punto evidenziato */}
        {pts.length > 0 && (
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3.5" fill={color} />
        )}
        {/* griglia orizzontale leggera */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={padT + ih * f} y2={padT + ih * f} stroke={MUTED} strokeOpacity="0.35" strokeWidth="0.6" strokeDasharray="3 4" />
        ))}
        {/* etichette x */}
        {data.map((d, i) =>
          i % step === 0 || i === data.length - 1 ? (
            <text key={i} x={pts[i].x} y={H - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="10">
              {d.x}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-1 flex justify-end">
        <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] tnum text-secondary-text">
          {yFormatter(data[data.length - 1].y)}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// BarsChart — barre verticali singole (entrate, minuti, etc)
// ------------------------------------------------------------
export function BarsChart({
  data,
  height = 180,
  color = "var(--accent)", // ≡ ACCENT, via CSS var
  negativeColor = "var(--danger)", // ≡ DANGER, via CSS var
  showValue = true,
  label, // aria-label opzionale → <title> nel svg
}: {
  data: { x: string; y: number }[];
  height?: number;
  color?: string;
  negativeColor?: string;
  showValue?: boolean;
  label?: string;
}) {
  if (data.length === 0) return <ChartEmpty height={height} />;
  const W = 600;
  const H = height;
  const padB = 22;
  const padT = 14;
  const iw = W - 10;
  const ih = H - padT - padB;
  const ys = data.map((d) => d.y);
  const min = Math.min(0, ...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const bw = Math.min(42, iw / data.length - 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={label}>
      {label && <title>{label}</title>}
      <line x1={5} x2={W - 5} y1={padT + ((max - 0) / span) * ih} y2={padT + ((max - 0) / span) * ih} stroke={MUTED} strokeOpacity="0.5" strokeWidth="0.6" />
      {data.map((d, i) => {
        const x = 5 + (i * iw) / data.length + (iw / data.length - bw) / 2;
        const total = Math.abs(d.y) / span * ih;
        const y = d.y >= 0 ? padT + ((max - d.y) / span) * ih : padT + ((max - 0) / span) * ih;
        const barColor = d.y < 0 ? negativeColor : color;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={Math.max(1, total)} rx="2.5" fill={barColor} opacity="0.95" />
            {showValue && (
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="9" className="tnum">
                {fmtY(d.y)}
              </text>
            )}
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="10">
              {d.x}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// GroupedBars — entrate vs uscite per mese (con valore 0 in mezzo)
// ------------------------------------------------------------
export function GroupedBars({
  data,
  height = 200,
  label, // aria-label opzionale → <title> nel svg
}: {
  data: { x: string; income: number; expense: number }[];
  height?: number;
  label?: string;
}) {
  if (data.length === 0) return <ChartEmpty height={height} />;
  const W = 600;
  const H = height;
  const padB = 22;
  const padT = 14;
  const iw = W - 10;
  const ih = H - padT - padB;
  const all = data.flatMap((d) => [d.income, d.expense]);
  const max = Math.max(...all, 1);
  const bw = Math.min(20, iw / data.length / 2 - 3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img" aria-label={label}>
      {label && <title>{label}</title>}
      <line x1={5} x2={W - 5} y1={padT + ih} y2={padT + ih} stroke={MUTED} strokeOpacity="0.6" strokeWidth="0.8" />
      {data.map((d, i) => {
        const cx = 5 + (i * iw) / data.length + (iw / data.length) / 2;
        const hInc = (d.income / max) * ih;
        const hExp = (d.expense / max) * ih;
        return (
          <g key={i}>
            <rect x={cx - bw - 1} y={padT + ih - hInc} width={bw} height={Math.max(1, hInc)} rx="2.5" fill="var(--success)" opacity="0.95" />
            <rect x={cx + 1} y={padT + ih - hExp} width={bw} height={Math.max(1, hExp)} rx="2.5" fill="var(--danger)" opacity="0.88" />
            <text x={cx} y={H - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="10">
              {d.x}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// DonutChart — composizione (categorie)
// ------------------------------------------------------------
export function DonutChart({
  data,
  size = 160,
  thickness = 26,
  centerLabel,
  centerValue,
  label, // aria-label opzionale → <title> nel svg
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  label?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
        {label && <title>{label}</title>}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-elevated)" strokeWidth={thickness} />
        {total > 0 &&
          data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += dash;
            return el;
          })}
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill="var(--text-muted)" fontSize="11">
          {centerLabel ?? ""}
        </text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fill="var(--text-primary)" fontSize="15" fontWeight="600" className="tnum">
          {centerValue ?? ""}
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-secondary-text">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              {d.label}
            </span>
            <span className="tnum text-foreground">
              {fmtY(d.value)}
              {total > 0 && <span className="ml-1 text-muted-foreground">({Math.round((d.value / total) * 100)}%)</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ActivityHeatmap — calendario stile GitHub (ultimi N giorni)
// Livelli: 0..4
// ------------------------------------------------------------
export function ActivityHeatmap({
  weeks,
  // Scala d'attività su brand blu→azzurro; celle vuote dal tema via var(--...)
  levelColors = ["var(--bg-elev-3)", "#27354f", "#31519e", "#4C7EFF", VIOLET],
  weekLabels = ["L", "M", "M", "G", "V", "S", "D"],
  onPick,
}: {
  weeks: { date: string; level: 0 | 1 | 2 | 3 | 4 }[][]; // array di settimane (colonne), ogni settimana = 7 celle
  levelColors?: string[];
  weekLabels?: string[];
  onPick?: (date: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      <div className="flex flex-col justify-between py-0.5 pr-1 text-[10px] text-muted-foreground">
        {weekLabels.map((l, i) => (
          <span key={i} className="h-3 leading-3" style={{ height: 14 }}>
            {l}
          </span>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell, di) => (
              <div
                key={di}
                role="button"
                tabIndex={0}
                title={cell.date}
                onClick={() => onPick?.(cell.date)}
                style={{ backgroundColor: levelColors[cell.level] }}
                className="h-[14px] w-[14px] cursor-pointer rounded-[3px] transition-transform hover:scale-125"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// PnlCalendar — calendario P&L mensile (raggruppato per trading day)
// Privacy "complete" → neutralizza i colori (grigio).
// "Oggi" evidenziato SOLO via prop todayKey (deterministico SSR/client);
// niente new Date() nel render.
// ------------------------------------------------------------
export function PnlCalendar({
  month, // "yyyy-MM"
  days, // { dayKey: string, pnl: number }[]
  nativeCurrency = "EUR",
  locale = "it-IT",
  neutral = false,
  limit = 0, // limite per cui il colore si satura
  todayKey, // "yyyy-MM-dd": vedi @/lib/dates todayKey(timezone) — omesso ⇒ nessun giorno evidenziato
}: {
  month: string;
  days: { dayKey: string; pnl: number }[];
  nativeCurrency?: string;
  locale?: string;
  neutral?: boolean;
  limit?: number;
  todayKey?: string; // "yyyy-MM-dd": evita new Date() in render (hydration SSR/client)
}) {
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const dim = new Date(y, m, 0).getDate();
  const pnlMap = new Map(days.map((d) => [d.dayKey, d.pnl]));
  const cells: (string | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= dim; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push(key);
  }
  const maxAbs = Math.max(...days.map((d) => Math.abs(d.pnl)), limit, 1);
  const colorFor = (p: number): string => {
    if (neutral) return "var(--border-strong)";
    if (p > 0) {
      const a = 0.25 + 0.6 * Math.min(1, p / maxAbs);
      return `rgba(45,223,158,${a})`;
    }
    if (p < 0) {
      const a = 0.25 + 0.6 * Math.min(1, Math.abs(p) / maxAbs);
      return `rgba(255,92,92,${a})`;
    }
    return "var(--bg-elev-3)";
  };
  const fmt = (p: number) => {
    const abs = Math.abs(p).toLocaleString(locale, { maximumFractionDigits: 0 });
    return `${p > 0 ? "+" : p < 0 ? "−" : ""}${abs}`;
  };
  // Sab/dom senza trade = mercato chiuso: cella più scura/trasparente e
  // attenuata, ma comunque renderizzata (griglia regolare). I trade
  // importati storicamente nei weekend restano normali (nessun marker).
  const isWeekendClosed = (key: string): boolean => !pnlMap.has(key) && !isMarketOpen(key);
  const marketDays = marketDaysInMonth(month);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((key, i) => {
          if (!key) return <div key={i} />;
          const pnl = pnlMap.get(key);
          const isToday = todayKey != null && key === todayKey;
          const weekendClosed = isWeekendClosed(key);
          return (
            <div
              key={i}
              title={
                pnl != null
                  ? `${key}: ${fmt(pnl)} ${nativeCurrency}`
                  : weekendClosed
                    ? "Mercato chiuso"
                    : key
              }
              style={{
                backgroundColor: pnl != null ? colorFor(pnl) : weekendClosed ? "#101012" : "var(--bg-elev-1)",
                opacity: weekendClosed ? 0.55 : 1,
              }}
              className={`flex aspect-square flex-col items-center justify-center rounded-md text-[10px] tnum ${
                isToday ? "outline outline-1 outline-accent" : ""
              }`}
            >
              <span className="text-[10px] text-black/70">{key.slice(8)}</span>
              {pnl != null && !neutral && (
                <span className="text-[10px] font-semibold text-black/85">{fmt(pnl)}</span>
              )}
              {pnl != null && neutral && <span className="text-[10px] text-black/40">••</span>}
            </div>
          );
        })}
      </div>
      {marketDays > 0 && (
        <p className="tnum mt-1.5 text-[10px] text-muted-foreground">{marketDays} giorni di mercato</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Mini — sparkline per card
// ------------------------------------------------------------
export function Sparkline({
  data,
  height = 36,
  color = "var(--accent)", // ≡ ACCENT, via CSS var
  label, // aria-label opzionale → <title> nel svg
}: {
  data: number[];
  height?: number;
  color?: string;
  label?: string;
}) {
  if (data.length < 2) return null;
  const W = 100;
  const H = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / span) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      {label && <title>{label}</title>}
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      style={{ height }}
      className="flex items-center justify-center rounded-lg border border-dashed border-border-strong text-xs text-muted-foreground"
    >
      Nessun dato nel periodo
    </div>
  );
}
