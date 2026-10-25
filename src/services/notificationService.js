// src/services/notificationService.js
// ============================================================================
// Notificações FIMS — persistidas no Supabase (tabela fims_notifications) com:
//  - IDs determinísticos (gerados no cliente) → sem duplicados ao fundir.
//  - OUTBOX local: se o Supabase falhar (RLS/offline), a notificação fica em
//    fila e é reenviada automaticamente — nada se perde silenciosamente.
//  - Realtime por utilizador + polling de segurança feito no CommsContext.
// ============================================================================

import { supabase, TABLES } from '../lib/supabase';
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
   * Enviar notificação. `id` opcional (determinístico evita duplicados).
   * Devolve { ok, notif, error }. Em caso de falha guarda no outbox.
   */
  async send(userId, text, link = null, id = null, ts = null) {
    const notif = {
      id: id || genId(),
      user_id: String(userId),
      text,
      link,
      read: false,
      created_at: ts || new Date().toISOString(),
    };
    try {
      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .insert([notif])
        .select()
        .single();
      if (error) {
        this.enqueue(notif);
        return { ok: false, notif, error: error.message };
      }
      return { ok: true, notif: this.formatFromDb(data), error: null };
    } catch (e) {
      this.enqueue(notif);
      return { ok: false, notif, error: e.message };
    }
  },

  /** Fila de reenvio (outbox) */
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
      try {
        const { error } = await supabase.from(TABLES.NOTIFICATIONS).upsert([n]);
        if (error) remaining.push(n);
        else sent++;
      } catch (e) {
        remaining.push(n);
      }
    }
    writeOutbox(remaining);
    return sent;
  },

  outboxCount() { return readOutbox().length; },

  /** Buscar notificações de um utilizador (Supabase; se falhar, cache local) */
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
      return this.getLocalForUser(userId);
    }
  },

  /**
   * Subscrever INSERTs em tempo real para um utilizador.
   * `onNewNotification(notif)` é chamado por cada evento.
   */
  subscribe(userId, onNewNotification) {
    // substitui canal anterior
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
        if (status === 'SUBSCRIBED') {
          // console.log('[notificationService] Realtime ativo para', userId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
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
    try {
      await supabase
        .from(TABLES.NOTIFICATIONS)
        .update({ read: true })
        .eq('id', String(notifId))
        .eq('user_id', String(userId));
    } catch (e) {}
  },

  async markAllAsRead(userId) {
    try {
      await supabase
        .from(TABLES.NOTIFICATIONS)
        .update({ read: true })
        .eq('user_id', String(userId))
        .eq('read', false);
    } catch (e) {}
  },
};

export default notificationService;
