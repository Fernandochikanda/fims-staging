// src/services/defectService.js
// ============================================================================
// Defeitos recorrentes: qualquer item de inspeção com score < 3.
//  - 1º registo (inspeção onde o defeito aparece): ABERTO, SLA 48h, escalado ao CEO.
//  - Re-escala automaticamente a cada 24h enquanto continuar aberto após o prazo.
//  - Resolvido quando uma inspeção posterior no mesmo local mostra o item >= 3.
//
// PERSISTÊNCIA: Supabase (tabela fims_defects) + cache localStorage.
//  -> Corrige o problema anterior: dados presos no localStorage do dispositivo
//     de quem aprovou, invisíveis para CEO/supervisores noutros dispositivos.
//  -> Todas as operações devolvem Promises e sincronizam com o servidor.
// ============================================================================

import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'fims_defects';
const TABLE = 'fims_defects';

// ---------------------------------------------------------------------------
// Cache local (leitura instantânea para a UI)
// ---------------------------------------------------------------------------
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveLocal(defects) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(defects)); } catch (e) {}
}
function genId() {
  return 'def_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function defectKey(locationId, sectionId, itemLabel) {
  return String(locationId) + '::' + String(sectionId) + '::' + String(itemLabel || '').trim().toLowerCase();
}
function sectionNameOf(inspection, sectionId) {
  const s = (inspection.sections || []).find(x => String(x.id) === String(sectionId));
  return s ? (s.title || s.name || 'Seção') : 'Seção';
}

/** Limpa campos undefined (Supabase rejeita undefined) */
function cleanRow(d) {
  const row = {
    id: d.id,
    key: d.key,
    location_id: d.location_id != null ? String(d.location_id) : null,
    location_name: d.location_name || null,
    section_id: d.section_id != null ? String(d.section_id) : null,
    section_name: d.section_name || null,
    item_label: d.item_label || null,
    score: d.score != null ? Number(d.score) : null,
    opened_at: d.opened_at || null,
    opened_inspection_id: d.opened_inspection_id || null,
    due_at: d.due_at || null,
    status: d.status || 'open',
    recurrence_count: d.recurrence_count || 1,
    last_seen_at: d.last_seen_at || null,
    last_seen_inspection_id: d.last_seen_inspection_id || null,
    last_score: d.last_score != null ? Number(d.last_score) : null,
    escalated: !!d.escalated,
    escalated_at: d.escalated_at || null,
    escalation_count: d.escalation_count || 0,
    last_escalated_at: d.last_escalated_at || null,
    resolved_at: d.resolved_at || null,
    resolved_inspection_id: d.resolved_inspection_id || null,
    updated_at: new Date().toISOString(),
  };
  Object.keys(row).forEach(k => { if (row[k] === undefined) row[k] = null; });
  return row;
}

/** Upsert de uma lista de defeitos no Supabase (best-effort; falha não quebra) */
async function upsertServer(defects) {
  if (!defects.length) return { ok: true, error: null };
  try {
    const rows = defects.map(cleanRow);
    const { error } = await supabase.from(TABLE).upsert(rows);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Carrega tudo: servidor primeiro, fundido com a cache local (merge por id) */
async function loadAll() {
  let server = [];
  let serverOk = false;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(2000);
    if (!error && Array.isArray(data)) { server = data; serverOk = true; }
  } catch (e) { /* offline */ }

  const local = loadLocal();

  if (!serverOk) return local; // offline → cache

  // Merge: servidor é fonte de verdade; itens locais desconhecidos são enviados ao servidor
  const byId = new Map(server.map(d => [String(d.id), d]));
  const localOnly = local.filter(d => !byId.has(String(d.id)));
  if (localOnly.length) upsertServer(localOnly); // sincroniza pendentes (fire & forget)

  const merged = [...server.map(fromDb), ...localOnly];
  saveLocal(merged);
  return merged;
}

/** Converte linha da BD para o formato interno */
function fromDb(row) {
  return {
    id: row.id,
    key: row.key,
    location_id: row.location_id,
    location_name: row.location_name,
    section_id: row.section_id,
    section_name: row.section_name,
    item_label: row.item_label,
    score: row.score,
    opened_at: row.opened_at,
    opened_inspection_id: row.opened_inspection_id,
    due_at: row.due_at,
    status: row.status,
    recurrence_count: row.recurrence_count,
    last_seen_at: row.last_seen_at,
    last_seen_inspection_id: row.last_seen_inspection_id,
    last_score: row.last_score,
    escalated: !!row.escalated,
    escalated_at: row.escalated_at,
    escalation_count: row.escalation_count || 0,
    last_escalated_at: row.last_escalated_at,
    resolved_at: row.resolved_at,
    resolved_inspection_id: row.resolved_inspection_id,
  };
}

export const defectService = {
  /**
   * Processa uma inspeção (chamar quando o supervisor aprova / inspeção termina).
   * Devolve { newDefects, recurringDefects, resolvedDefects, all }
   */
  async processInspection(inspection) {
    const defects = await loadAll();
    const locId = inspection.location_id;
    const items = inspection.items || [];
    const inspDate = inspection.date || new Date().toISOString();
    const inspId = inspection.id;
    const changes = { newDefects: [], recurringDefects: [], resolvedDefects: [], all: defects };
    const touched = [];

    for (const item of items) {
      if (item.score === null || item.score === undefined) continue;
      const key = defectKey(locId, item.section_id, item.label || item.text);
      const existingOpen = defects.find(d => d.key === key && d.status === 'open');

      if (item.score < 3) {
        if (existingOpen) {
          existingOpen.recurrence_count = (existingOpen.recurrence_count || 1) + 1;
          existingOpen.last_seen_at = inspDate;
          existingOpen.last_seen_inspection_id = inspId;
          existingOpen.last_score = item.score;
          // Recorrência após prazo → re-escalável
          if (existingOpen.due_at && new Date(existingOpen.due_at).getTime() < Date.now()) {
            existingOpen.escalated = false; // permite nova escalação no próximo ciclo
          }
          changes.recurringDefects.push({ ...existingOpen });
          touched.push(existingOpen);
        } else {
          const due = new Date(new Date(inspDate).getTime() + 48 * 3600 * 1000).toISOString();
          const d = {
            id: genId(),
            key, location_id: locId, location_name: inspection.location_name,
            section_id: item.section_id, section_name: sectionNameOf(inspection, item.section_id),
            item_label: item.label || item.text, score: item.score,
            opened_at: inspDate, opened_inspection_id: inspId, due_at: due,
            status: 'open', recurrence_count: 1,
            last_seen_at: inspDate, last_seen_inspection_id: inspId, last_score: item.score,
            escalated: false, escalated_at: null,
            escalation_count: 0, last_escalated_at: null,
            resolved_at: null, resolved_inspection_id: null,
          };
          defects.push(d);
          changes.newDefects.push({ ...d });
          touched.push(d);
        }
      } else {
        if (existingOpen) {
          existingOpen.status = 'resolved';
          existingOpen.resolved_at = inspDate;
          existingOpen.resolved_inspection_id = inspId;
          changes.resolvedDefects.push({ ...existingOpen });
          touched.push(existingOpen);
        }
      }
    }

    saveLocal(defects);
    const res = await upsertServer(touched);
    if (!res.ok) console.warn('[defectService] Falha ao sincronizar defeitos:', res.error);
    changes.all = defects;
    return changes;
  },

  getDefectsForLocation(locationId) {
    return loadLocal().filter(d => String(d.location_id) === String(locationId));
  },
  getOpenDefectForItem(locationId, item) {
    const key = defectKey(locationId, item.section_id, item.label || item.text);
    return loadLocal().find(d => d.key === key && d.status === 'open') || null;
  },
  getResolvedDefectForItem(locationId, item) {
    const key = defectKey(locationId, item.section_id, item.label || item.text);
    return loadLocal().filter(d => d.key === key && d.status === 'resolved')
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))[0] || null;
  },
  /** Lista completa sincronizada (para páginas) */
  async getAll() { return await loadAll(); },
  async getOpen() { return (await loadAll()).filter(d => d.status === 'open'); },
  async getResolved() { return (await loadAll()).filter(d => d.status === 'resolved'); },

  /**
   * Auto-escalação: corre em background (timer global do App).
   *  - 1ª vez: prazo (48h) excedido → escala.
   *  - Re-escala a cada 24h enquanto continuar aberto (escalation_count++).
   * Devolve a lista de defeitos escalados NESTE ciclo (para notificar).
   */
  async autoEscalate() {
    const defects = await loadAll();
    const now = Date.now();
    const REESCALATE_AFTER_MS = 24 * 3600 * 1000; // re-escala a cada 24h
    const escalated = [];

    for (const d of defects) {
      if (d.status !== 'open' || !d.due_at) continue;
      const overdue = new Date(d.due_at).getTime() < now;
      if (!overdue) continue;

      const lastEsc = d.last_escalated_at ? new Date(d.last_escalated_at).getTime() : 0;
      const neverEscalated = !d.escalated && (d.escalation_count || 0) === 0;
      const dueForReescalation = d.escalated && (now - lastEsc) >= REESCALATE_AFTER_MS;

      if (neverEscalated || dueForReescalation) {
        d.escalated = true;
        d.escalated_at = d.escalated_at || new Date().toISOString();
        d.escalation_count = (d.escalation_count || 0) + 1;
        d.last_escalated_at = new Date().toISOString();
        escalated.push({ ...d });
      }
    }

    if (escalated.length) {
      saveLocal(defects);
      const res = await upsertServer(escalated);
      if (!res.ok) console.warn('[defectService] Falha ao guardar escalação:', res.error);
    }
    return escalated;
  },

  /** Escalação manual (botão "Re-escalar agora") */
  async escalateNow(defectId) {
    const defects = await loadAll();
    const d = defects.find(x => String(x.id) === String(defectId));
    if (!d || d.status !== 'open') return null;
    d.escalated = true;
    d.escalated_at = d.escalated_at || new Date().toISOString();
    d.escalation_count = (d.escalation_count || 0) + 1;
    d.last_escalated_at = new Date().toISOString();
    saveLocal(defects);
    await upsertServer([d]);
    return { ...d };
  },

  /** Marca um defeito como resolvido manualmente (com nota opcional) */
  async resolveManually(defectId, userId) {
    const defects = await loadAll();
    const d = defects.find(x => String(x.id) === String(defectId));
    if (!d || d.status === 'resolved') return null;
    d.status = 'resolved';
    d.resolved_at = new Date().toISOString();
    d.resolved_inspection_id = d.resolved_inspection_id || ('manual_' + (userId || ''));
    d.escalated = false;
    saveLocal(defects);
    await upsertServer([d]);
    return { ...d };
  },

  /** Reabre um defeito resolvido */
  async reopen(defectId) {
    const defects = await loadAll();
    const d = defects.find(x => String(x.id) === String(defectId));
    if (!d) return null;
    d.status = 'open';
    d.resolved_at = null;
    d.resolved_inspection_id = null;
    // novo prazo de 48h a partir de agora
    d.due_at = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    saveLocal(defects);
    await upsertServer([d]);
    return { ...d };
  },

  /** SLA restante (ms); negativo se atrasado */
  slaRemaining(d) {
    if (!d || !d.due_at) return 0;
    return new Date(d.due_at).getTime() - Date.now();
  },

  async clear() {
    saveLocal([]);
    try { await supabase.from(TABLE).delete().neq('id', ''); } catch (e) {}
  },
};

export default defectService;
