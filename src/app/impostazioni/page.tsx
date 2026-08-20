"use client";
// ============================================================
// ASCEND — Pagina Impostazioni
// Preferenze utente · privacy · categorie finanza · dati · PWA
// ============================================================

import { SectionHeader } from "@/components/ui/Misc";
import { UserSettingsEditor } from "@/components/impostazioni/UserSettingsEditor";
import { PrivacyExplainer } from "@/components/impostazioni/PrivacyExplainer";
import { CategoriesManager } from "@/components/impostazioni/CategoriesManager";
import { DataZone } from "@/components/impostazioni/DataZone";
import { PwaHint } from "@/components/impostazioni/PwaHint";

export default function ImpostazioniPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Impostazioni"
        subtitle="Preferenze utente, privacy, categorie finanza e gestione dei dati."
      />
      <UserSettingsEditor />
      <PrivacyExplainer />
      <CategoriesManager />
      <DataZone />
      <PwaHint />
    </div>
  );
}
