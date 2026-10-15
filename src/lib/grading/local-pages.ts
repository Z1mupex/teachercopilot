// Blobs remain local to this browser for retry/reopen. Keys include the batch UUID;
// credentials, student identities and original local filenames are never stored.
const DATABASE = "teacher-copilot-upload-pages";
import type { ScanQuality } from "@/lib/grading/scan-analysis";
export type LocalPageMetadata = {
  source?: "batch_scan";
  fingerprint?: string;
  quality?: ScanQuality;
  uploadToken?: string;
  replacementVersion?: string;
};
type LocalPage = {
  key: string;
  batch: string;
  id: string;
  blob: Blob;
  metadata?: LocalPageMetadata;
};

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("pages", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Браузер не смог сохранить страницы для повтора."));
  });
}
export async function saveLocalPage(
  batch: string,
  id: string,
  blob: Blob,
  metadata?: LocalPageMetadata,
) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pages", "readwrite");
      tx.objectStore("pages").put({
        key: `${batch}/${id}`,
        batch,
        id,
        blob,
        metadata,
      } satisfies LocalPage);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error("Не хватило места для сохранения страницы в браузере."),
        );
      tx.onabort = () => reject(new Error("Локальное сохранение прервано."));
    });
  } finally {
    db.close();
  }
}
export async function readLocalPages(batch: string): Promise<LocalPage[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("pages").objectStore("pages").getAll();
      request.onsuccess = () =>
        resolve(
          (request.result as LocalPage[]).filter(
            (page) => page.batch === batch,
          ),
        );
      request.onerror = () =>
        reject(new Error("Не удалось восстановить локальные страницы."));
    });
  } finally {
    db.close();
  }
}
export async function removeLocalPage(batch: string, id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pages", "readwrite");
      tx.objectStore("pages").delete(`${batch}/${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Не удалось удалить локальную страницу."));
      tx.onabort = () => reject(new Error("Локальное удаление прервано."));
    });
  } finally {
    db.close();
  }
}

// Deliberate logout clears cached papers; session expiry keeps them for recovery.
export async function clearLocalPages() {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pages", "readwrite");
      tx.objectStore("pages").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Не удалось удалить локальные страницы."));
      tx.onabort = () => reject(new Error("Локальное удаление прервано."));
    });
  } finally {
    db.close();
  }
}
