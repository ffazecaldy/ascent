"use client";
// ============================================================
// ASCEND — Uso del PC (spec 4.4, MVP: inserimento manuale + CSV)
// Categorizzazione: PCAppCategoryMap (mappa app→categoria configurabile,
// pronta per il connettore ActivityWatch V2).
// ============================================================

import { useMemo, useState } from "react";
import { useDB, updateDB, upsert, removeById, uid, nowISO } from "@/lib/storage";
import type { PCUsageLog, PCAppCategoryMap } from "@/lib/types";
import { todayKey, addDaysKey, weekStartKey, monthKeyOf } from "@/lib/dates";
import { pcMinutesInWeek } from "@/lib/compute";
import { minutiToOre } from "@/lib/format";
import { SectionHeader } from "@/components/ui/Misc";
import { Card, CardTitle, CardHeader, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, TextArea } from "@/components/ui/Field";
import { ProgressBar, EmptyState, Tabs } from "@/components/ui/Misc";
import { BarsChart, DonutChart } from "@/components/charts";

const DEFAULT_CATEGORIES = [
  "Lavoro",
  "Sviluppo",
  "Studio",
  "Tempo perso",
  "Gaming",
  "Social",
  "Altro",
];

const CATEGORY_COLORS: Record<string, string> = {
  Lavoro: "#4C7EFF",
  Sviluppo: "#8b5cf6",
  Studio: "#06b6d4",
  "Tempo perso": "#ef4444",
  Gaming: "#f97316",
  Social: "#ec4899",
  Altro: "#64748b",
};

const PRODUCTIVE = ["Lavoro", "Sviluppo", "Studio"];

/** Data valida in formato yyyy-MM-dd (e giorno reale del calendario). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDayKey(dk: string): boolean {
  if (!ISO_DATE_RE.test(dk)) return false;
  const [y, m, d] = dk.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export default function UsoPcPage() {
  const db = useDB();
  const tz = db.settings.timezone;

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

  const logsMonth = useMemo(
    () => db.pcUsageLogs.filter((p) => monthKeyOf(p.date) === month),
    [db.pcUsageLogs, month]
  );
  const logsDay = useMemo(
    () => db.pcUsageLogs.filter((p) => p.date === day),
    [db.pcUsageLogs, day]
  );

  const byCategoryMonth = useMemo(() => {
    const map = new Map<string, number>();
    logsMonth.forEach((p) => map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + p.minutes));
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value, color: CATEGORY_COLORS[label] ?? "#64748b" }))
      .sort((a, b) => b.value - a.value);
  }, [logsMonth]);

  const byCategoryDay = useMemo(() => {
    const map = new Map<string, number>();
    logsDay.forEach((p) => map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + p.minutes));
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [logsDay]);

  const last7 = useMemo(() => {
    const out: { x: string; y: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dk = addDaysKey(today, -i);
      const total = db.pcUsageLogs.filter((p) => p.date === dk).reduce((s, p) => s + p.minutes, 0);
      out.push({ x: dk.slice(8) + "/" + dk.slice(5, 7), y: Math.round(total / 60) });
    }
    return out;
  }, [db.pcUsageLogs, today]);

  const productiveToday = db.pcUsageLogs
    .filter((p) => p.date === today && PRODUCTIVE.includes(p.categoryId))
    .reduce((s, p) => s + p.minutes, 0);

  const weeklyGoal = db.weeklyGoals.find((g) => g.type === "pc_hours" && g.active);
  const weekStart = weekStartKey(today, db.settings.weekStart);
  const pcMinutesWeek = pcMinutesInWeek(db, weekStart, db.settings.weekStart);

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
        err = "riga incompleta: servono data,categoria,minuti";
      } else if (!isValidDayKey(date)) {
        err = `data non valida: "${date}" (usa yyyy-MM-dd)`;
      } else if (isNaN(minutes) || minutes <= 0 || !Number.isInteger(minutes)) {
        err = "minuti non validi: intero positivo atteso";
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

  // --- app→categoria map ---
  const [mapOpen, setMapOpen] = useState(false);
  const [appName, setAppName] = useState("");
  const [appCat, setAppCat] = useState(DEFAULT_CATEGORIES[0]);
  const [editMapId, setEditMapId] = useState<string | null>(null);

  const saveMap = () => {
    if (!appName.trim()) return;
    updateDB((d) => ({
      ...d,
      pcAppCategoryMap: upsert(d.pcAppCategoryMap, editMapId
        ? { id: editMapId, appName: appName.trim(), category: appCat }
        : { id: uid(), appName: appName.trim(), category: appCat }),
    }));
    setAppName("");
    setEditMapId(null);
  };

  const startEditMap = (m: PCAppCategoryMap) => {
    setEditMapId(m.id);
    setAppName(m.appName);
    setAppCat(m.category);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Uso del PC"
        subtitle="Inserimento manuale o import CSV (MVP). Il connettore ActivityWatch automatico è previsto in V2."
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => setMapOpen(true)}>
              Mapping app
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
              Import CSV
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              + Registra
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ore produttive oggi</span>
          <span className="text-2xl font-semibold tnum">{minutiToOre(productiveToday)}</span>
          <span className="text-xs text-muted-foreground">Lavoro · Sviluppo · Studio</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ore totali oggi</span>
          <span className="text-2xl font-semibold tnum">{minutiToOre(logsDay.reduce((s, p) => s + p.minutes, 0))}</span>
          <span className="text-xs text-muted-foreground">{logsDay.length} log</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ore del mese</span>
          <span className="text-2xl font-semibold tnum">
            {minutiToOre(logsMonth.reduce((s, p) => s + p.minutes, 0))}
          </span>
          <span className="text-xs text-muted-foreground">{month}</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Obiettivo settimanale</span>
          {weeklyGoal ? (
            <>
              <span className="text-2xl font-semibold tnum">
                {minutiToOre(pcMinutesWeek)} <span className="text-sm text-muted-foreground">/ {minutiToOre(weeklyGoal.targetValue * 60)}</span>
              </span>
              <ProgressBar value={pcMinutesWeek} max={weeklyGoal.targetValue * 60} />
            </>
          ) : (
            <>
              <span className="text-2xl font-semibold tnum">—</span>
              <span className="text-xs text-muted-foreground">Nessun WeeklyGoal pc_hours attivo</span>
            </>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Viste</CardTitle>
            <CardSubtitle>Giorno, composizione mensile per categoria, trend 7 giorni</CardSubtitle>
          </div>
        </CardHeader>
        <Tabs
          tabs={[
            { id: "giorno", label: "Giorno" },
            { id: "mese", label: "Mese" },
            { id: "trend", label: "Trend 7gg" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="mt-4">
          {tab === "giorno" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-auto" />
                {day !== today && (
                  <Button variant="ghost" size="sm" onClick={() => setDay(today)}>
                    Oggi
                  </Button>
                )}
              </div>
              {logsDay.length === 0 ? (
                <EmptyState icon="💻" title="Nessun log per questo giorno" />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <BarsChart
                    data={byCategoryDay.map((c) => ({ x: c.label, y: c.value }))}
                    color="#4C7EFF"
                    height={160}
                  />
                  <div className="space-y-1.5">
                    {byCategoryDay.map((c) => (
                      <div key={c.label} className="flex items-center justify-between text-sm">
                        <span className="text-secondary-text">{c.label}</span>
                        <span className="tnum">{minutiToOre(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === "mese" && (
            byCategoryMonth.length === 0 ? (
              <EmptyState icon="📊" title="Nessun dato questo mese" />
            ) : (
              <DonutChart
                data={byCategoryMonth}
                centerLabel="Totale"
                centerValue={minutiToOre(byCategoryMonth.reduce((s, c) => s + c.value, 0))}
              />
            )
          )}
          {tab === "trend" && (
            <BarsChart data={last7} color="#4C7EFF" height={180} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Log del giorno selezionato</CardTitle>
            <CardSubtitle>Elimina i log errati</CardSubtitle>
          </div>
        </CardHeader>
        {logsDay.length === 0 ? (
          <EmptyState icon="🕐" title="Nessun log" action={<Button size="sm" onClick={() => setOpen(true)}>+ Registra</Button>} />
        ) : (
          <div className="space-y-1.5">
            {logsDay.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge>{p.categoryId}</Badge>
                  <span className="text-xs text-muted-foreground">{p.source}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tnum">{minutiToOre(p.minutes)}</span>
                  <button onClick={() => delLog(p.id)} className="text-muted-foreground hover:text-danger" aria-label="Elimina">
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

      {/* Modal CSV */}
      <Modal open={csvOpen} onClose={() => setCsvOpen(false)} title="Import CSV uso PC" width="max-w-xl"
        footer={<>
          <Button variant="ghost" onClick={() => setCsvOpen(false)}>Annulla</Button>
          <Button onClick={parseCsv} variant="outline">Anteprima</Button>
          <Button onClick={importCsv} disabled={validCount === 0}>
            Importa {validCount || 0} log
          </Button>
        </>}>
        <p className="mb-2 text-xs text-muted-foreground">
          Una riga per log: <code className="text-accent">data,categoria,minuti</code> (es. <code className="text-accent">2026-08-20,Lavoro,240</code>). Separatore , ; o tab.
        </p>
        <TextArea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"2026-08-20,Lavoro,240\n2026-08-20,Gaming,90"} />
        {csvPreview.length > 0 && (
          <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            <p className="mb-1 flex items-center gap-2 text-xs">
              <span className="text-success">{validCount} valide</span>
              <span>·</span>
              <span className={errCount > 0 ? "text-danger" : "text-muted-foreground"}>{errCount} con errore</span>
            </p>
            {csvPreview.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={r.ok ? "text-success" : "text-danger"}>{r.ok ? "✓" : "✗"}</span>
                <span className="tnum">{r.date || "—"}</span>
                <span>{r.category || "—"}</span>
                <span className="tnum text-muted-foreground">{r.ok ? `${r.minutes}min` : "—"}</span>
                {r.err && <span className="text-danger">{r.err}</span>}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal mapping app */}
      <Modal open={mapOpen} onClose={() => { setMapOpen(false); setEditMapId(null); setAppName(""); }} title="Mapping app → categoria" width="max-w-md">
        <div className="mb-3 flex items-end gap-2">
          <Field label={editMapId ? "Modifica app" : "App"} className="flex-1">
            <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="es. Chrome" />
          </Field>
          <Field label="Categoria" className="w-40">
            <Select value={appCat} onChange={(e) => setAppCat(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
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
        <p className="mb-2 text-[11px] text-muted-foreground">
          Usato dal futuro connettore ActivityWatch (V2) per categorizzare automaticamente le app.
        </p>
        <div className="space-y-1">
          {db.pcAppCategoryMap.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
              <span className="font-medium">{m.appName}</span>
              <span className="flex items-center gap-2">
                <Badge>{m.category}</Badge>
                <button onClick={() => startEditMap(m)} className="text-muted-foreground hover:text-accent" aria-label="Modifica">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  onClick={() => updateDB((d) => ({ ...d, pcAppCategoryMap: removeById(d.pcAppCategoryMap, m.id) }))}
                  className="text-muted-foreground hover:text-danger"
                  aria-label="Elimina"
                >✕</button>
              </span>
            </div>
          ))}
          {db.pcAppCategoryMap.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">Nessun mapping configurato.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
