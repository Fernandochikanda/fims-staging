// src/services/notificationService.js
// ============================================================================
// Notificações FIMS — persistidas no Supabase (fims_notifications).
//
// REMEDIAÇÃO (audit NOTIF-001/NOTIF-002/SEC-001):
//  • Criação via RPC fims_notify com dedupe_key determinística → cada evento
//    de negócio gera a notificação UMA vez (retries/duplo-clique não duplicam).
//  • Escritas já não vão direto à tabela (INSERT revogado após a migração);
//    o outbox local reenvia pelo MESMO RPC — sem perder nada se offline.
//  • Read-state via RPC fims_notification_read (user_id sempre do destinatário).
//  • Fallback: enquanto a migração não for aplicada, mantém o insert direto
//    (comportamento anterior) — zero downtime.
// ============================================================================

import { supabase, TABLES, rpcWithFallback } from '../lib/supabase';
import { genId } from '../lib/helpers';

const OUTBOX_KEY = 'fims_notif_outbox';
const SEEN_KEY = 'fims_notif_seen';

function readOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch { return []; }
}
function writeOutbox(list) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(0, 200))); } catch (e) {}
}
export function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}
export function markSeen(ids) {
  try {
    const seen = new Set(readSeen());
    ids.forEach(id => seen.add(String(id)));
    const arr = [...seen].slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    return arr;
  } catch (e) { return []; }
}

export const notificationService = {
  _channel: null,
  _channelUserId: null,
  _callbacks: [],

  /**
   * Enviar notificação.
   * `dedupeKey` (recomendado): chave determinística do evento de negócio —
   * ex.: 'esc:def_123:1', 'inspdone:insp_42'. Retries tornam-se no-ops.
   * Devolve { ok, notif, error }. Em caso de falha guarda no outbox.
   */
  async send(userId, text, link = null, id = null, ts = null, dedupeKey = null) {
    if (userId === undefined || userId === null || userId === '') {
      return { ok: false, notif: null, error: 'userId em falta' };
    }
    const notif = {
      id: id || genId(),
      user_id: String(userId),
      text,
      link,
      read: false,
      created_at: ts || new Date().toISOString(),
      dedupe_key: dedupeKey || null,
    };

    const { data, error, usedRpc } = await rpcWithFallback(
      'fims_notify',
      { p_user_id: notif.user_id, p_text: text, p_link: link, p_dedupe_key: dedupeKey },
      async () => {
        const { data: d, error: e } = await supabase
          .from(TABLES.NOTIFICATIONS)
          .insert([notif])
          .select()
          .single();
        if (e) throw e;
        return d;
      }
    );

    if (error) {
      this.enqueue(notif);
      return { ok: false, notif, error: error.message };
    }
    if (data) return { ok: true, notif: this.formatFromDb(data), error: null };
    // Sem dados (fallback sem retorno): assume enviado a partir do objeto local
    return { ok: true, notif: this.formatFromDb(notif), error: null };
  },

  /** Fila de reenvio (outbox) — pelo mesmo RPC, com a mesma dedupe_key */
  enqueue(notif) {
    const list = readOutbox();
    if (!list.some(n => n.id === notif.id)) {
      list.push(notif);
      writeOutbox(list);
    }
  },

  /** Tenta reenviar tudo o que estiver na fila. Devolve nº de enviados. */
  async flushOutbox() {
    const list = readOutbox();
    if (!list.length) return 0;
    const remaining = [];
    let sent = 0;
    for (const n of list) {
      const res = await this.send(n.user_id, n.text, n.link || null, n.id, n.created_at, n.dedupe_key || null);
      if (res.ok) sent++;
      else remaining.push(n);
    }
    writeOutbox(remaining);
    return sent;
  },

  outboxCount() { return readOutbox().length; },

  /**
   * Buscar notificações de um utilizador (Supabase; se falhar, cache local).
   * `stale: true` sinaliza que veio da cache por erro de rede/BD (NOTIF-002).
   */
  async fetchForUser(userId, limit = 100) {
    try {
      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .select('*')
        .eq('user_id', String(userId))
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).map(r => this.formatFromDb(r));
    } catch (e) {
      return this.getLocalForUser(userId).map(n => ({ ...n, stale: true }));
    }
  },

  /**
   * Subscrever INSERTs em tempo real para um utilizador.
   */
  subscribe(userId, onNewNotification) {
    if (this._channel) {
      try { supabase.removeChannel(this._channel); } catch (e) {}
      this._channel = null;
    }
    this._callbacks = [];
    this._callbacks.push(onNewNotification);
    this._channelUserId = String(userId);

    this._channel = supabase
      .channel('fims-notifications-' + String(userId))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: TABLES.NOTIFICATIONS,
          filter: 'user_id=eq.' + String(userId),
        },
        (payload) => {
          if (!payload.new) return;
          const notif = this.formatFromDb(payload.new);
          this._callbacks.forEach(cb => { try { cb(notif); } catch (e) {} });
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // o CommsContext faz polling como rede de segurança
        }
      });

    return () => this.unsubscribe();
  },

  unsubscribe() {
    if (this._channel) {
      try { supabase.removeChannel(this._channel); } catch (e) {}
      this._channel = null;
      this._channelUserId = null;
      this._callbacks = [];
    }
  },

  formatFromDb(row) {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      text: row.text,
      link: row.link,
      read: row.read === true,
      timestamp: row.created_at,
      dedupeKey: row.dedupe_key || null,
    };
  },

  /** Cache local de emergência (offline) */
  saveLocal(notif) {
    try {
      const notifs = JSON.parse(localStorage.getItem('fims_notifs') || '[]');
      notifs.unshift(notif);
      localStorage.setItem('fims_notifs', JSON.stringify(notifs.slice(0, 100)));
    } catch (e) {}
  },

  getLocalForUser(userId) {
    try {
      const notifs = JSON.parse(localStorage.getItem('fims_notifs') || '[]');
      return notifs.filter(n => (n.user_id === String(userId) || n.userId === String(userId)))
        .map(n => ({
          id: String(n.id),
          userId: String(n.user_id || n.userId),
          text: n.text,
          link: n.link || null,
          read: n.read === true,
          timestamp: n.created_at || n.timestamp,
        }));
    } catch (e) { return []; }
  },

  async markAsRead(notifId, userId) {
    const { error } = await rpcWithFallback(
      'fims_notification_read',
      { p_user_id: String(userId), p_notification_id: String(notifId) },
      async () => {
        const { error: e } = await supabase
          .from(TABLES.NOTIFICATIONS)
          .update({ read: true })
          .eq('id', String(notifId))
          .eq('user_id', String(userId));
        if (e) throw e;
        return null;
      }
    );
    return !error;
  },

  async markAllAsRead(userId) {
    const { error } = await rpcWithFallback(
      'fims_notification_read',
      { p_user_id: String(userId), p_notification_id: null },
      async () => {
        const { error: e } = await supabase
          .from(TABLES.NOTIFICATIONS)
          .update({ read: true })
          .eq('user_id', String(userId))
          .eq('read', false);
        if (e) throw e;
        return null;
      }
    );
    return !error;
  },
};

export default notificationService;
