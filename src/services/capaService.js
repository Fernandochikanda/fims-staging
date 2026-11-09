// /src/services/capaService.js
// ============================================================================
// CAPA (Corrective Action Preventive Action) tracking service.
// Creates, fetches, updates, and closes corrective actions for critical
// inspection defects (items scored 1-2).
//
// Replaces the ad-hoc audit log + chat notification in handleSubmitInspection
// with a tracked entity that has: status, deadline, evidence, closure.
// ============================================================================

import { supabase } from '../lib/supabase.js';
import { computeDueAt, sectionNameOf } from '../lib/defectLogic.js';

const TABLE = 'fims_capa';

// CAPA status constants
export const CAPA_STATUS = Object.freeze({
  OPEN:       'open',
  IN_PROGRESS:'in_progress',
  CLOSED:     'closed',
  OVERDUE:    'overdue',
  CANCELLED:  'cancelled',
});

export const CAPA_STATUS_LABELS = Object.freeze({
  [CAPA_STATUS.OPEN]:        { label: 'Aberta',        color: '#EF9F27', cls: 'badge-warning' },
  [CAPA_STATUS.IN_PROGRESS]: { label: 'Em Curso',      color: '#378ADD', cls: 'badge-progress' },
  [CAPA_STATUS.CLOSED]:      { label: 'Fechada',       color: '#0F6E56', cls: 'badge-reviewed' },
  [CAPA_STATUS.OVERDUE]:     { label: 'Atrasada',      color: '#A32D2D', cls: 'badge-critical' },
  [CAPA_STATUS.CANCELLED]:   { label: 'Cancelada',     color: '#888888', cls: 'badge-closed' },
});

export const capaService = {
  // ─── Generate CAPA rows on inspection submit ──────────────────
  // Creates one CAPA per item with score ≤ 2. Idempotent: if CAPAs already
  // exist for this inspection + item, they are NOT duplicated.
  //
  // @param {object} inspection - the submitted inspection (must have items, inspector_id, etc.)
  // @param {object} currentUser - the user who submitted (for audit)
  // @returns { created: number, skipped: number, capas: array }
  async generateForInspection(inspection, currentUser) {
    if (!inspection || !inspection.id || !inspection.items) {
      return { created: 0, skipped: 0, capas: [], error: 'invalid inspection' };
    }

    const lowScoreItems = inspection.items.filter(
      (i) => i.score !== null && i.score !== undefined && i.score <= 2
    );

    if (lowScoreItems.length === 0) {
      return { created: 0, skipped: 0, capas: [] };
    }

    // Check for existing CAPAs for this inspection (idempotency)
    const { data: existing } = await supabase
      .from(TABLE)
      .select('item_id, status')
      .eq('inspection_id', String(inspection.id));

    const existingItemIds = new Set((existing || []).map((c) => String(c.item_id)));

    // Build new CAPA rows for items that don't already have one
    const dueAt = computeDueAt(new Date().toISOString());
    const newCapas = lowScoreItems
      .filter((item) => !existingItemIds.has(String(item.id)))
      .map((item) => ({
        id: `capa_${inspection.id}_${item.id}_${Date.now().toString(36)}`,
        inspection_id: String(inspection.id),
        item_id: String(item.id),
        item_label: item.label || item.text || 'Item sem nome',
        section_id: String(item.section_id || ''),
        section_name: sectionNameOf(inspection, item.section_id),
        location_name: inspection.location_name || null,
        location_id: inspection.location_id ? String(inspection.location_id) : null,
        assigned_to: String(inspection.inspector_id || ''),
        assigned_name: inspection.inspector_name || null,
        due_at: dueAt,
        status: CAPA_STATUS.OPEN,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    let created = 0;
    if (newCapas.length > 0) {
      const { error } = await supabase.from(TABLE).insert(newCapas);
      if (error) {
        console.warn('[capaService] insert error:', error.message);
        return { created: 0, skipped: lowScoreItems.length, capas: [], error: error.message };
      }
      created = newCapas.length;
    }

    console.log(`[capaService] Generated ${created} CAPAs for inspection ${inspection.id} (${existingItemIds.size} already existed)`);
    return {
      created,
      skipped: lowScoreItems.length - created,
      capas: newCapas,
    };
  },

  // ─── Fetch CAPAs with optional filters ────────────────────────
  async fetchCapas({ status, assignedTo, inspectionId, limit = 200 } = {}) {
    try {
      let query = supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) query = query.eq('status', status);
      if (assignedTo) query = query.eq('assigned_to', String(assignedTo));
      if (inspectionId) query = query.eq('inspection_id', String(inspectionId));

      const { data, error } = await query;
      if (error) {
        console.warn('[capaService] fetchCapas error:', error.message);
        return { success: false, capas: [] };
      }
      return { success: true, capas: data || [] };
    } catch (e) {
      console.error('[capaService] fetchCapas exception:', e);
      return { success: false, capas: [] };
    }
  },

  // ─── Fetch CAPAs for a specific inspector ─────────────────────
  async fetchForInspector(userId) {
    return this.fetchCapas({ assignedTo: userId });
  },

  // ─── Fetch CAPAs for a specific inspection ────────────────────
  async fetchForInspection(inspectionId) {
    return this.fetchCapas({ inspectionId });
  },

  // ─── Update CAPA status (e.g. open → in_progress) ─────────────
  async updateStatus(id, newStatus, currentUser) {
    try {
      const updates = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from(TABLE)
        .update(updates)
        .eq('id', String(id));
      if (error) {
        console.warn('[capaService] updateStatus error:', error.message);
        return { success: false, error: error.message };
      }
      console.log(`[capaService] CAPA ${id} → ${newStatus}`);
      return { success: true };
    } catch (e) {
      console.error('[capaService] updateStatus exception:', e);
      return { success: false, error: e.message };
    }
  },

  // ─── Add evidence (photo + note) and mark in_progress ─────────
  async addEvidence(id, { evidencePhotoPath, evidenceNote }, currentUser) {
    try {
      const updates = {
        status: CAPA_STATUS.IN_PROGRESS,
        evidence_photo_path: evidencePhotoPath || null,
        evidence_note: evidenceNote || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from(TABLE)
        .update(updates)
        .eq('id', String(id));
      if (error) {
        console.warn('[capaService] addEvidence error:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e) {
      console.error('[capaService] addEvidence exception:', e);
      return { success: false, error: e.message };
    }
  },

  // ─── Close a CAPA (supervisor/admin verifies) ─────────────────
  async closeCapa(id, { closureNote, closedBy, closedByName }) {
    try {
      const updates = {
        status: CAPA_STATUS.CLOSED,
        closed_at: new Date().toISOString(),
        closed_by: closedBy || null,
        closed_by_name: closedByName || null,
        closure_note: closureNote || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from(TABLE)
        .update(updates)
        .eq('id', String(id));
      if (error) {
        console.warn('[capaService] closeCapa error:', error.message);
        return { success: false, error: error.message };
      }
      console.log(`[capaService] CAPA ${id} closed by ${closedByName || closedBy}`);
      return { success: true };
    } catch (e) {
      console.error('[capaService] closeCapa exception:', e);
      return { success: false, error: e.message };
    }
  },

  // ─── Cancel a CAPA (admin only, e.g. false positive) ──────────
  async cancelCapa(id, { reason, cancelledBy }) {
    try {
      const updates = {
        status: CAPA_STATUS.CANCELLED,
        closure_note: reason || 'Cancelled',
        closed_at: new Date().toISOString(),
        closed_by: cancelledBy,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from(TABLE)
        .update(updates)
        .eq('id', String(id));
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // ─── Mark overdue CAPAs (calls the SQL function) ──────────────
  async markOverdue() {
    try {
      const { data, error } = await supabase.rpc('fims_capa_mark_overdue');
      if (error) {
        console.warn('[capaService] markOverdue error:', error.message);
        return { success: false, count: 0 };
      }
      const count = typeof data === 'number' ? data : 0;
      if (count > 0) console.log(`[capaService] ${count} CAPA(s) marked overdue`);
      return { success: true, count };
    } catch (e) {
      console.error('[capaService] markOverdue exception:', e);
      return { success: false, count: 0 };
    }
  },

  // ─── Summary stats for dashboards ─────────────────────────────
  async getSummary(assignedTo = null) {
    try {
      let query = supabase.from(TABLE).select('status');
      if (assignedTo) query = query.eq('assigned_to', String(assignedTo));
      const { data, error } = await query;
      if (error) return { success: false, summary: {} };
      const rows = data || [];
      const summary = {
        total: rows.length,
        open: rows.filter((r) => r.status === CAPA_STATUS.OPEN).length,
        in_progress: rows.filter((r) => r.status === CAPA_STATUS.IN_PROGRESS).length,
        closed: rows.filter((r) => r.status === CAPA_STATUS.CLOSED).length,
        overdue: rows.filter((r) => r.status === CAPA_STATUS.OVERDUE).length,
        cancelled: rows.filter((r) => r.status === CAPA_STATUS.CANCELLED).length,
      };
      summary.open_or_overdue = summary.open + summary.overdue + summary.in_progress;
      return { success: true, summary };
    } catch (e) {
      return { success: false, summary: {} };
    }
  },
};
