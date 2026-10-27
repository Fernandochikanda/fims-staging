// src/services/defectService.js
// ============================================================================
// Defeitos recorrentes: qualquer item de inspeção com score < 3.
//  - 1º registo (inspeção onde o defeito aparece): ABERTO, SLA 48h, escalado ao CEO.
//  - Re-escala automaticamente a cada 24h enquanto continuar aberto após o prazo
//    (AGORA NO SERVIDOR: pg_cron → fims_escalate_overdue_defects; corrige ESC-001/002).
//  - Resolvido quando uma inspeção posterior no mesmo local mostra o item >= 3.
//
// REMEDIAÇÃO (audit DEF-001..005 / ESC-001..004):
//  • processInspection é IDEMPOTENTE: reprocessar a mesma inspeção não volta a
//    incrementar recorrências nem cria defeitos duplicados (guard por
//    inspection_id). Lógica extraída para computeDefectChanges (pura, testável).
//  • Identidade estável: key = location::section::iid:<item.id> (id estável do
//    template). Fallback lbl:<label> para inspeções antigas + matching legado.
//  • Escalonamento manual via RPC fims_escalate_defect (idempotente no servidor,
//    dedupe por (defect_id, stage) em fims_escalation_log).
//  • Resolução/reabertura via RPCs idempotentes (fims_resolve_defect /
//    fims_reopen_defect) — sem incrementos por clique repetido.
//  • clear() já NÃO apaga a tabela no servidor (só a cache local).
//  • Upsert server-side via fims_upsert_defects (fallback: upsert direto
//    enquanto a migração não estiver aplicada).
// ============================================================================

import { supabase, TABLES, rpcWithFallback } from '../lib/supabase';
import { defectKey, computeDueAt, computeDefectChanges } from '../lib/defectLogic';

export { defectKey, computeDueAt, computeDefectChanges };

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

/** Upsert no servidor via RPC (fallback: upsert direto pré-migração) */
async function upsertServer(defects) {
  if (!defects.length) return { ok: true, error: null };
  try {
    const rows = defects.map(cleanRow);
    const { error } = await rpcWithFallback(
      'fims_upsert_defects',
      { p_rows: rows },
      async () => {
        const { error: e } = await supabase.from(TABLE).upsert(rows);
        if (e) throw e;
        return rows.length;
      }
    );
    return error ? { ok: false, error: error.message || String(error) } : { ok: true, error: null };
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

  if (!serverOk) return local.map(fromDb); // offline → cache

  const byId = new Map(server.map(d => [String(d.id), d]));
  const localOnly = local.filter(d => !byId.has(String(d.id)));
  if (localOnly.length) upsertServer(localOnly); // sincroniza pendentes (best-effort)

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
   * Idempotente: chamar 2× com a mesma inspeção não altera o estado.
   */
  async processInspection(inspection) {
    const defects = await loadAll();
    const changes = computeDefectChanges(defects, inspection);
    if (changes.touched.length) {
      saveLocal(changes.all);
      const res = await upsertServer(changes.touched);
      if (!res.ok) console.warn('[defectService] Falha ao sincronizar defeitos:', res.error);
    }
    return changes;
  },

  getDefectsForLocation(locationId) {
    return loadLocal().filter(d => String(d.location_id) === String(locationId));
  },
  getOpenDefectForItem(locationId, item) {
    const key = defectKey(locationId, item.section_id, item);
    const label = String(item.label || item.text || '').trim().toLowerCase();
    return loadLocal().find(d =>
      (d.key === key || (label &&
        String(d.item_label || '').trim().toLowerCase() === label &&
        String(d.section_id) === String(item.section_id))) &&
      d.status === 'open') || null;
  },
  getResolvedDefectForItem(locationId, item) {
    const key = defectKey(locationId, item.section_id, item);
    const label = String(item.label || item.text || '').trim().toLowerCase();
    return loadLocal().filter(d =>
      (d.key === key || (label &&
        String(d.item_label || '').trim().toLowerCase() === label &&
        String(d.section_id) === String(item.section_id))) &&
      d.status === 'resolved')
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))[0] || null;
  },
  /** Lista completa sincronizada (para páginas) */
  async getAll() { return await loadAll(); },
  async getOpen() { return (await loadAll()).filter(d => d.status === 'open'); },
  async getResolved() { return (await loadAll()).filter(d => d.status === 'resolved'); },

  /**
   * ESCALONAMENTO — agora 100% server-side (pg_cron chama
   * fims_escalate_overdue_defects a cada 15 min;corrige ESC-001/ESC-002/ESC-003).
   * Esta função apenas DEVOLVE os defeitos atualmente escalados para a UI,
   * sem criar notificações nem mutar estado (o cliente já não decide escalação).
   */
  async fetchEscalated() {
    const defects = await loadAll();
    return defects.filter(d => d.status === 'open' && (d.escalation_count || 0) > 0);
  },

  /** Escalação manual (botão "Re-escalar agora") — RPC idempotente no servidor */
  async escalateNow(defectId) {
    const { data, error } = await rpcWithFallback(
      'fims_escalate_defect',
      { p_defect_id: String(defectId) },
      async () => {
        // Fallback pré-migração: comportamento anterior (incremento local)
        const defects = await loadAll();
        const d = defects.find(x => String(x.id) === String(defectId));
        if (!d || d.status !== 'open') return false;
        d.escalated = true;
        d.escalated_at = d.escalated_at || new Date().toISOString();
        d.escalation_count = (d.escalation_count || 0) + 1;
        d.last_escalated_at = new Date().toISOString();
        saveLocal(defects);
        await upsertServer([d]);
        return true;
      }
    );
    if (error) return { ok: false, error: error.message };
    await this.refresh();
    return { ok: !!data, escalated: !!data };
  },

  /** Marca um defeito como resolvido manualmente — RPC idempotente */
  async resolveManually(defectId, userId) {
    const { error } = await rpcWithFallback(
      'fims_resolve_defect',
      { p_defect_id: String(defectId), p_user_id: userId ? String(userId) : null },
      async () => {
        const defects = await loadAll();
        const d = defects.find(x => String(x.id) === String(defectId));
        if (!d || d.status === 'resolved') return null;
        d.status = 'resolved';
        d.resolved_at = new Date().toISOString();
        d.resolved_inspection_id = d.resolved_inspection_id || ('manual_' + (userId || ''));
        d.escalated = false;
        saveLocal(defects);
        await upsertServer([d]);
        return d;
      }
    );
    if (error) return { ok: false, error: error.message };
    await this.refresh();
    return { ok: true };
  },

  /** Reabre um defeito resolvido — RPC idempotente (novo prazo de 48h) */
  async reopen(defectId) {
    const { error } = await rpcWithFallback(
      'fims_reopen_defect',
      { p_defect_id: String(defectId) },
      async () => {
        const defects = await loadAll();
        const d = defects.find(x => String(x.id) === String(defectId));
        if (!d) return null;
        d.status = 'open';
        d.resolved_at = null;
        d.resolved_inspection_id = null;
        d.due_at = computeDueAt(new Date().toISOString());
        saveLocal(defects);
        await upsertServer([d]);
        return d;
      }
    );
    if (error) return { ok: false, error: error.message };
    await this.refresh();
    return { ok: true };
  },

  /** Recarrega do servidor e atualiza a cache local (refresh de UI, sem escrita) */
  async refresh() {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .order('opened_at', { ascending: false })
        .limit(2000);
      if (!error && Array.isArray(data)) {
        saveLocal(data.map(fromDb));
        return data.map(fromDb);
      }
    } catch (e) { /* offline */ }
    return loadLocal();
  },

  /** SLA restante (ms); negativo se atrasado */
  slaRemaining(d) {
    if (!d || !d.due_at) return 0;
    return new Date(d.due_at).getTime() - Date.now();
  },

  /** Limpa APENAS a cache local — já não apaga a tabela no servidor (DEF-005) */
  async clear() {
    saveLocal([]);
  },
};

export default defectService;
