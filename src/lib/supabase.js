// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// Chave publishable/anon — pública por design; a proteção dos dados é feita
// por RLS + RPCs SECURITY DEFINER na base de dados (ver supabase/migrations/).
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || 'https://uaspabiqnmcwohluymeb.supabase.co';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_B08e9mtpZ8BCdauYElZlQw_4dgOaszz';

// NOTA: NÃO forçamos o header 'Authorization: Bearer <anon>' — isso impedia que
// sessões Supabase Auth (fallback login) fossem enviadas ao PostgREST, tornando
// impossível qualquer RLS baseada em auth.uid().
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const TABLES = {
  USERS: 'fims_users',
  TEMPLATES: 'fims_templates',
  TEMPLATE_CLIENTS: 'fims_template_clients',
  INSPECTIONS: 'fims_inspections',
  LOGS: 'fims_logs',
  LOCATIONS: 'fims_locations',
  NOTIFICATIONS: 'fims_notifications',
  MESSAGES: 'fims_messages',
  MESSAGE_READS: 'fims_message_reads',
  DEFECTS: 'fims_defects',
  SETTINGS: 'fims_settings',
  ANNOUNCEMENTS: 'fims_announcements',
  ANNOUNCEMENT_READS: 'fims_announcement_reads',
  ESCALATION_LOG: 'fims_escalation_log',
};

// ---------------------------------------------------------------------------
// RPC com deteção de capacidade + fallback.
// A migração supabase/migrations/20261027_remediation_*.sql cria os RPCs.
// Enquanto a migração não for aplicada, caímos no comportamento anterior
// (fallback fornecido pelo chamador) — zero downtime, sem quebra de fluxo.
// Resultado: { data, error, usedRpc } — error não-nulo se ambos falharam.
// ---------------------------------------------------------------------------
const _rpcUnavailable = new Set();

export async function rpcWithFallback(fnName, params, fallbackFn) {
  if (_rpcUnavailable.has(fnName)) {
    try {
      return { data: fallbackFn ? await fallbackFn() : null, error: null, usedRpc: false };
    } catch (e) {
      return { data: null, error: e, usedRpc: false };
    }
  }
  try {
    const { data, error } = await supabase.rpc(fnName, params);
    if (error) {
      // 404/PGRST202 = função inexistente (migração não aplicada); 42883 = undefined function
      const code = error.code || error.details || '';
      if (code === 'PGRST202' || code === '42883' || /does not exist|Could not find the function/i.test(error.message || '')) {
        _rpcUnavailable.add(fnName);
        return { data: fallbackFn ? await fallbackFn() : null, error: null, usedRpc: false };
      }
      return { data, error, usedRpc: true };
    }
    return { data, error: null, usedRpc: true };
  } catch (e) {
    return { data: null, error: e, usedRpc: true };
  }
}

export function isRpcAvailable(fnName) {
  return !_rpcUnavailable.has(fnName);
}

export function markRpcUnavailable(fnName) {
  _rpcUnavailable.add(fnName);
}
