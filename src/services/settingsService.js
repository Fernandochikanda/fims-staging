// src/services/settingsService.js
// ============================================================================
// Configuração central de notificações do FIMS.
//  - Define QUEM recebe (papéis) e PORQUE CANAL (notificação in-app, mensagem
//    no chat, e-mail via Edge Function futuramente) para cada evento.
//  - Persistida em Supabase (tabela fims_settings) com cache em localStorage,
//    para que a configuração seja partilhada entre todos os dispositivos.
//  - Fallback total para localStorage se o Supabase estiver indisponível.
// ============================================================================

import { supabase } from '../lib/supabase';

const SETTINGS_ID = 'notification_settings';
const LS_KEY = 'fims_notification_settings';

// Eventos suportados pelo sistema de comunicação
export const NOTIF_EVENTS = {
  INSPECTION_SUBMITTED: 'inspection_submitted',   // inspetor submete inspeção
  INSPECTION_COMPLETED: 'inspection_completed',   // inspeção aprovada/concluída
  INSPECTION_REJECTED: 'inspection_rejected',     // devolvida para correções
  DEFECT_NEW: 'defect_new',                       // novo defeito (score < 3)
  DEFECT_RECURRING: 'defect_recurring',           // defeito recorrente
  DEFECT_RESOLVED: 'defect_resolved',             // defeito resolvido
  DEFECT_ESCALATED: 'defect_escalated',           // SLA 48h excedido → escalação
  TASK_SCHEDULED: 'task_scheduled',               // nova tarefa para inspetor
};

export const CHANNELS = {
  NOTIFICATION: 'notification',  // campainha / página Notificações
  MESSAGE: 'message',            // mensagem automática no chat
};

export const EVENT_LABELS = {
  [NOTIF_EVENTS.INSPECTION_SUBMITTED]: 'Inspeção submetida (aguarda revisão)',
  [NOTIF_EVENTS.INSPECTION_COMPLETED]: 'Inspeção concluída / aprovada',
  [NOTIF_EVENTS.INSPECTION_REJECTED]: 'Inspeção devolvida p/ correções',
  [NOTIF_EVENTS.DEFECT_NEW]: 'Novo defeito (score < 3)',
  [NOTIF_EVENTS.DEFECT_RECURRING]: 'Defeito recorrente',
  [NOTIF_EVENTS.DEFECT_RESOLVED]: 'Defeito resolvido',
  [NOTIF_EVENTS.DEFECT_ESCALATED]: 'Escalonamento de defeito (SLA 48h)',
  [NOTIF_EVENTS.TASK_SCHEDULED]: 'Nova tarefa agendada',
};

// Configuração por omissão — requisito do negócio:
// "assim que terminar qualquer inspeção os supervisores recebem a notificação... e mensagem também"
function defaultSettings() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    events: {
      [NOTIF_EVENTS.INSPECTION_SUBMITTED]: {
        enabled: true,
        roles: ['supervisor', 'admin'],
        channels: { notification: true, message: true },
      },
      [NOTIF_EVENTS.INSPECTION_COMPLETED]: {
        enabled: true,
        roles: ['supervisor', 'admin', 'ceo'],
        channels: { notification: true, message: true },
      },
      [NOTIF_EVENTS.INSPECTION_REJECTED]: {
        enabled: true,
        roles: ['inspector'],
        channels: { notification: true, message: false },
      },
      [NOTIF_EVENTS.DEFECT_NEW]: {
        enabled: true,
        roles: ['supervisor', 'admin', 'ceo'],
        channels: { notification: true, message: false },
      },
      [NOTIF_EVENTS.DEFECT_RECURRING]: {
        enabled: true,
        roles: ['supervisor', 'admin', 'ceo'],
        channels: { notification: true, message: false },
      },
      [NOTIF_EVENTS.DEFECT_RESOLVED]: {
        enabled: true,
        roles: ['supervisor', 'admin'],
        channels: { notification: true, message: false },
      },
      [NOTIF_EVENTS.DEFECT_ESCALATED]: {
        enabled: true,
        roles: ['ceo', 'admin', 'supervisor'],
        channels: { notification: true, message: true },
      },
      [NOTIF_EVENTS.TASK_SCHEDULED]: {
        enabled: true,
        roles: ['inspector'],
        channels: { notification: true, message: false },
      },
    },
  };
}

function cacheLocal(settings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {}
}
function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; }
}

/** Mescla config guardada com os defaults (para não partir quando adicionamos eventos novos) */
function normalize(saved) {
  const def = defaultSettings();
  if (!saved || typeof saved !== 'object' || !saved.events) return def;
  const events = { ...def.events };
  Object.keys(def.events).forEach(ev => {
    if (saved.events[ev]) {
      events[ev] = {
        enabled: saved.events[ev].enabled !== false,
        roles: Array.isArray(saved.events[ev].roles) && saved.events[ev].roles.length
          ? saved.events[ev].roles : def.events[ev].roles,
        channels: {
          notification: saved.events[ev].channels?.notification !== false,
          message: saved.events[ev].channels?.message === true,
        },
      };
    }
  });
  return { ...def, ...saved, events };
}

export const settingsService = {
  EVENT_LABELS,
  NOTIF_EVENTS,
  CHANNELS,

  /** Config em cache (instantânea, síncrona) */
  get() {
    return normalize(readLocal());
  },

  /** Carrega do Supabase (com fallback local). Chamar no arranque da app. */
  async load() {
    try {
      const { data, error } = await supabase
        .from('fims_settings')
        .select('value')
        .eq('id', SETTINGS_ID)
        .maybeSingle();
      if (!error && data && data.value) {
        const norm = normalize(data.value);
        cacheLocal(norm);
        return norm;
      }
    } catch (e) { /* tabela pode ainda não existir — usa cache */ }
    return normalize(readLocal());
  },

  /** Guarda no Supabase + cache local. */
  async save(settings) {
    const norm = normalize({ ...settings, updatedAt: new Date().toISOString(), version: 2 });
    cacheLocal(norm);
    try {
      const { error } = await supabase
        .from('fims_settings')
        .upsert({ id: SETTINGS_ID, value: norm, updated_at: new Date().toISOString() });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /** Restaura defaults */
  async reset() {
    const def = defaultSettings();
    const r = await this.save(def);
    return { settings: def, ...r };
  },

  /** Está o evento ativo? */
  isEnabled(event) {
    const cfg = this.get().events[event];
    return !!(cfg && cfg.enabled);
  },

  /**
   * Devolve IDs (string) dos utilizadores-alvo de um evento, conforme config + utilizadores reais.
   * opts.rolesOverride: substitui os papéis configurados (uso interno p/ eventos ad-hoc).
   */
  resolveRecipients(event, users, opts = {}) {
    const cfg = this.get().events[event];
    const roles = opts.rolesOverride || (cfg && cfg.roles) || [];
    if (!roles.length) return [];
    const enabled = cfg ? cfg.enabled !== false : true;
    if (!enabled && !opts.rolesOverride) return [];
    const excludeId = opts.excludeId != null ? String(opts.excludeId) : null;
    // singleUser: restringe a um utilizador específico (ex.: o inspetor da tarefa)
    if (opts.singleUser != null) {
      const uid = String(opts.singleUser);
      if (excludeId && uid === excludeId) return [];
      const u = (users || []).find(x => String(x.id) === uid);
      return (u && u.active !== false) ? [uid] : [];
    }
    const list = (users || []).filter(u => {
      if (u.active === false) return false;
      if (!roles.includes(u.role)) return false;
      if (excludeId && String(u.id) === excludeId) return false;
      return true;
    });
    return list.map(u => String(u.id));
  },

  /** Canais ativos para o evento */
  channelsFor(event) {
    const cfg = this.get().events[event];
    if (!cfg || !cfg.enabled) return { notification: false, message: false };
    return {
      notification: cfg.channels?.notification !== false,
      message: cfg.channels?.message === true,
    };
  },

  /** Teste rápido de persistência (usado pela UI de configuração) */
  async testConnection() {
    try {
      const { error } = await supabase
        .from('fims_settings')
        .select('id')
        .eq('id', SETTINGS_ID)
        .maybeSingle();
      return { ok: !error, error: error ? error.message : null };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};

export default settingsService;
