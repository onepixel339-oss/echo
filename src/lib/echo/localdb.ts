/**
 * ECHO — Local persistence layer (IndexedDB, no dependencies).
 *
 * Object stores:
 *  - kv          : settings (key "settings")
 *  - media       : MediaItem records keyed by localId
 *  - entries     : UserMediaEntry records (user library)
 *  - feedback    : TasteFeedback records
 *  - mapLayout   : MapLayoutState (key "layout")
 *  - demoEntries : demo-universe library (never mixed with real data)
 *  - demoMedia   : media items for the demo universe
 *
 * Spec: do NOT use localStorage for the library; do not upload user data.
 */

import type {
  AppSettings,
  MapLayoutState,
  MediaItem,
  TasteFeedback,
  UserMediaEntry,
} from "./types";

const DB_NAME = "echo-universe";
const DB_VERSION = 1;

export const STORES = {
  kv: "kv",
  media: "media",
  entries: "entries",
  feedback: "feedback",
  mapLayout: "mapLayout",
  demoEntries: "demoEntries",
  demoMedia: "demoMedia",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (and memoize) the IndexedDB connection. Exported for helpers. */
export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [
        STORES.kv,
        STORES.media,
        STORES.entries,
        STORES.feedback,
        STORES.mapLayout,
        STORES.demoEntries,
        STORES.demoMedia,
      ]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
  return dbPromise;
}

function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let result: T;
        const r = fn(s);
        if (r) {
          r.onsuccess = () => {
            result = r.result;
          };
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error("Transaction failed"));
        t.onabort = () => reject(t.error ?? new Error("Transaction aborted"));
      }),
  );
}

/** Storage health check used by the boot screen to surface recoverable errors. */
export async function storageAvailable(): Promise<boolean> {
  try {
    await tx(STORES.kv, "readonly", (s) => s.get("ping"));
    return true;
  } catch {
    return false;
  }
}

// ---------- kv / settings ----------

export async function getSettings(): Promise<AppSettings | null> {
  try {
    const v = await tx<AppSettings | undefined>(
      STORES.kv,
      "readonly",
      (s) => s.get("settings"),
    );
    return v ?? null;
  } catch {
    return null;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await tx(STORES.kv, "readwrite", (s) => s.put(settings, "settings"));
}

// ---------- media ----------

export async function getAllMedia(): Promise<MediaItem[]> {
  return tx<MediaItem[]>(STORES.media, "readonly", (s) => s.getAll());
}

export async function putMedia(items: MediaItem[]): Promise<void> {
  if (!items.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.media, "readwrite");
        const s = t.objectStore(STORES.media);
        for (const item of items) s.put(item, item.localId);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

/** Remove media records by localId (used when a manual record is replaced
 *  by its linked provider record). */
export async function deleteMedia(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.media, "readwrite");
        const s = t.objectStore(STORES.media);
        for (const id of ids) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ---------- entries (real library) ----------

export async function getAllEntries(): Promise<UserMediaEntry[]> {
  return tx<UserMediaEntry[]>(STORES.entries, "readonly", (s) => s.getAll());
}

export async function putEntries(entries: UserMediaEntry[]): Promise<void> {
  if (!entries.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.entries, "readwrite");
        const s = t.objectStore(STORES.entries);
        for (const e of entries) s.put(e, e.id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function deleteEntries(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.entries, "readwrite");
        const s = t.objectStore(STORES.entries);
        for (const id of ids) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ---------- feedback ----------

export async function getAllFeedback(): Promise<TasteFeedback[]> {
  return tx<TasteFeedback[]>(STORES.feedback, "readonly", (s) => s.getAll());
}

export async function putFeedback(items: TasteFeedback[]): Promise<void> {
  if (!items.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.feedback, "readwrite");
        const s = t.objectStore(STORES.feedback);
        for (const f of items) s.put(f, f.id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function deleteFeedback(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.feedback, "readwrite");
        const s = t.objectStore(STORES.feedback);
        for (const id of ids) s.delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ---------- map layout ----------

export async function getMapLayout(): Promise<MapLayoutState | null> {
  try {
    const v = await tx<MapLayoutState | undefined>(
      STORES.mapLayout,
      "readonly",
      (s) => s.get("layout"),
    );
    return v ?? null;
  } catch {
    return null;
  }
}

export async function saveMapLayout(state: MapLayoutState): Promise<void> {
  await tx(STORES.mapLayout, "readwrite", (s) => s.put(state, "layout"));
}

// ---------- demo universe (isolated stores) ----------

export async function getAllDemoEntries(): Promise<UserMediaEntry[]> {
  return tx<UserMediaEntry[]>(STORES.demoEntries, "readonly", (s) => s.getAll());
}

export async function putDemoEntries(entries: UserMediaEntry[]): Promise<void> {
  if (!entries.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.demoEntries, "readwrite");
        const s = t.objectStore(STORES.demoEntries);
        for (const e of entries) s.put(e, e.id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function clearDemoData(): Promise<void> {
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(
          [STORES.demoEntries, STORES.demoMedia],
          "readwrite",
        );
        t.objectStore(STORES.demoEntries).clear();
        t.objectStore(STORES.demoMedia).clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

export async function getDemoMedia(): Promise<MediaItem[]> {
  return tx<MediaItem[]>(STORES.demoMedia, "readonly", (s) => s.getAll());
}

export async function putDemoMedia(items: MediaItem[]): Promise<void> {
  if (!items.length) return;
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(STORES.demoMedia, "readwrite");
        const s = t.objectStore(STORES.demoMedia);
        for (const item of items) s.put(item, item.localId);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ---------- destructive ----------

export async function clearAllLocalData(): Promise<void> {
  await openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(
          [
            STORES.kv,
            STORES.media,
            STORES.entries,
            STORES.feedback,
            STORES.mapLayout,
            STORES.demoEntries,
            STORES.demoMedia,
          ],
          "readwrite",
        );
        for (const name of Object.values(STORES)) {
          t.objectStore(name).clear();
        }
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}
