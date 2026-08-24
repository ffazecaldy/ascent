// ============================================================
// ASCEND — File store (IndexedDB) per gli allegati della Zona
// Studio. localStorage non può contenere binary: i blob vivono
// in IndexedDB sotto 'ascend-files' / store 'files', key = id
// dell'allegato (StudyAttachment.id). I metadati restano nel DB
// (studio, export JSON non include i blob — documentato).
// ============================================================

const DB_NAME = "ascend-files";
const STORE = "files";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file (limite sanitario)

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IDB request failed"));
        t.onabort = () => reject(t.error ?? new Error("IDB tx aborted"));
      })
  );
}

/** Salva un File/Blob e ritorna l'id con cui è registrato. */
export function putFile(id: string, blob: Blob): Promise<void> {
  return tx("readwrite", (st) => st.put(blob, id)).then(() => undefined);
}

/** Recupera il blob di un allegato (o null se assente/perso). */
export async function getFile(id: string): Promise<Blob | null> {
  try {
    const res = await tx<Blob | undefined>("readonly", (st) => st.get(id));
    return res ?? null;
  } catch {
    return null;
  }
}

/** Elimina un blob (allegato rimosso o sessione cancellata). Best effort. */
export function deleteFile(id: string): Promise<void> {
  return tx("readwrite", (st) => st.delete(id)).then(() => undefined);
}

/** Controlla che un file rispetti i limiti (dimensione, numero). */
export function checkFileSize(file: File, maxBytes: number = MAX_FILE_SIZE): string | null {
  return file.size > maxBytes
    ? `"${file.name}" supera i ${Math.round(maxBytes / 1024 / 1024)} MB`
    : null;
}

/** Dimensione leggibile: 1234 → "1,2 KB", 2500000 → "2,4 MB". */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Scarica un allegato dal file store (objectURL + click programmatico). */
export async function downloadAttachment(id: string, name: string): Promise<void> {
  const blob = await getFile(id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}