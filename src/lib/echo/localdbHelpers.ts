/** Clear only the real-library stores (used by import-replace). */

import { openDB, STORES } from "./localdb";

export async function clearLibraryStores(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(
      [STORES.media, STORES.entries, STORES.feedback],
      "readwrite",
    );
    t.objectStore(STORES.media).clear();
    t.objectStore(STORES.entries).clear();
    t.objectStore(STORES.feedback).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
