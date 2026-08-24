"use client";

// ============================================================
// ASCEND — Zona Benessere (sezione v3 · art-direct v2)
// Log giornaliero sonno / umore / peso: una riga per giorno.
// Sonno e peso alimentano l'Activity Streak (l'umore no).
// Tutto scrive/legge da db.wellnessLogs via useDB/updateDB.
// ============================================================

import { useState } from "react";
import { useDB, updateDB, upsert, uid, nowISO } from "@/lib/storage";
import type { WellnessLog } from "@/lib/types";
import { SectionHeader } from "@/components/ui/Misc";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { WellnessForm } from "@/components/benessere/WellnessForm";
import { WellnessKpis } from "@/components/benessere/WellnessKpis";
import { WellnessCharts } from "@/components/benessere/WellnessCharts";
import { WellnessLog as WellnessLogList } from "@/components/benessere/WellnessLog";
import { Icon } from "@/components/ui/Icon";

export default function BenesserePage() {
  const db = useDB();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WellnessLog | null>(null);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(w: WellnessLog) {
    setEditing(w);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  function save(p: {
    date: string;
    sleepHours: number | null;
    sleepQuality: 1 | 2 | 3 | 4 | 5 | null;
    mood: 1 | 2 | 3 | 4 | 5 | null;
    weightKg: number | null;
    note?: string;
  }) {
    const w: WellnessLog = editing
      ? {
          ...editing,
          date: p.date,
          sleepHours: p.sleepHours,
          sleepQuality: p.sleepQuality,
          mood: p.mood,
          weightKg: p.weightKg,
          note: p.note,
        }
      : {
          id: uid(),
          date: p.date,
          sleepHours: p.sleepHours,
          sleepQuality: p.sleepQuality,
          mood: p.mood,
          weightKg: p.weightKg,
          note: p.note,
          createdAt: nowISO(),
        };
    updateDB((d) => ({ ...d, wellnessLogs: upsert(d.wellnessLogs, w) }));
    closeForm();
  }

  const hasLogs = db.wellnessLogs.length > 0;

  return (
    <div className="space-y-6">
      <Reveal>
        <SectionHeader
          kicker="Personale · Benessere"
          title="Zona Benessere. Corpo e mente."
          subtitle="Sonno, umore e peso registrati ogni giorno — sonno e peso alimentano i giorni d'ascesa."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success" pulse>
                <Icon name="check" size={12} />
                sonno + peso = streak
              </Badge>
              <Button onClick={openNew} variant="primary" glow>
                + Log di oggi
              </Button>
            </div>
          }
        />
      </Reveal>

      <Reveal delay={20}>
        <WellnessKpis />
      </Reveal>

      {!hasLogs ? (
        <Reveal delay={40}>
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 shadow-[0_0_28px_-8px_rgba(76,126,255,0.6)]">
              <Icon name="moon" size={30} className="text-accent" />
            </div>
            <p className="text-sm font-medium text-secondary-text">Primo log benessere</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Registra ore di sonno, umore o peso di oggi: bastano sonno o peso per attivare il giorno
              d&apos;ascesa. I dati restano solo su questo dispositivo.
            </p>
            <div className="mt-2">
              <Button onClick={openNew}>Log di oggi</Button>
            </div>
          </div>
        </Reveal>
      ) : (
        <>
          <Reveal delay={30}>
            <WellnessCharts />
          </Reveal>
          <Reveal delay={40}>
            <WellnessLogList onEdit={openEdit} />
          </Reveal>
        </>
      )}

      <WellnessForm open={formOpen} onClose={closeForm} onSave={save} />
    </div>
  );
}