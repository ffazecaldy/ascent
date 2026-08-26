"use client";
// ============================================================
// ASCEND — Uso del PC (spec 4.4) · art-direct v2 rich+animated
// Stile myfundedbook: KPI con spark, card hairline+texture,
// Donut colorato per categoria, anteprima CSV curata, reveal.
// ============================================================

import { useMemo, useState, type ReactNode } from "react";
import { useDB, updateDB, upsert, removeById, uid, nowISO } from "@/lib/storage";
import type { PCUsageLog, PCAppCategoryMap } from "@/lib/types";
import { todayKey, addDaysKey, weekStartKey, monthKeyOf, labelDayKey } from "@/lib/dates";
import { pcMinutesInWeek } from "@/lib/compute";
import { minutiToOre } from "@/lib/format";
import { SectionHeader, ProgressBar, Tabs } from "@/components/ui/Misc";
import { Card, CardTitle, CardHeader, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, TextArea } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { Reveal } from "@/components/ui/Reveal";
import { BarsChart, DonutChart } from "@/components/charts";
import { Icon } from "@/components/ui/Icon";
import { AutoTrackerImport } from "@/components/usopc/AutoTrackerImport";
import { TrackerLive } from "@/components/usopc/TrackerLive";
import { SystemTab } from "@/components/usopc/SystemTab";
import { HealthTab } from "@/components/usopc/HealthTab";

const DEFAULT_CATEGORIES = [
  "Lavoro",
  "Sviluppo",
  "Studio",
  "Tempo perso",
  "Gaming",
  "Social",
  "Altro",
];

/** Colori di default per fascia. Coprono le categorie italiane storiche
 *  E quelle prodotte dal tracker (Web, Dev, Media, Social, Communication,
 *  Productivity, Design, System, Gaming, Other). */
const CATEGORY_COLORS: Record<string, string> = {
  Lavoro: "#4C7EFF",
  Sviluppo: "#8b5cf6",
  Studio: "#06b6d4",
  "Tempo perso": "#ef4444",
  Gaming: "#f97316",
  Social: "#ec4899",
  Altro: "#64748b",
  // categorie del tracker
  Web: "#38bdf8",
  Dev: "#a78bfa",
  Media: "#f472b6",
  Communication: "#34d399",
  Productivity: "#fbbf24",
  Design: "#e879f9",
  System: "#94a3b8",
  Other: "#6b7280",
};

/** Colore fascia: regola personalizzata → default categoria → fallback grigio. */
function catColor(db: { pcAppCategoryMap: PCAppCategoryMap[] }, cat: string): string {
  const custom = db.pcAppCategoryMap.find((m) => m.appName === cat && m.color);
  return custom?.color ?? CATEGORY_COLORS[cat] ?? "#64748b";
}

const PRODUCTIVE = ["Lavoro", "Sviluppo", "Dev", "Studio"];

/** Data valida in formato yyyy-MM-dd (e giorno reale del calendario). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDayKey(dk: string): boolean {
  if (!ISO_DATE_RE.test(dk)) return false;
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Mini sparkline (stat card custom obiettivo settimana). */
function TinySpark({ data, color = "#4C7EFF" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const W = 60;
  const H = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - 2 - ((v - min) / span) * (H - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-5 w-15" preserveAspectRatio="none">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function UsoPcPage() {
  const db = useDB();
  const tz = db.settings.timezone;
  const locale = db.settings.locale || "it-IT";

  // --- categorie note = default + quelle usate nei log ---
  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    db.pcUsageLogs.forEach((p) => set.add(p.categoryId));
    db.pcAppCategoryMap.forEach((m) => set.add(m.category));
    return Array.from(set);
  }, [db.pcUsageLogs, db.pcAppCategoryMap]);

  const [day, setDay] = useState(() => todayKey(tz));
  const [tab, setTab] = useState("giorno");

  const today = todayKey(tz);
  const month = monthKeyOf(day);
  const yestKey = addDaysKey(today, -1);

  const logsMonth = useMemo(
    () => db.pcUsageLogs.filter((p) => monthKeyOf(p.date) === month),
    [db.pcUsageLogs, month]
  );
  const logsDay = useMemo(
    () => db.pcUsageLogs.filter((p) => p.date === day),
    [db.pcUsageLogs, day]
  );

  // --- metriche KPI ---
  const totalTodayMin = useMemo(() => logsDay.reduce((s, p) => s + p.minutes, 0), [logsDay]);
  const productiveToday = useMemo(
    () => db.pcUsageLogs.filter((p) => p.date === today && PRODUCTIVE.includes(p.categoryId)).reduce((s, p) => s + p.minutes, 0),
    [db.pcUsageLogs, today]
  );
  const monthTotalMin = useMemo(() => logsMonth.reduce((s, p) => s + p.minutes, 0), [logsMonth]);

  // minuti per giorno, ultimi 7 giorni (per spark)
  const last7TotalsMin = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const dk = addDaysKey(today, i - 6);
        return db.pcUsageLogs.filter((p) => p.date === dk).reduce((s, p) => s + p.minutes, 0);
      }),
    [db.pcUsageLogs, today]
  );
  const last7ProdMin = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const dk = addDaysKey(today, i - 6);
        return db.pcUsageLogs.filter((p) => p.date === dk && PRODUCTIVE.includes(p.categoryId)).reduce((s, p) => s + p.minutes, 0);
      }),
    [db.pcUsageLogs, today]
  );
  // minuti per giorno del mese corrente (spark card "ore mese")
  const monthDailyMin = useMemo(() => {
    const start = month + "-01";
    const arr: number[] = [];
    let cursor = start;
    for (let i = 0; i < 40; i++) {
      if (monthKeyOf(cursor) !== month) break;
      arr.push(db.pcUsageLogs.filter((p) => p.date === cursor).reduce((s, p) => s + p.minutes, 0));
      cursor = addDaysKey(cursor, 1);
    }
    return arr;
  }, [db.pcUsageLogs, month]);

  // deltas vs ieri
  const delta = useMemo(() => {
    const yestTotal = db.pcUsageLogs.filter((p) => p.date === yestKey).reduce((s, p) => s + p.minutes, 0);
    const yestProd = db.pcUsageLogs.filter((p) => p.date === yestKey && PRODUCTIVE.includes(p.categoryId)).reduce((s, p) => s + p.minutes, 0);
    return { total: totalTodayMin - yestTotal, prod: productiveToday - yestProd };
  }, [db.pcUsageLogs, yestKey, totalTodayMin, productiveToday]);

  const deltaTone = (v: number): "positive" | "negative" | "neutral" => (v > 0 ? "positive" : v < 0 ? "negative" : "neutral");
  const deltaLabel = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${minutiToOre(Math.abs(v))} vs ieri`;

  const weeklyGoal = db.weeklyGoals.find((g) => g.type === "pc_hours" && g.active);
  const weekStart = weekStartKey(today, db.settings.weekStart);
  const pcMinutesWeek = pcMinutesInWeek(db, weekStart);
  const goalMin = weeklyGoal ? weeklyGoal.targetValue * 60 : 0;
  const weekPct = goalMin > 0 ? Math.min(100, Math.round((pcMinutesWeek / goalMin) * 100)) : 0;

  const byCategoryMonth = useMemo(() => {
    const map = new Map<string, number>();
    logsMonth.forEach((p) => map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + p.minutes));
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value, color: catColor(db, label) }))
      .sort((a, b) => b.value - a.value);
  }, [logsMonth, db]);

  const byCategoryDay = useMemo(() => {
    const map = new Map<string, number>();
    logsDay.forEach((p) => map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + p.minutes));
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [logsDay]);

  const last7 = useMemo(() => {
    return last7TotalsMin.map((mins, i) => ({
      x: addDaysKey(today, i - 6).slice(8) + "/" + addDaysKey(today, i - 6).slice(5, 7),
      y: Math.round(mins / 60),
    }));
  }, [last7TotalsMin, today]);

  // --- modal inserimento ---
  const [open, setOpen] = useState(false);
  const [fDate, setFDate] = useState(() => todayKey(db.settings.timezone));
  const [fCat, setFCat] = useState(DEFAULT_CATEGORIES[0]);
  const [fMin, setFMin] = useState("60");
  const [fSrc, setFSrc] = useState<PCUsageLog["source"]>("manuale");

  const addLog = () => {
    const minutes = Number(fMin);
    if (!fCat || !fDate || minutes <= 0) return;
    updateDB((d) => ({
      ...d,
      pcUsageLogs: upsert(d.pcUsageLogs, {
        id: uid(),
        date: fDate,
        categoryId: fCat,
        minutes,
        source: fSrc,
        createdAt: nowISO(),
      }),
    }));
    setOpen(false);
    setFDate(todayKey(db.settings.timezone));
    setFMin("60");
  };

  const delLog = (id: string) => updateDB((d) => ({ ...d, pcUsageLogs: removeById(d.pcUsageLogs, id) }));

  // --- CSV import ---
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<{ date: string; category: string; minutes: number; ok: boolean; err?: string }[]>([]);

  const parseCsv = () => {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    const sep = csvText.includes(";") ? ";" : csvText.includes("\t") ? "\t" : ",";
    const out: typeof csvPreview = [];
    lines.forEach((line) => {
      const parts = line.split(sep).map((s) => s.trim());
      const date = parts[0] ?? "";
      const category = parts[1] ?? "";
      const minutesRaw = parts[2] ?? "";
      const minutes = Number(minutesRaw);
      let err: string | undefined;
      if (parts.length < 3 || !date || !category || !minutesRaw) {
        err = "annotazione incompleta: data,categoria,minuti";
      } else if (!isValidDayKey(date)) {
        err = `data non valida: “${date}” (yyyy-MM-dd)`;
      } else if (isNaN(minutes) || minutes <= 0 || !Number.isInteger(minutes)) {
        err = "minuti: intero positivo atteso";
      } else {
        out.push({ date, category, minutes, ok: true });
        return;
      }
      out.push({ date, category, minutes, ok: false, err });
    });
    setCsvPreview(out);
  };

  const validCount = csvPreview.filter((r) => r.ok).length;
  const errCount = csvPreview.length - validCount;
  const validMin = csvPreview.filter((r) => r.ok).reduce((s, r) => s + r.minutes, 0);

  const importCsv = () => {
    const valid = csvPreview.filter((r) => r.ok);
    if (valid.length === 0) return;
    updateDB((d) => ({
      ...d,
      pcUsageLogs: [
        ...d.pcUsageLogs,
        ...valid.map((r) => ({
          id: uid(),
          date: r.date,
          categoryId: r.category,
          minutes: r.minutes,
          source: "csv" as PCUsageLog["source"],
          createdAt: nowISO(),
        })),
      ],
    }));
    setCsvOpen(false);
    setCsvText("");
    setCsvPreview([]);
  };

  // --- app→categoria map (con colore fascia personalizzato) ---
  const [mapOpen, setMapOpen] = useState(false);
  const [appName, setAppName] = useState("");
  const [appCat, setAppCat] = useState(DEFAULT_CATEGORIES[0]);
  const [appColor, setAppColor] = useState<string>(CATEGORY_COLORS[DEFAULT_CATEGORIES[0]] ?? "#64748b");
  const [editMapId, setEditMapId] = useState<string | null>(null);

  // quando cambia la categoria, proponi il suo colore di default
  const onCatChange = (c: string) => {
    setAppCat(c);
    if (!editMapId) setAppColor(CATEGORY_COLORS[c] ?? "#64748b");
  };

  const saveMap = () => {
    if (!appName.trim()) return;
    updateDB((d) => ({
      ...d,
      pcAppCategoryMap: upsert(d.pcAppCategoryMap, editMapId
        ? { id: editMapId, appName: appName.trim(), category: appCat, color: appColor }
        : { id: uid(), appName: appName.trim(), category: appCat, color: appColor }),
    }));
    setAppName("");
    setEditMapId(null);
  };

  const startEditMap = (m: PCAppCategoryMap) => {
    setEditMapId(m.id);
    setAppName(m.appName);
    setAppCat(m.category);
    setAppColor(m.color ?? CATEGORY_COLORS[m.category] ?? "#64748b");
  };

  // --- header content (azioni) ---
  const [autoTrackerOpen, setAutoTrackerOpen] = useState(false);
  
  const actions: ReactNode = (
    <>
      <Button variant="outline" size="sm" onClick={() => setAutoTrackerOpen(true)}>
        <Icon name="download" size={14} className="mr-1" />
        Importa auto-tracker
      </Button>
      <Button variant="outline" size="sm" onClick={() => setMapOpen(true)}>
        <Icon name="settings" size={14} className="mr-1" />
        Regole app/siti
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
        Import CSV
      </Button>
      <Button size="sm" glow onClick={() => setOpen(true)}>
        + Registra
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker="Uso del PC"
          title="Dove vanno le tue ore."
          subtitle="Ore produttive, distrazioni e trend degli ultimi 7 giorni — tutto il tuo tempo in un colpo d'occhio."
          action={actions}
        />
      </Reveal>

      {/* Tracker live — registrazione dinamica (in alto, prima dei KPI) */}
      <Reveal delay={10}>
        <TrackerLive />
      </Reveal>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Reveal delay={0}>
          <StatCard
            label="Ore produttive oggi"
            value={minutiToOre(productiveToday)}
            icon={<Icon name="monitor" size={16} className="text-accent" />}
            delta={deltaLabel(delta.prod)}
            deltaTone={deltaTone(delta.prod)}
            spark={last7ProdMin}
            sparkColor="#4C7EFF"
            className="h-full"
          />
        </Reveal>
        <Reveal delay={60}>
          <StatCard
            label="Ore oggi"
            value={minutiToOre(totalTodayMin)}
            icon={<Icon name="timer" size={16} className="text-accent-3" />}
            delta={`${logsDay.length} ${logsDay.length === 1 ? "log" : "log"}`}
            deltaTone="neutral"
            spark={last7TotalsMin}
            sparkColor="#2FD4FF"
            className="h-full"
          />
        </Reveal>
        <Reveal delay={120}>
          <StatCard
            label="Ore del mese"
            value={minutiToOre(monthTotalMin)}
            icon={<Icon name="calendar" size={16} className="text-accent-2" />}
            delta={month}
            deltaTone="neutral"
            spark={monthDailyMin}
            sparkColor="#8A6BFF"
            className="h-full"
          />
        </Reveal>
        <Reveal delay={180}>
          {/* Obiettivo settimana — StatCard-like con ProgressBar + spark */}
          <Card hairline="accent" className="flex h-full flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Obiettivo settimana
              </span>
              <Icon name="target" size={16} className="text-accent" />
            </div>
            <div className="text-[26px] font-semibold leading-none tracking-tight tnum">
              {minutiToOre(pcMinutesWeek)}
              {goalMin > 0 && (
                <span className="ml-1 text-sm font-medium text-muted-foreground">/ {minutiToOre(goalMin)}</span>
              )}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                {goalMin > 0 ? (
                  <>
                    <ProgressBar value={pcMinutesWeek} max={goalMin} className="h-1.5" />
                    <span className="mt-1 block text-[11px] tnum text-muted-foreground">{weekPct}% della meta</span>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Configura il goal in Obiettivi</span>
                )}
              </div>
              <TinySpark data={last7TotalsMin} />
            </div>
          </Card>
        </Reveal>
      </div>

      {/* Viste: giorno / mese / trend */}
      <Reveal delay={40}>
        <Card hairline="accent" texture>
          <CardHeader>
            <div>
              <CardTitle>Viste</CardTitle>
              <CardSubtitle>Giorno, composizione mensile, trend, sistema e salute</CardSubtitle>
            </div>
            <Badge tone="info">
              {tab === "giorno" ? "Giorno" : tab === "mese" ? "Mese" : tab === "trend" ? "Trend" : tab === "sistema" ? "Sistema" : "Salute"}
            </Badge>
          </CardHeader>
          <Tabs
            tabs={[
              { id: "giorno", label: "Giorno" },
              { id: "mese", label: "Mese" },
              { id: "trend", label: "Trend 7gg" },
              { id: "sistema", label: "Sistema" },
              { id: "salute", label: "Salute" },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "sistema" && (
            <div className="animate-pop mt-4">
              <SystemTab />
            </div>
          )}
          {tab === "salute" && (
            <div className="animate-pop mt-4">
              <HealthTab today={today} />
            </div>
          )}
          <div key={tab} className="animate-pop mt-4">
            {tab === "giorno" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-auto" />
                  {day !== today && (
                    <Button variant="ghost" size="sm" onClick={() => setDay(today)}>
                      Oggi
                    </Button>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">{labelDayKey(day, locale)}</span>
                </div>
                {logsDay.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
                      <Icon name="monitor" size={30} className="text-accent" />
                    </div>
                    <p className="text-sm font-medium text-secondary-text">Nessun log per questo giorno</p>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <BarsChart
                      data={byCategoryDay.map((c) => ({ x: c.label, y: c.value }))}
                      color="#4C7EFF"
                      height={160}
                    />
                    <div className="space-y-1.5">
                      {byCategoryDay.map((c) => {
                        const color = catColor(db, c.label);
                        const pctDay = totalTodayMin > 0 ? Math.round((c.value / totalTodayMin) * 100) : 0;
                        return (
                          <div key={c.label} className="flex items-center justify-between rounded-lg border border-border bg-elevated/40 px-3 py-2 text-sm">
                            <span className="flex items-center gap-2 text-secondary-text">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                              {c.label}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="tnum font-medium">{minutiToOre(c.value)}</span>
                              <span className="tnum w-9 text-right text-[11px] text-muted-foreground">{pctDay}%</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab === "mese" &&
              (byCategoryMonth.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
                    <Icon name="chart-bar" size={30} className="text-accent" />
                  </div>
                  <p className="text-sm font-medium text-secondary-text">Nessun dato questo mese</p>
                </div>
              ) : (
                <DonutChart
                  data={byCategoryMonth}
                  centerLabel="Totale"
                  centerValue={minutiToOre(byCategoryMonth.reduce((s, c) => s + c.value, 0))}
                />
              ))}
            {tab === "trend" && (
              <div className="space-y-2">
                <BarsChart data={last7} color="#4C7EFF" height={180} />
                <p className="text-right text-[11px] text-muted-foreground">ore al giorno · ultimi 7 giorni</p>
              </div>
            )}
          </div>
        </Card>
      </Reveal>

      {/* Log del giorno */}
      <Reveal delay={20}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Log del giorno selezionato</CardTitle>
              <CardSubtitle>Elimina i log errati</CardSubtitle>
            </div>
            <Badge tone="default">
              <span className="tnum">{minutiToOre(totalTodayMin)}</span>
            </Badge>
          </CardHeader>
          {logsDay.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
                <Icon name="timer" size={30} className="text-accent" />
              </div>
              <p className="text-sm font-medium text-secondary-text">Nessun log</p>
              <div className="mt-2">
                <Button size="sm" onClick={() => setOpen(true)}>+ Registra</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {logsDay.map((p) => (
                <div
                  key={p.id}
                  className="group flex items-center justify-between rounded-lg border border-border bg-elevated/40 px-3 py-2 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: catColor(db, p.categoryId) }} />
                    <Badge>{p.categoryId}</Badge>
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{p.source}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tnum">{minutiToOre(p.minutes)}</span>
                    <span className="hidden text-[11px] tnum text-muted-foreground group-hover:inline">{p.minutes} min</span>
                    <button onClick={() => delLog(p.id)} className="text-muted-foreground transition-colors hover:text-danger" aria-label="Elimina">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Reveal>

      {/* Modal inserimento */}
      <Modal open={open} onClose={() => setOpen(false)} title="Registra uso del PC"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
            <Button onClick={addLog} disabled={!fCat || !fDate || Number(fMin) <= 0}>Salva</Button>
          </>
        }>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data"><Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} /></Field>
          <Field label="Categoria">
            <Select value={fCat} onChange={(e) => setFCat(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Minuti"><Input type="number" min={1} value={fMin} onChange={(e) => setFMin(e.target.value)} /></Field>
          <Field label="Fonte">
            <Select value={fSrc} onChange={(e) => setFSrc(e.target.value as PCUsageLog["source"])}>
              <option value="manuale">manuale</option>
              <option value="csv">csv</option>
              <option value="activitywatch">activitywatch (V2)</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Modal CSV — anteprima curata */}
      <Modal open={csvOpen} onClose={() => setCsvOpen(false)} title="Import CSV uso PC" width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCsvOpen(false)}>Annulla</Button>
            <Button onClick={parseCsv} variant="outline">Anteprima</Button>
            <Button onClick={importCsv} disabled={validCount === 0}>
              Importa {validCount || 0} log
            </Button>
          </>
        }>
        <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
          Una riga per log: <code className="rounded bg-muted px-1 py-0.5 text-accent">data,categoria,minuti</code>{" "}
          (es. <code className="rounded bg-muted px-1 py-0.5 text-accent">2026-08-20,Lavoro,240</code>). Separatore , ; o tab.
        </p>
        <TextArea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={"2026-08-20,Lavoro,240\n2026-08-20,Gaming,90"}
          className="font-mono text-xs"
        />
        {csvPreview.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-elevated/50 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <Badge tone="success">
                  <span className="tnum">{validCount}</span> valide
                </Badge>
                <Badge tone={errCount > 0 ? "danger" : "default"}>
                  <span className="tnum">{errCount}</span> con errore
                </Badge>
                {validMin > 0 && (
                  <span className="text-muted-foreground">
                    totale <span className="tnum text-secondary-text">{minutiToOre(validMin)}</span>
                  </span>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">anteprima</span>
            </div>
            {/* intestazione colonne */}
            <div className="grid grid-cols-[88px_1fr_64px_1.4fr] gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Data</span>
              <span>Categoria</span>
              <span className="text-right">Minuti</span>
              <span className="text-right">Esito</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {csvPreview.map((r, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[88px_1fr_64px_1.4fr] items-center gap-2 border-b border-border/40 px-3 py-1.5 text-xs transition-colors ${
                    r.ok ? "bg-success/[0.05]" : "bg-danger/[0.05]"
                  }`}
                >
                  <span className="tnum text-secondary-text">{r.date || "—"}</span>
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: catColor(db, r.category) }} />
                    <span className="truncate">{r.category || "—"}</span>
                  </span>
                  <span className="tnum text-right text-secondary-text">{r.ok ? `${r.minutes}` : "—"}</span>
                  <span className="flex items-center justify-end gap-1.5 text-right">
                    {r.ok ? (
                      <span className="flex items-center gap-1 text-success">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
                        ok
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-danger">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        <span className="truncate" title={r.err}>{r.err}</span>
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal mapping app/sito → categoria */}
      <Modal open={mapOpen} onClose={() => { setMapOpen(false); setEditMapId(null); setAppName(""); }} title="Regole: app o sito → categoria" width="max-w-md">
        <div className="mb-3 flex items-end gap-2">
          <Field label={editMapId ? "Modifica regola" : "App o sito"} className="flex-1">
            <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="es. Hermes, tradingview.com, Netflix" />
          </Field>
          <Field label="Categoria" className="w-40">
            <Select value={appCat} onChange={(e) => onCatChange(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Colore" className="w-[72px]">
            <label
              className="relative block h-[38px] w-full cursor-pointer overflow-hidden rounded-lg border border-border"
              style={{ backgroundColor: appColor }}
              title={appColor}
            >
              <input
                type="color"
                value={appColor}
                onChange={(e) => setAppColor(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Colore fascia"
              />
            </label>
          </Field>
          <Button size="sm" onClick={saveMap} disabled={!appName.trim()}>
            {editMapId ? "Aggiorna" : "+"}
          </Button>
          {editMapId && (
            <Button size="sm" variant="ghost" onClick={() => { setEditMapId(null); setAppName(""); }}>
              Annulla
            </Button>
          )}
        </div>
        <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
          La regola vale per il nome dell&apos;app <span className="text-foreground">o per le parole nel titolo/sito</span>{" "}
          (es. &quot;tradingview.com&quot; cattura tutto TradingView nel browser). Priorità massima sulle regole integrate.
        </p>
        <div className="space-y-1">
          {db.pcAppCategoryMap.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color ?? CATEGORY_COLORS[m.category] ?? "#64748b" }} />
                {m.appName}
              </span>
              <span className="flex items-center gap-2">
                <Badge>{m.category}</Badge>
                <button onClick={() => startEditMap(m)} className="text-muted-foreground transition-colors hover:text-accent" aria-label="Modifica">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  onClick={() => updateDB((d) => ({ ...d, pcAppCategoryMap: removeById(d.pcAppCategoryMap, m.id) }))}
                  className="text-muted-foreground transition-colors hover:text-danger"
                  aria-label="Elimina"
                >
                  <Icon name="x" size={13} />
                </button>
              </span>
            </div>
          ))}
          {db.pcAppCategoryMap.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">Nessun mapping configurato.</p>
          )}
        </div>
      </Modal>

      {/* Modal Auto-Tracker Import */}
      <Modal open={autoTrackerOpen} onClose={() => setAutoTrackerOpen(false)} title="Importa auto-tracker" width="max-w-2xl">
        <AutoTrackerImport onClose={() => setAutoTrackerOpen(false)} />
      </Modal>
    </div>
  );
}
