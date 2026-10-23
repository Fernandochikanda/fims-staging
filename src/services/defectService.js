// src/services/defectService.js
// Tracks recurring defects: any inspection item scoring < 3 (1 or 2).
//  - 1st report (inspection where the defect appears): OPEN, 48h SLA, escalated to CEO.
//  - Auto-escalate again if still open past the 48h due date.
//  - Resolved when a subsequent inspection at the same location shows the same item >= 3.
// Persisted in localStorage (key: fims_defects).

const STORAGE_KEY = "fims_defects";

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function save(defects) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(defects)); } catch (e) {}
}
function genId() { return "def_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function defectKey(locationId, sectionId, itemLabel) {
  return String(locationId) + "::" + String(sectionId) + "::" + String(itemLabel || "").trim().toLowerCase();
}
function sectionNameOf(inspection, sectionId) {
  const s = (inspection.sections || []).find(x => String(x.id) === String(sectionId));
  return s ? (s.title || s.name || "Seção") : "Seção";
}

export const defectService = {
  // Process an inspection (call when supervisor approves). Returns { newDefects, recurringDefects, resolvedDefects }.
  processInspection(inspection) {
    const defects = load();
    const locId = inspection.location_id;
    const items = inspection.items || [];
    const inspDate = inspection.date || new Date().toISOString();
    const inspId = inspection.id;
    const changes = { newDefects: [], recurringDefects: [], resolvedDefects: [] };

    for (const item of items) {
      if (item.score === null || item.score === undefined) continue;
      const key = defectKey(locId, item.section_id, item.label || item.text);
      const existingOpen = defects.find(d => d.key === key && d.status === "open");

      if (item.score < 3) {
        if (existingOpen) {
          existingOpen.recurrence_count = (existingOpen.recurrence_count || 1) + 1;
          existingOpen.last_seen_at = inspDate;
          existingOpen.last_seen_inspection_id = inspId;
          existingOpen.last_score = item.score;
          changes.recurringDefects.push({ ...existingOpen });
        } else {
          const due = new Date(new Date(inspDate).getTime() + 48 * 3600 * 1000).toISOString();
          const d = {
            id: genId(),
            key, location_id: locId, location_name: inspection.location_name,
            section_id: item.section_id, section_name: sectionNameOf(inspection, item.section_id),
            item_label: item.label || item.text, score: item.score,
            opened_at: inspDate, opened_inspection_id: inspId, due_at: due,
            status: "open", recurrence_count: 1,
            last_seen_at: inspDate, last_seen_inspection_id: inspId, last_score: item.score,
            escalated: false, escalated_at: null,
            resolved_at: null, resolved_inspection_id: null,
          };
          defects.push(d);
          changes.newDefects.push({ ...d });
        }
      } else {
        if (existingOpen) {
          existingOpen.status = "resolved";
          existingOpen.resolved_at = inspDate;
          existingOpen.resolved_inspection_id = inspId;
          changes.resolvedDefects.push({ ...existingOpen });
        }
      }
    }
    save(defects);
    return changes;
  },

  getDefectsForLocation(locationId) {
    return load().filter(d => String(d.location_id) === String(locationId));
  },
  getOpenDefectForItem(locationId, item) {
    const key = defectKey(locationId, item.section_id, item.label || item.text);
    return load().find(d => d.key === key && d.status === "open") || null;
  },
  getResolvedDefectForItem(locationId, item) {
    const key = defectKey(locationId, item.section_id, item.label || item.text);
    return load().filter(d => d.key === key && d.status === "resolved")
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))[0] || null;
  },
  getAll() { return load(); },
  getOpen() { return load().filter(d => d.status === "open"); },
  getResolved() { return load().filter(d => d.status === "resolved"); },

  // Auto-escalate open defects past 48h. Returns newly-escalated (for re-notification).
  autoEscalate() {
    const defects = load();
    const now = Date.now();
    const escalated = [];
    for (const d of defects) {
      if (d.status === "open" && d.due_at && new Date(d.due_at).getTime() < now && !d.escalated) {
        d.escalated = true;
        d.escalated_at = new Date().toISOString();
        escalated.push({ ...d });
      }
    }
    save(defects);
    return escalated;
  },

  // SLA remaining (ms) for an open defect; negative if overdue.
  slaRemaining(d) {
    if (!d || !d.due_at) return 0;
    return new Date(d.due_at).getTime() - Date.now();
  },

  clear() { save([]); }
};

export default defectService;
