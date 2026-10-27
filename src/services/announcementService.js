// src/services/announcementService.js
// ============================================================================
// Anúncios FIMS — persistidos no Supabase (fims_announcements + leituras por
// utilizador em fims_announcement_reads). Corrige ANN-001: os anúncios eram
// 100% localStorage e desapareciam ao trocar de dispositivo/recarregar.
// Fallback: enquanto a migração não estiver aplicada, mantém o comportamento
// anterior (localStorage), sem quebrar o fluxo.
// ============================================================================

import { supabase, TABLES, rpcWithFallback } from '../lib/supabase';
import { genId } from '../lib/helpers';

const LS_KEY = 'fims_announcements';
const LS_DISMISSED = 'fims_dismissed';

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function writeLocal(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify((list || []).slice(0, 200))); } catch (e) {}
}
function readDismissed() {
  try { return JSON.parse(localStorage.getItem(LS_DISMISSED) || '[]'); } catch { return []; }
}

export const announcementService = {
  /** Carrega: servidor + merge com cache local (por id). Devolve lista unificada. */
  async load() {
    let server = null;
    try {
      const { data, error } = await supabase
        .from(TABLES.ANNOUNCEMENTS)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && Array.isArray(data)) server = data;
    } catch (e) { /* offline / pré-migração */ }

    const local = readLocal();

    if (!server) return local;

    const byId = new Map(server.map(a => [String(a.id), {
      id: String(a.id),
      fromId: a.from_id,
      fromName: a.from_name || null,
      title: a.title,
      text: a.body || '',
      timestamp: a.created_at,
      targetRole: a.target_role || null,
      server: true,
    }]));

    // itens só locais (criados antes da migração) mantêm-se visíveis
    const localOnly = local.filter(a => !byId.has(String(a.id)));
    const merged = [...byId.values(), ...localOnly];
    writeLocal(merged);
    return merged;
  },

  /** Leituras (dismissals) do utilizador: servidor + fallback local */
  async loadReads(userId) {
    const localDismissed = readDismissed();
    try {
      const { data, error } = await supabase
        .from(TABLES.ANNOUNCEMENT_READS)
        .select('announcement_id')
        .eq('user_id', String(userId))
        .limit(500);
      if (!error && Array.isArray(data)) {
        const serverIds = data.map(r => String(r.announcement_id));
        return [...new Set([...serverIds, ...localDismissed])];
      }
    } catch (e) { /* offline / pré-migração */ }
    return localDismissed;
  },

  /** Cria anúncio persistente (RPC com fallback local). Devolve o anúncio. */
  async create({ fromId, fromName, title, text, targetRole }) {
    const announcement = {
      id: genId(),
      fromId,
      fromName: fromName || null,
      title,
      text,
      timestamp: new Date().toISOString(),
      targetRole: targetRole || null,
      dismissedBy: [],
    };

    // cache local imediata
    const local = readLocal();
    local.unshift(announcement);
    writeLocal(local);

    await rpcWithFallback(
      'fims_create_announcement',
      {
        p_id: announcement.id,
        p_from_id: fromId != null ? String(fromId) : null,
        p_from_name: fromName || null,
        p_title: title,
        p_body: text || '',
        p_target_role: targetRole || null,
      },
      async () => null // fallback: só localStorage (comportamento anterior)
    );

    return announcement;
  },

  /** Marca como lido/dispensado para ESTE utilizador (RPC + fallback local) */
  async dismiss(announcementId, userId) {
    try {
      const dismissed = readDismissed();
      if (!dismissed.includes(String(announcementId))) {
        dismissed.push(String(announcementId));
        try { localStorage.setItem(LS_DISMISSED, JSON.stringify(dismissed)); } catch (e) {}
      }
    } catch (e) {}

    if (userId == null) return;
    await rpcWithFallback(
      'fims_dismiss_announcement',
      { p_id: String(announcementId), p_user_id: String(userId) },
      async () => null
    );
  },
};

export default announcementService;
