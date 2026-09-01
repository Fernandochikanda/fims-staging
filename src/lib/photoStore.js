const PHOTO_DB_NAME = "fims_photos_db";
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE = "photos";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB cap

let _photoDbPromise = null;

function openPhotoDB() {
  if (_photoDbPromise) return _photoDbPromise;
  _photoDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available in this environment"));
      return;
    }
    const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        store.createIndex("by_inspection", "inspectionId", { unique: false });
        store.createIndex("by_item", ["inspectionId", "itemId"], { unique: false });
        store.createIndex("by_sync_status", "syncStatus", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _photoDbPromise;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function genId() { return Date.now() + Math.random().toString(36).slice(2); }

export const photoStore = {
  async add(inspectionId, itemId, file) {
    if (!file.type || !file.type.startsWith("image/")) {
      throw new Error("Apenas ficheiros de imagem são permitidos.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error("A foto excede o limite de 10MB.");
    }
    const db = await openPhotoDB();
    const record = {
      id: genId(),
      inspectionId, itemId,
      blob: file,
      filename: file.name || `foto-${Date.now()}.jpg`,
      mimeType: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).add(record);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const { blob, ...meta } = record;
    return meta;
  },

  async listByInspection(inspectionId) {
    const db = await openPhotoDB();
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const idx = tx.objectStore(PHOTO_STORE).index("by_inspection");
    const records = await idbRequest(idx.getAll(IDBKeyRange.only(inspectionId)));
    const grouped = {};
    for (const r of records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const { blob, ...meta } = r;
      meta.url = URL.createObjectURL(blob);
      (grouped[r.itemId] ||= []).push(meta);
    }
    return grouped;
  },

  async remove(id) {
    const db = await openPhotoDB();
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  },

  async listPending() {
    const db = await openPhotoDB();
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const idx = tx.objectStore(PHOTO_STORE).index("by_sync_status");
    const records = await idbRequest(idx.getAll(IDBKeyRange.only("pending")));
    return records.map(({ blob, ...meta }) => meta);
  },

  async markSynced(id) {
    const db = await openPhotoDB();
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    const store = tx.objectStore(PHOTO_STORE);
    const record = await idbRequest(store.get(id));
    if (record) { record.syncStatus = "synced"; store.put(record); }
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  },
};
