import { supabase } from './supabase';

// ============================================
// IndexedDB setup (kept as offline fallback)
// ============================================
const PHOTO_DB_NAME = "fims_photos_db";
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE_NAME = "photos";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

let _photoDbPromise = null;

function openPhotoDB() {
  if (_photoDbPromise) return _photoDbPromise;
  _photoDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        const store = db.createObjectStore(PHOTO_STORE_NAME, { keyPath: "id" });
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

// ============================================
// MAIN PHOTO STORE
// Primary: Supabase Storage + photos table
// Fallback: IndexedDB (for offline)
// ============================================
export const photoStore = {
  async add(inspectionId, itemId, file) {
    if (!file.type || !file.type.startsWith("image/")) {
      throw new Error("Apenas ficheiros de imagem sao permitidos.");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new Error("A foto excede o limite de 10MB.");
    }

    // Try Supabase Storage first
    try {
      const ext = (file.name || "foto.jpg").split(".").pop().toLowerCase();
      const filePath = `inspections/${inspectionId}/${itemId}/${Date.now()}.${ext}`;

      console.log("[photoStore] Uploading to Supabase Storage:", filePath);
      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(filePath, file, { cacheControl: "3600" });

      if (uploadError) {
        console.warn("[photoStore] Storage upload failed:", uploadError.message);
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("inspection-photos")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      console.log("[photoStore] Photo uploaded:", publicUrl);

      // Save metadata to photos table
      const { data: rowData, error: dbError } = await supabase
        .from("photos")
        .insert([{
          inspection_id: String(inspectionId),
          item_id: String(itemId),
          file_name: file.name || `foto-${Date.now()}.jpg`,
          file_url: publicUrl,
          file_path: filePath,
        }])
        .select("*");

      if (dbError) {
        console.warn("[photoStore] DB insert error:", dbError.message);
        // Still return the URL — the file is in Storage
        return {
          id: genId(),
          inspectionId: String(inspectionId),
          itemId: String(itemId),
          filename: file.name || `foto-${Date.now()}.jpg`,
          url: publicUrl,
          file_path: filePath,
          syncStatus: "synced_storage_only",
        };
      }

      const row = rowData[0];
      return {
        id: String(row.id),
        inspectionId: row.inspection_id,
        itemId: row.item_id,
        filename: row.file_name,
        url: row.file_url,
        file_path: row.file_path,
        syncStatus: "synced",
      };
    } catch (supabaseError) {
      // Fall back to IndexedDB
      console.warn("[photoStore] Supabase failed, using IndexedDB:", supabaseError.message);
      return this._addToIndexedDB(inspectionId, itemId, file);
    }
  },

  async listByInspection(inspectionId) {
    // Try Supabase first
    try {
      console.log("[photoStore] Fetching photos from Supabase for:", inspectionId);
      const { data, error } = await supabase
        .from("photos")
        .select("*")
        .eq("inspection_id", String(inspectionId))
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        console.log("[photoStore] Found", data.length, "photos in Supabase");
        const grouped = {};
        for (const row of data) {
          const meta = {
            id: String(row.id),
            inspectionId: row.inspection_id,
            itemId: row.item_id,
            filename: row.file_name,
            url: row.file_url,
            file_path: row.file_path,
          };
          if (!grouped[row.item_id]) grouped[row.item_id] = [];
          grouped[row.item_id].push(meta);
        }
        return grouped;
      }

      if (error) {
        console.warn("[photoStore] Supabase query error:", error.message);
      }
    } catch (e) {
      console.warn("[photoStore] Supabase query failed, using IndexedDB:", e.message);
    }

    // Fall back to IndexedDB
    return this._listFromIndexedDB(inspectionId);
  },

  async remove(id) {
    // Try Supabase first
    try {
      // Get the photo to find file_path
      const { data } = await supabase
        .from("photos")
        .select("*")
        .eq("id", id)
        .single();

      if (data) {
        // Delete from Storage
        if (data.file_path) {
          console.log("[photoStore] Deleting from Storage:", data.file_path);
          await supabase.storage
            .from("inspection-photos")
            .remove([data.file_path]);
        }

        // Delete from photos table
        await supabase.from("photos").delete().eq("id", id);
        console.log("[photoStore] Deleted from Supabase");
        return;
      }
    } catch (e) {
      console.warn("[photoStore] Supabase delete failed, using IndexedDB:", e.message);
    }

    // Fall back to IndexedDB
    await this._removeFromIndexedDB(id);
  },

  async listPending() {
    try {
      const db = await openPhotoDB();
      const tx = db.transaction(PHOTO_STORE_NAME, "readonly");
      const idx = tx.objectStore(PHOTO_STORE_NAME).index("by_sync_status");
      const records = await idbRequest(idx.getAll(IDBKeyRange.only("pending")));
      return records.map(({ blob, ...meta }) => meta);
    } catch (e) {
      return [];
    }
  },

  async markSynced(id) {
    try {
      const db = await openPhotoDB();
      const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");
      const store = tx.objectStore(PHOTO_STORE_NAME);
      const record = await idbRequest(store.get(id));
      if (record) { record.syncStatus = "synced"; store.put(record); }
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (e) {}
  },

  // ============================================
  // IndexedDB fallback methods
  // ============================================
  async _addToIndexedDB(inspectionId, itemId, file) {
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
    const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");
    tx.objectStore(PHOTO_STORE_NAME).add(record);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const { blob, ...meta } = record;
    meta.url = URL.createObjectURL(file);
    return meta;
  },

  async _listFromIndexedDB(inspectionId) {
    try {
      const db = await openPhotoDB();
      const tx = db.transaction(PHOTO_STORE_NAME, "readonly");
      const idx = tx.objectStore(PHOTO_STORE_NAME).index("by_inspection");
      const records = await idbRequest(idx.getAll(IDBKeyRange.only(inspectionId)));
      const grouped = {};
      for (const r of records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        const { blob, ...meta } = r;
        meta.url = URL.createObjectURL(blob);
        if (!grouped[r.itemId]) grouped[r.itemId] = [];
        grouped[r.itemId].push(meta);
      }
      return grouped;
    } catch (e) {
      return {};
    }
  },

  async _removeFromIndexedDB(id) {
    try {
      const db = await openPhotoDB();
      const tx = db.transaction(PHOTO_STORE_NAME, "readwrite");
      tx.objectStore(PHOTO_STORE_NAME).delete(id);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (e) {}
  },
};
