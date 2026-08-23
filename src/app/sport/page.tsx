"use client";

// ============================================================
// ASCEND — Sport (sezione 4.5 della specifica v3) · art-direct v2
// Stile myfundedbook: streak con count-up + green, obiettivo con
// ProgressBar success, log dense con badge tipo, mini bars 7gg.
// Tutto derivato da db.workouts / db.weeklyGoals (useDB/updateDB).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useDB, updateDB, upsert, removeById, uid, nowISO } from "@/lib/storage";
import { sportStreak, workoutsInWeek, sportWeekStats, sportOverloadHint, sportConsecutiveWeeksDone } from "@/lib/compute";
import {
  addDaysKey,
  labelDayKey,
  monthKeyOf,
  parseDateKey,
  todayKey,
  weekStartKey,
} from "@/lib/dates";
import type { WeeklyGoal, Workout } from "@/lib/types";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Field, Input, Label, Select, TextArea } from "@/components/ui/Field";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { ProgressBar, SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { BarsChart } from "@/components/charts";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SportSetupWizard } from "@/components/sport/SportSetupWizard";
import { sportIconFor, sportColorFor, weekdayOrder } from "@/components/sport/sport-meta";
import { CircularProgress } from "@/components/risparmi/CircularProgress";
import { cn } from "@/lib/cn";

const PRESET_TYPES = [
  "Cardio",
  "Forza",
  "Palestra",
  "Calistenics",
  "Yoga",
  "Corsa",
  "Padel",
  "Calcio",
  "Nuoto",
  "Altro",
];

/** Durata leggibile: 45 → "45m", 60 → "1h", 90 → "1h 30m", 120 → "2h". */
function fmtDur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Etichetta corta del giorno (es. "Lun") per un day key, nella locale utente. */
function weekdayShort(key: string, locale: string): string {
  const { y, m, d } = parseDateKey(key);
  const wd = new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: "short" });
  return wd.charAt(0).toUpperCase() + wd.slice(1);
}

// ------------------------------------------------------------
// Badge "tipo" colorato — colore stabile per tipo allenamento
// ------------------------------------------------------------
const TYPE_COLORS = ["#4C7EFF", "#8A6BFF", "#2FD4FF", "#22c55e", "#f0b429", "#ec4899", "#06b6d4", "#f97316"];
function typeColor(type: string): string {
  let h = 0;
  for (const c of type) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TYPE_COLORS[h % TYPE_COLORS.length];
}

const TYPE_ICON: Record<string, IconName> = {
  Cardio: "run",
  Forza: "dumbbell",
  Palestra: "dumbbell",
  Calistenics: "activity",
  // alias di compatibilità: workout storici salvati con la vecchia grafia
  Calisthenics: "activity",
  Yoga: "activity",
  Corsa: "run",
  Padel: "target",
  Calcio: "target",
  Nuoto: "activity",
  Altro: "dumbbell",
};

export default function SportPage() {
  const db = useDB();
  const tz = db.settings.timezone;
  const locale = db.settings.locale || "it-IT";
  const today = todayKey(tz);
  const monthKey = today.slice(0, 7);

  // ---------- metriche derivate ----------
  const streak = useMemo(() => sportStreak(db), [db]);
  const monthWorkouts = useMemo(
    () => db.workouts.filter((w) => monthKeyOf(w.date) === monthKey),
    [db.workouts, monthKey]
  );
  const monthCount = monthWorkouts.length;
  const monthMin = monthWorkouts.reduce((s, w) => s + (w.durationMin || 0), 0);
  const avgDur = monthCount > 0 ? Math.round(monthMin / monthCount) : 0;

  const weekStart = weekStartKey(today, db.settings.weekStart);
  const weekCount = useMemo(() => workoutsInWeek(db, weekStart), [db, weekStart]);

  // ---------- Sport Zone: profilo discipline ----------
  const profile = db.sportProfile ?? null;
  const [wizardOpen, setWizardOpen] = useState(false);
  // wizard mostrato di diritto se non c'è profilo (prima configurazione)
  const needsSetup = profile === null;

  function saveProfile(p: NonNullable<typeof profile>) {
    updateDB((d) => ({ ...d, sportProfile: p }));
    setWizardOpen(false);
  }

  const weekStats = useMemo(() => sportWeekStats(db, weekStart), [db, weekStart]);
  const overload = useMemo(() => sportOverloadHint(db, weekStart), [db, weekStart]);
  const streakWeeks = useMemo(() => sportConsecutiveWeeksDone(db, weekStart), [db, weekStart]);
  // prossime 4 settimane al traguardo del prossimo +10%
  const weeksToOverload = 4 - (streakWeeks % 4);

  // anello progresso settimanale (sessioni fatte / target dal profilo)
  const ringPct =
    profile && profile.weeklySessionsTarget > 0
      ? Math.min(100, Math.round((weekStats.sessions / profile.weeklySessionsTarget) * 100))
      : 0;

  // mappa giorno → discipline previste (per la strip settimanale)
  const dowMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const d of profile?.disciplines ?? []) {
      for (const dow of d.weekDays) {
        map.set(dow, [...(map.get(dow) ?? []), d.name]);
      }
    }
    return map;
  }, [profile]);
  const weekdays = useMemo(() => weekdayOrder(), []);

  const weeklyGoal: WeeklyGoal | undefined = db.weeklyGoals.find(
    (g) => g.active && g.type === "workout_count"
  );
  const goalTarget = weeklyGoal?.targetValue ?? 0;
  const goalMet = goalTarget > 0 && weekCount >= goalTarget;
  const goalRemaining = Math.max(0, goalTarget - weekCount);
  const weekPct = goalTarget > 0 ? Math.min(100, Math.round((weekCount / goalTarget) * 100)) : 0;

  // Allenamenti per ciascuno degli ultimi 7 giorni (chart)
  const last7 = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const dk = addDaysKey(today, i - 6);
        return {
          x: weekdayShort(dk, locale),
          y: db.workouts.filter((w) => w.date === dk).length,
        };
      }),
    [db.workouts, today, locale]
  );
  const weekTotalBars = last7.reduce((s, d) => s + d.y, 0);

  // Log ordinati dal più recente
  const sorted = useMemo(
    () =>
      [...db.workouts].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      ),
    [db.workouts]
  );

  // ---------- tipi personalizzati ----------
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  useEffect(() => {
    const derived = Array.from(
      new Set(db.workouts.map((w) => w.type).filter((t) => !!t && !PRESET_TYPES.includes(t)))
    );
    setCustomTypes((prev) => Array.from(new Set([...prev, ...derived])));
  }, [db.workouts]);
  const typeOptions = useMemo(
    () => [...PRESET_TYPES, ...customTypes.filter((t) => !PRESET_TYPES.includes(t))],
    [customTypes]
  );

  // ---------- stato form ----------
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Workout | null>(null);
  const [fDate, setFDate] = useState(today);
  const [fType, setFType] = useState<string>(PRESET_TYPES[0]);
  const [fDur, setFDur] = useState("");
  const [fNote, setFNote] = useState("");
  const [fPr, setFPr] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Workout | null>(null);

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  function openNew() {
    setEditing(null);
    setFDate(today);
    setFType(PRESET_TYPES[0]);
    setFDur("");
    setFNote("");
    setFPr("");
    setAddingCustom(false);
    setCustomDraft("");
    setFormOpen(true);
  }

  function openEdit(w: Workout) {
    setEditing(w);
    setFDate(w.date);
    setFType(w.type);
    setFDur(String(w.durationMin));
    setFNote(w.note ?? "");
    setFPr(w.pr ?? "");
    setAddingCustom(false);
    setCustomDraft("");
    setFormOpen(true);
  }

  function addCustom() {
    const t = customDraft.trim();
    if (!t) return;
    setCustomTypes((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setFType(t);
    setCustomDraft("");
    setAddingCustom(false);
  }

  const canSave = fDate.trim() !== "" && fType.trim() !== "" && Number(fDur) > 0;

  function save() {
    if (!canSave) return;
    const note = fNote.trim();
    const pr = fPr.trim();
    const w: Workout = editing
      ? {
          ...editing,
          date: fDate,
          type: fType.trim(),
          durationMin: Number(fDur),
          note: note || undefined,
          pr: pr || undefined,
        }
      : {
          id: uid(),
          date: fDate,
          type: fType.trim(),
          durationMin: Number(fDur),
          note: note || undefined,
          pr: pr || undefined,
          createdAt: nowISO(),
        };
    updateDB((d) => ({ ...d, workouts: upsert(d.workouts, w) }));
    closeForm();
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    updateDB((d) => ({ ...d, workouts: removeById(d.workouts, deleteTarget.id) }));
    setDeleteTarget(null);
  }

  const hasWorkouts = db.workouts.length > 0;

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker="Sport"
          title="Muoviti. Ogni giorno."
          subtitle="Allenamenti, streak e obiettivo settimanale — la costanza batte l'intensità."
          action={
            <Button onClick={openNew} variant="primary" glow>
              + Aggiungi allenamento
            </Button>
          }
        />
      </Reveal>

      {/* ——— Wizard prima configurazione (sportProfile assente) ——— */}
      {needsSetup && (
        <Reveal delay={20}>
          <Card hairline="accent">
            <SportSetupWizard initial={profile} onSave={saveProfile} />
          </Card>
        </Reveal>
      )}

      {!hasWorkouts && !needsSetup && (
        <Reveal delay={30}>
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
              <Icon name="dumbbell" size={30} className="text-accent" />
            </div>
            <p className="text-sm font-medium text-secondary-text">Nessun allenamento registrato</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Registra il primo workout per iniziare a costruire lo streak sportivo.
            </p>
            <div className="mt-2">
              <Button onClick={openNew}>Aggiungi allenamento</Button>
            </div>
          </div>
        </Reveal>
      )}

      {hasWorkouts && (
        <>
          {/* KPI: streak + totali mese */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Reveal delay={0}>
              <StatCard
                label="Streak sportivo"
                value={<AnimatedNumber value={streak} className="text-success" fmt={(n) => String(Math.round(n))} />}
                icon={<Icon name="flame" size={18} className="text-success" />}
                delta={streak === 1 ? "1 giorno" : `${streak} giorni di fila`}
                deltaTone="positive"
                hairline="success"
                valueClassName="text-success"
                className="h-full"
              />
            </Reveal>
            <Reveal delay={60}>
              <StatCard
                label="Questo mese"
                value={monthCount}
                icon={<Icon name="calendar" size={18} className="text-accent" />}
                delta={`${fmtDur(monthMin)} totali`}
                deltaTone="neutral"
                className="h-full"
              />
            </Reveal>
            <Reveal delay={120}>
              <StatCard
                label="Durata media"
                value={fmtDur(avgDur)}
                icon={<Icon name="timer" size={18} className="text-accent" />}
                delta="per sessione"
                deltaTone="neutral"
                className="h-full"
              />
            </Reveal>
          </div>

          {/* ——— Profilo sport: anello settimanale + giorni + breakdown + sovraccarico ——— */}
          {profile && (
            <Reveal delay={20}>
              <Card hairline="accent" texture>
                <CardHeader>
                  <div>
                    <CardTitle>Profilo sport</CardTitle>
                    <CardSubtitle>
                      {profile.disciplines.length} disciplina{profile.disciplines.length === 1 ? "" : "e"} ·{" "}
                      {weekStats.sessions}/{profile.weeklySessionsTarget} sessioni ·{" "}
                      {fmtDur(weekStats.minutes)}/{fmtDur(profile.weeklyMinutesTarget)} a settimana
                    </CardSubtitle>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)}>
                    <Icon name="pencil" size={13} /> Modifica profilo
                  </Button>
                </CardHeader>

                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                  {/* Anello progresso settimanale */}
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <CircularProgress
                      pct={ringPct}
                      size={104}
                      stroke={8}
                      done={weekStats.done}
                      label={
                        <span className="text-sm">
                          <span className="tnum text-base font-semibold">{weekStats.sessions}</span>
                          <span className="tnum text-muted-foreground">/{profile.weeklySessionsTarget}</span>
                        </span>
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">sessioni questa settimana</p>
                  </div>

                  <div className="min-w-0 flex-1 space-y-4">
                    {/* Barra minuti settimanali */}
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Minuti settimana</span>
                        <span className="tnum text-secondary-text">
                          {fmtDur(weekStats.minutes)} / {fmtDur(profile.weeklyMinutesTarget)}
                        </span>
                      </div>
                      <ProgressBar
                        value={weekStats.minutes}
                        max={Math.max(1, profile.weeklyMinutesTarget)}
                        tone={weekStats.minutes >= profile.weeklyMinutesTarget ? "success" : "accent"}
                      />
                    </div>

                    {/* Strip giorni della settimana con discipline previste */}
                    <div className="flex flex-wrap gap-1.5">
                      {weekdays.map(({ dow, label, long }) => {
                        const names = dowMap.get(dow) ?? [];
                        const isToday = new Date(today + "T12:00:00").getDay() === dow;
                        return (
                          <div
                            key={dow}
                            title={names.length > 0 ? `${long}: ${names.join(", ")}` : long}
                            className={cn(
                              "flex min-w-[52px] flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5",
                              isToday
                                ? "border-accent/60 bg-accent/10"
                                : names.length > 0
                                  ? "border-border bg-elevated/40"
                                  : "border-border/60 bg-transparent opacity-60"
                            )}
                          >
                            <span
                              className={cn(
                                "text-[10px] font-semibold uppercase",
                                isToday ? "text-accent" : "text-muted-foreground"
                              )}
                            >
                              {label}
                            </span>
                            <div className="flex h-4 items-center gap-0.5">
                              {names.map((n, i) => (
                                <span key={`${dow}-${i}`} style={{ color: sportColorFor(n) }}>
                                  <Icon name={sportIconFor(n)} size={12} />
                                </span>
                              ))}
                              {names.length === 0 && (
                                <span className="text-[10px] leading-none text-muted-foreground/50">–</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Breakdown per sport */}
                    <div className="space-y-1.5">
                      {weekStats.perDiscipline.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nessuna disciplina configurata.
                        </p>
                      ) : (
                        weekStats.perDiscipline.map((row) => {
                          const color = sportColorFor(row.name);
                          return (
                            <div
                              key={row.id}
                              className="flex items-center gap-2.5 rounded-lg border border-border bg-elevated/40 px-2.5 py-1.5"
                            >
                              <span
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                                style={{ backgroundColor: `${color}1f`, color }}
                              >
                                <Icon name={sportIconFor(row.name)} size={12} />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs font-medium text-secondary-text">
                                {row.name}
                              </span>
                              <span className="shrink-0 text-[11px] tnum text-accent">{fmtDur(row.minutes)}</span>
                              <Badge tone="default" className="shrink-0">
                                <span className="tnum">{row.sessions}</span> sessioni
                              </Badge>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Sovraccarico progressivo (hint manuale) */}
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="flex items-center gap-2 text-xs font-semibold text-secondary-text">
                        <Icon name="zap" size={14} className="text-warning" /> Sovraccarico progressivo
                      </p>
                      {overload ? (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Hai completato il target per{" "}
                          <span className="font-semibold text-success">{streakWeeks} settimane di fila</span>.{" "}
                          Suggerimento manuale: passa a{" "}
                          <span className="tnum font-semibold text-accent">
                            {overload.suggestedMinutes} min/settimana
                          </span>{" "}
                          (+10%) dal pannello Modifica profilo quando ti senti pronto — non viene applicato
                          in automatico.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Completa il target per{" "}
                          <span className="tnum font-semibold text-secondary-text">{weeksToOverload}</span>{" "}
                          settim{weeksToOverload === 1 ? "a" : "ane"} consecutive per sbloccare il suggerimento{" "}
                          <span className="tnum">+10%</span> minuti (
                          {fmtDur(Math.round(profile.weeklyMinutesTarget * Math.pow(1.1, Math.floor(streakWeeks / 4) + 1)))}
                          ). Il riposo programmato non rompe la progressione.
                        </p>
                      )}
                    </div>

                    {/* Nota riposo intelligente */}
                    <p className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground">
                      <Icon name="heart" size={14} className="shrink-0 text-success" />
                      <span>
                        Giorni senza discipline in programma sono riposo: il riposo programmato non rompe lo
                        streak attività — conta solo l&apos;allenamento registrato.
                      </span>
                    </p>
                  </div>
                </div>
              </Card>
            </Reveal>
          )}

          {/* Obiettivo settimanale (WeeklyGoal workout_count) */}
          <Reveal delay={40}>
            <Card hairline={goalMet ? "success" : "accent"} texture>
              <CardHeader>
                <div>
                  <CardTitle>Obiettivo settimanale</CardTitle>
                  <CardSubtitle>
                    {weeklyGoal
                      ? `${weekCount} allenamenti su ${goalTarget} · settimana dal ${labelDayKey(
                          weekStart,
                          locale
                        )}`
                      : "Progressione goal configurata dalla sezione Obiettivi"}
                  </CardSubtitle>
                </div>
                {weeklyGoal && (
                  <Badge tone={goalMet ? "success" : "info"}>
                    <span className="tnum">
                      {weekCount}/{goalTarget}
                    </span>
                  </Badge>
                )}
              </CardHeader>
              {weeklyGoal && goalTarget > 0 ? (
                <>
                  <ProgressBar value={weekCount} max={goalTarget} tone="success" />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {goalMet ? (
                        <span className="inline-flex items-center gap-1 font-medium text-success">
                          <Icon name="sparkles" size={13} />
                          Obiettivo raggiunto
                        </span>
                      ) : (
                        <>Mancano <span className="tnum text-secondary-text">{goalRemaining}</span> allenamento{goalRemaining === 1 ? "" : "i"} alla meta.</>
                      )}
                    </p>
                    <span className="tnum text-[11px] text-muted-foreground">{weekPct}%</span>
                  </div>
                </>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Nessun obiettivo settimanale attivo di tipo “allenamento”. Impostalo dalla sezione{" "}
                  Obiettivi per vederne i progressi qui.
                </p>
              )}
            </Card>
          </Reveal>

          {/* Mini stats: ultimi 7 giorni */}
          <Reveal delay={80}>
            <Card hairline="accent">
              <CardHeader>
                <div>
                  <CardTitle>Ultimi 7 giorni</CardTitle>
                  <CardSubtitle>Allenamenti per giorno · {weekTotalBars} totali</CardSubtitle>
                </div>
                <Badge tone="success">
                  <span className="tnum">{weekTotalBars}</span>
                </Badge>
              </CardHeader>
              <BarsChart data={last7} height={150} color="#22c55e" />
            </Card>
          </Reveal>

          {/* Log allenamenti — denso con badge tipo */}
          <Reveal delay={60}>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Log allenamenti</CardTitle>
                  <CardSubtitle>
                    {db.workouts.length} allenamento{db.workouts.length === 1 ? "" : "i"} registrati
                  </CardSubtitle>
                </div>
                <Badge tone="default">
                  <span className="tnum">{db.workouts.length}</span>
                </Badge>
              </CardHeader>
              <div className="space-y-1.5">
                {sorted.map((w) => {
                  const color = typeColor(w.type);
                  return (
                    <div
                      key={w.id}
                      className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-elevated/40 px-3 py-2 transition-colors hover:border-border-strong hover:bg-elevated/70"
                    >
                      {/* badge tipo colorato */}
                      <span
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{ color, backgroundColor: `${color}14`, borderColor: `${color}40` }}
                      >
                        <Icon name={TYPE_ICON[w.type] ?? "dumbbell"} size={13} className="shrink-0" />
                        {w.type}
                      </span>

                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
                        {w.pr && (
                          <>
                            <Badge tone="info"><Icon name="trophy" size={11} className="shrink-0" /> PR</Badge>
                            <span className="max-w-[200px] truncate text-[11px] text-secondary-text">{w.pr}</span>
                          </>
                        )}
                        {w.note && <span className="max-w-[280px] truncate text-[11px] text-muted-foreground">{w.note}</span>}
                      </div>

                      <span className="text-[11px] tnum text-muted-foreground">{labelDayKey(w.date, locale)}</span>
                      <span className="shrink-0 text-sm font-semibold tnum text-accent">{fmtDur(w.durationMin)}</span>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(w)} aria-label="Modifica allenamento">
                          <Icon name="pencil" size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(w)} aria-label="Elimina allenamento">
                          <Icon name="trash" size={14} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </Reveal>
        </>
      )}

      {/* Modal modifica profilo sport — wizard precompilato */}
      <Modal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title="Modifica profilo sport"
        width="max-w-xl"
      >
        <SportSetupWizard initial={profile} onSave={saveProfile} />
      </Modal>

      {/* Form crea/modifica */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? "Modifica allenamento" : "Nuovo allenamento"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>
              Annulla
            </Button>
            <Button onClick={save} disabled={!canSave}>
              {editing ? "Salva" : "Aggiungi"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <Input
              type="date"
              value={fDate}
              max={today}
              onChange={(e) => setFDate(e.target.value)}
            />
          </Field>
          <Field label="Durata (min)">
            <Input
              type="number"
              min={1}
              placeholder="es. 60"
              value={fDur}
              onChange={(e) => setFDur(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Label>Tipo</Label>
          <Select value={fType} onChange={(e) => setFType(e.target.value)}>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {addingCustom ? (
            <div className="mt-1.5 flex gap-2">
              <Input
                value={customDraft}
                placeholder="Nome del tipo"
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <Button size="sm" onClick={addCustom} disabled={!customDraft.trim()}>
                Aggiungi
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddingCustom(false);
                  setCustomDraft("");
                }}
              >
                Annulla
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCustom(true)}
              className="mt-1.5 text-xs font-medium text-accent hover:underline"
            >
              + aggiungi personalizzato
            </button>
          )}
        </div>

        <div className="mt-3">
          <Field label="PR (personal record)">
            <Input
              placeholder={"es. panca 100kg · 5km in 24'"}
              value={fPr}
              onChange={(e) => setFPr(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Note">
            <TextArea
              placeholder="Sensazioni, intensità, dettagli…"
              value={fNote}
              onChange={(e) => setFNote(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* Conferma eliminazione */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminare l'allenamento?"
        message={
          deleteTarget
            ? `${deleteTarget.type} del ${labelDayKey(
                deleteTarget.date,
                locale
              )} (${fmtDur(deleteTarget.durationMin)}) — questa azione non può essere annullata.`
            : ""
        }
        confirmLabel="Elimina"
      />
    </div>
  );
}
