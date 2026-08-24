// ============================================================
// ASCEND — Service Worker (STATO ATTUALE: AUTO-DISTRUTTIVO)
// Motivo: in dev il cache-first degli asset _next serviva chunk
// vecchi dopo ogni modifica (pagina "come prima"). Finché non
// c'è una strategia dev/prod dedicata, qualsiasi SW già
// installato si rimuove e svuota le sue cache.
// La registrazione è comunque limitata alla produzione
// (vedi AppShell.tsx): ripristinare questo file quando si vuole
// riattivare l'offline PWA.
// ============================================================

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // svuota TUTTE le cache gestite dal vecchio worker
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      // deregistra se stesso: dal prossimo load nessun SW controlla la pagina
      await self.registration.unregister();
      // ricarica i client aperti così prendono il contenuto di rete pulito
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.navigate(c.url));
    })()
  );
});
