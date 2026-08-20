"use client";
// ============================================================
// ASCEND — Pagina Impostazioni · v2 rich
// Preferenze utente · privacy · categorie finanza · dati · PWA
// ============================================================

import { SectionHeader } from "@/components/ui/Misc";
import { Reveal } from "@/components/ui/Reveal";
import { UserSettingsEditor } from "@/components/impostazioni/UserSettingsEditor";
import { PrivacyExplainer } from "@/components/impostazioni/PrivacyExplainer";
import { CategoriesManager } from "@/components/impostazioni/CategoriesManager";
import { DataZone } from "@/components/impostazioni/DataZone";
import { PwaHint } from "@/components/impostazioni/PwaHint";

export default function ImpostazioniPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        kicker="Configurazione"
        title="Impostazioni"
        subtitle="Preferenze utente, privacy, categorie finanza e gestione dei dati."
      />
      <Reveal>
        <UserSettingsEditor />
      </Reveal>
      <Reveal delay={60}>
        <PrivacyExplainer />
      </Reveal>
      <Reveal delay={120}>
        <CategoriesManager />
      </Reveal>
      <Reveal delay={180}>
        <DataZone />
      </Reveal>
      <Reveal delay={240}>
        <PwaHint />
      </Reveal>
    </div>
  );
}
