// ============================================================
// ASCEND — Trade log: utility (immagine, datetime-local, mese)
// Nessuna dipendenza esterna. Canvas per la compressione.
// ============================================================

/** Comprime una data URL immagine a max larghezza 1200, JPEG q.0.7 → data URL string. */
export function compressImage(dataUrl: string, maxWidth = 1200, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas non disponibile"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Immagine non valida"));
    img.src = dataUrl;
  });
}

/** Read file → data URL. */
export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/**
 * Parte "muro" (wall clock) di un istante UTC in una timezone IANA.
 * hourCycle h23: mezzanotte = 00, mai 24 (evita il rollover spurio del giorno).
 */
function wallPartsInTZ(utcMs: number, timeZone: string): { y: number; m: number; d: number; h: number; min: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = fmt.formatToParts(new Date(utcMs));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    min: Number(get("minute")),
  };
}

/** Minuti dal 1970-01-01T00:00 (Days-from-Civil, esatto sull'intero range). */
function wallToMinutes(y: number, mo: number, d: number, h: number, min: number): number {
  const yy = y - (mo <= 2 ? 1 : 0);
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return (era * 146097 + doe) * 1440 + h * 60 + min;
}

/**
 * ISO UTC → valore per input datetime-local, nel muro della timezone delle
 * SETTINGS (non del browser): editando un trade, il campo mostra l'ora che
 * l'utente aveva digitato, a prescindere dal fuso del browser.
 */
export function isoToLocalInput(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const w = wallPartsInTZ(d.getTime(), timeZone);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.y}-${p(w.m)}-${p(w.d)}T${p(w.h)}:${p(w.min)}`;
}

/**
 * Valore datetime-local → ISO UTC, interpretando il muro nella timezone delle
 * SETTINGS. Prima il muro era letto nel fuso del browser: se i due fusi
 * divergevano, un trade registrato la sera poteva finire nel calendario al
 * giorno successivo (±1). Ora il giorno salvato è SEMPRE quello digitato.
 * Convergenza su offset/DST: 3 iterazioni al massimo, poi si accetta l'ultima.
 */
export function localInputToISO(value: string, timeZone: string): string {
  if (!value) return new Date().toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return new Date().toISOString();
  const y = +m[1],
    mo = +m[2],
    d = +m[3],
    h = +m[4],
    min = +m[5];
  const want = wallToMinutes(y, mo, d, h, min);
  let guess = Date.UTC(y, mo - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const w = wallPartsInTZ(guess, timeZone);
    const cur = wallToMinutes(w.y, w.m, w.d, w.h, w.min);
    const diff = want - cur;
    if (diff === 0) break;
    guess += diff * 60000;
  }
  return new Date(guess).toISOString();
}

/** "yyyy-MM" → "Agosto 2026" */
export function monthLabel(monthKey: string, locale = "it-IT"): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** `""` → null, altrimenti numero (o null se NaN). */
export function numOrNull(v: string): number | null {
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? null : n;
}

/** Numerico richiesto: `""` → 0 come default sicuro. */
export function numOrZero(v: string): number {
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Sposta di n mesi una "yyyy-MM". */
export function shiftMonth(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

/** Leggibile: "20 ago 2026, 14:30". */
export function formatCloseDate(iso: string, locale = "it-IT"): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compatta per righe dense: "20 ago · 14:30". */
export function formatDayTime(iso: string, locale = "it-IT"): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
