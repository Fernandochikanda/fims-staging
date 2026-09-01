const DB_NAME = "fims_data_db";
const DB_VERSION = 1;
const STORE_NAME = "app_data";
let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB not available")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) { db.createObjectStore(STORE_NAME); }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return _dbPromise;
}
function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export const dataStore = {
  async get(key) {
    try { const db = await openDB(); const tx = db.transaction(STORE_NAME, "readonly"); const store = tx.objectStore(STORE_NAME); return await idbRequest(store.get(key)); } catch (err) { return null; }
  },
  async set(key, value) {
    try { const db = await openDB(); const tx = db.transaction(STORE_NAME, "readwrite"); tx.objectStore(STORE_NAME).put(value, key); await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); } catch (err) {}
  },
  async remove(key) {
    try { const db = await openDB(); const tx = db.transaction(STORE_NAME, "readwrite"); tx.objectStore(STORE_NAME).delete(key); await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); } catch (err) {}
  },
  async clear() {
    try { const db = await openDB(); const tx = db.transaction(STORE_NAME, "readwrite"); tx.objectStore(STORE_NAME).clear(); await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); } catch (err) {}
  }
};
