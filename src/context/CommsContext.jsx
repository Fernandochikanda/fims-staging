// src/context/CommsContext.jsx
// ============================================================================
// FIMS — Centro de comunicação (notificações + mensagens + anúncios).
//
// REMEDIAÇÃO (audit MSG-001..004 / NOTIF-001..003 / ANN-001 / SEC-001):
//  • A app já NÃO descarrega as mensagens de todos os utilizadores: todas as
//    consultas são filtradas por destinatário (to_id = eu, from_id = eu ou
//    broadcast). O realtime também é filtrado (dois handlers com filter).
//  • Read receipts POR DESTINATÁRIO (fims_message_reads): ler um broadcast não
//    o marca como lido para os outros. Unread counts derivados dos receipts.
//  • Escritas via RPCs (fims_send_message / fims_notify) com dedupe por
//    client_msg_id / dedupe_key. Fallbacks mantêm o fluxo pré-migração.
//  • Mensagens falhadas ficam com `pending: true` — já não há "falso sucesso".
//  • Anúncios persistidos no servidor (announcementService) com fallback local.
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { genId } from '../lib/helpers';
import { supabase, TABLES, rpcWithFallback } from '../lib/supabase';
import { notificationService } from '../services/notificationService';
import announcementService from '../services/announcementService';
import settingsService, { NOTIF_EVENTS } from '../services/settingsService';

const CommsContext = createContext();

// Chaves para localStorage (cache/offline)
const STORAGE_KEYS = {
  MESSAGES: 'fims_messages',
  NOTIFICATIONS: 'fims_notifications',
  DRAFT: 'fims_messages_draft',
  ANNOUNCEMENTS: 'fims_announcements',
  DISMISSED: 'fims_dismissed',
  MSG_OUTBOX: 'fims_msg_outbox',
};

const POLL_NOTIFICATIONS_MS = 45000;
const POLL_MESSAGES_MS = 45000;
const FLUSH_OUTBOX_MS = 60000;

// ---------------------------------------------------------------------------
// Helpers de persistência de mensagens (Supabase fims_messages)
// Schema: id bigint identity, from_id, to_id, text, created_at
//         (+ read, sender_name, role_filter, client_msg_id)
// ---------------------------------------------------------------------------
function toDbRow(msg) {
  const row = {
    from_id: String(msg.fromId),
    to_id: String(msg.toId),
    text: msg.text,
    created_at: msg.timestamp || new Date().toISOString(),
    read: msg.read === true,
    sender_name: msg.senderName || null,
    client_msg_id: msg.clientId || msg.id,
  };
  if (msg.roleFilter) row.role_filter = msg.roleFilter;
  return row;
}
function fromDbRow(row) {
  return {
    id: 'srv_' + row.id,
    serverId: row.id,
    clientId: row.client_msg_id || null,
    fromId: String(row.from_id),
    toId: String(row.to_id),
    text: row.text,
    timestamp: row.created_at,
    read: row.read === true,
    isBroadcast: String(row.to_id) === 'broadcast',
    roleFilter: row.role_filter || null,
    senderName: row.sender_name || null,
    pending: false,
  };
}

function readMsgOutbox() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.MSG_OUTBOX) || '[]'); } catch { return []; }
}
function writeMsgOutbox(list) {
  try { localStorage.setItem(STORAGE_KEYS.MSG_OUTBOX, JSON.stringify(list.slice(0, 200))); } catch (e) {}
}

export function CommsProvider({ children, currentUser }) {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });

  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });

  const [announcements, setAnnouncements] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });

  const [dismissed, setDismissed] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DISMISSED);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });

  const [myReads, setMyReads] = useState(() => new Set());
  const [draft, setDraft] = useState(() => localStorage.getItem(STORAGE_KEYS.DRAFT) || '');
  const [commsStatus, setCommsStatus] = useState('connecting');

  const currentUserId = currentUser?.id != null ? String(currentUser.id) : null;
  const currentUserRole = currentUser?.role || null;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const myReadsRef = useRef(myReads);
  myReadsRef.current = myReads;

  // ==========================================================================
  // PERSISTÊNCIA LOCAL (cache)
  // ==========================================================================
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages.slice(-1000))); } catch (e) {}
  }, [messages]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications.slice(0, 200))); } catch (e) {}
  }, [notifications]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(announcements)); } catch (e) {}
  }, [announcements]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.DISMISSED, JSON.stringify(dismissed)); } catch (e) {}
  }, [dismissed]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.DRAFT, draft); } catch (e) {}
  }, [draft]);

  // ==========================================================================
  // MESCLAGEM DE NOTIFICAÇÕES (por id — determinístico)
  // ==========================================================================
  const mergeNotifications = useCallback((incoming) => {
    if (!incoming || !incoming.length) return;
    setNotifications(prev => {
      const byId = new Map(prev.map(n => [String(n.id), n]));
      let changed = false;
      incoming.forEach(n => {
        const existing = byId.get(String(n.id));
        if (!existing) { byId.set(String(n.id), n); changed = true; }
        else if (existing.read !== n.read) { byId.set(String(n.id), { ...existing, read: n.read }); changed = true; }
      });
      if (!changed) return prev;
      const merged = [...byId.values()]
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
        .slice(0, 200);
      return merged;
    });
  }, []);

  // ==========================================================================
  // MESCLAGEM DE MENSAGENS
  // ==========================================================================
  const mergeMessages = useCallback((incoming) => {
    if (!incoming || !incoming.length) return;
    setMessages(prev => {
      const byKey = new Map();
      prev.forEach(m => {
        byKey.set(m.clientId ? 'c_' + m.clientId : 'i_' + m.id, m);
      });
      let changed = false;
      incoming.forEach(m => {
        const k = m.clientId ? 'c_' + m.clientId : 'i_' + m.id;
        const existing = byKey.get(k);
        if (!existing) { byKey.set(k, m); changed = true; }
        else if (m.read !== existing.read || m.pending !== existing.pending) {
          byKey.set(k, { ...existing, read: m.read, pending: m.pending === true });
          changed = true;
        }
      });
      if (!changed) return prev;
      return [...byKey.values()].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });
  }, []);

  // ==========================================================================
  // ARRANQUE — carregar config, notificações, mensagens, receipts, realtime
  // ==========================================================================
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;
    let unsubNotif = null;
    let unsubMsgChannel = null;
    const timers = [];

    /** Consulta SCOPED: só mensagens dirigidas a mim, minhas, ou broadcasts (MSG-002) */
    function myMessagesQuery(limit) {
      return supabase
        .from(TABLES.MESSAGES)
        .select('*')
        .or('to_id.eq.' + currentUserId + ',from_id.eq.' + currentUserId + ',to_id.eq.broadcast')
        .order('created_at', { ascending: false })
        .limit(limit);
    }

    async function loadMyReads() {
      try {
        const { data, error } = await supabase
          .from(TABLES.MESSAGE_READS)
          .select('message_id')
          .eq('user_id', currentUserId)
          .limit(5000);
        if (!error && Array.isArray(data)) {
          if (!cancelled) setMyReads(new Set(data.map(r => String(r.message_id))));
          return true;
        }
      } catch (e) { /* tabela pode não existir (pré-migração) */ }
      return false;
    }

    async function boot() {
      // 0) Config de notificações (partilhada)
      settingsService.load();

      // 1) Notificações do servidor
      const notifs = await notificationService.fetchForUser(currentUserId);
      if (!cancelled) mergeNotifications(notifs);

      // 2) Read receipts do utilizador (por destinatário)
      loadMyReads();

      // 3) Mensagens DO UTILIZADOR (scoped)
      try {
        const { data, error } = await myMessagesQuery(500);
        if (!error && Array.isArray(data)) {
          const serverMsgs = data.map(fromDbRow).reverse();
          if (!cancelled) mergeMessages(serverMsgs);
          setCommsStatus('online');
        } else {
          setCommsStatus('offline');
        }
      } catch (e) {
        setCommsStatus('offline');
      }

      // 4) Anúncios persistentes (servidor + cache)
      try {
        const [anns, reads] = await Promise.all([
          announcementService.load(),
          announcementService.loadReads(currentUserId),
        ]);
        if (!cancelled) {
          setAnnouncements(anns);
          setDismissed(reads);
        }
      } catch (e) { /* fallback local já coberto */ }

      // 5) Flush do outbox (notificações/mensagens pendentes)
      notificationService.flushOutbox().then(n => { if (n > 0) console.log('[Comms] Outbox: ' + n + ' notificações reenviadas'); });
      flushMessageOutbox();

      // 6) Realtime: notificações
      unsubNotif = notificationService.subscribe(currentUserId, (newNotif) => {
        mergeNotifications([newNotif]);
        notifyBrowser(newNotif.text);
      });

      // 7) Realtime: mensagens FILTRADAS — dirigidas a mim + broadcasts
      const msgChannel = supabase
        .channel('fims-messages-' + currentUserId)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: TABLES.MESSAGES,
          filter: 'to_id=eq.' + currentUserId,
        }, (payload) => {
          if (!payload.new) return;
          if (String(payload.new.from_id) === currentUserId) return;
          mergeMessages([fromDbRow(payload.new)]);
          notifyBrowser(payload.new.text);
        })
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: TABLES.MESSAGES,
          filter: 'to_id=eq.broadcast',
        }, (payload) => {
          if (!payload.new) return;
          if (String(payload.new.from_id) === currentUserId) return;
          const row = fromDbRow(payload.new);
          if (row.roleFilter && row.roleFilter !== currentUserRole) return;
          mergeMessages([row]);
          notifyBrowser(payload.new.text);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setCommsStatus('online');
        });
      unsubMsgChannel = () => { try { supabase.removeChannel(msgChannel); } catch (e) {} };

      // 8) Polling de segurança (scoped; nunca busca mensagens de outros)
      timers.push(setInterval(async () => {
        const fresh = await notificationService.fetchForUser(currentUserId, 60);
        if (!cancelled) mergeNotifications(fresh);
        const sent = await notificationService.flushOutbox();
        if (sent > 0) {
          const fresh2 = await notificationService.fetchForUser(currentUserId, 60);
          mergeNotifications(fresh2);
        }
      }, POLL_NOTIFICATIONS_MS));

      timers.push(setInterval(async () => {
        try {
          const { data, error } = await myMessagesQuery(200);
          if (!error && Array.isArray(data)) {
            if (!cancelled) mergeMessages(data.map(fromDbRow).reverse());
          }
        } catch (e) {}
      }, POLL_MESSAGES_MS));

      timers.push(setInterval(() => {
        notificationService.flushOutbox();
        flushMessageOutbox();
      }, FLUSH_OUTBOX_MS));
    }

    function flushMessageOutbox() {
      const list = readMsgOutbox();
      if (!list.length) return;
      const remaining = [];
      (async () => {
        for (const row of list) {
          const res = await rpcWithFallback(
            'fims_send_message',
            {
              p_from_id: row.from_id, p_to_id: row.to_id, p_text: row.text,
              p_sender_name: row.sender_name || null,
              p_role_filter: row.role_filter || null,
              p_client_msg_id: row.client_msg_id || null,
            },
            async () => {
              const { error } = await supabase.from(TABLES.MESSAGES).insert([row]);
              if (error) throw error;
              return null;
            }
          );
          if (res.error) remaining.push(row);
        }
        writeMsgOutbox(remaining);
        if (list.length !== remaining.length) {
          // sucesso parcial/total: recarrega as minhas mensagens (limpa pending)
          try {
            const { data } = await myMessagesQuery(200);
            if (!cancelled && Array.isArray(data)) mergeMessages(data.map(fromDbRow).reverse());
          } catch (e) {}
        }
      })();
    }

    function notifyBrowser(text) {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('FIMS', { body: text, icon: '/favicon.ico' });
        }
      } catch (e) {}
    }

    boot();

    if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }

    return () => {
      cancelled = true;
      timers.forEach(clearInterval);
      if (unsubNotif) unsubNotif();
      if (unsubMsgChannel) unsubMsgChannel();
    };
  }, [currentUserId, currentUserRole, mergeNotifications, mergeMessages]);

  // ==========================================================================
  // NOTIFICAR — via RPC fims_notify (dedupe opcional por dedupeKey)
  // ==========================================================================
  const notify = useCallback(async (userId, text, link = null, dedupeKey = null) => {
    if (userId === undefined || userId === null || userId === '') return null;
    const res = await notificationService.send(userId, text, link, null, null, dedupeKey);
    if (res.notif && String(userId) === currentUserId) {
      mergeNotifications([res.notif]);
    }
    if (!res.ok) {
      console.warn('[Comms] Notificação em outbox (Supabase indisponível):', res.error);
    }
    return res.notif;
  }, [currentUserId, mergeNotifications]);

  // ==========================================================================
  // MENSAGENS — via RPC fims_send_message + outbox + pending flag
  // ==========================================================================
  const persistMessage = useCallback(async (msg) => {
    // cache local imediata (remetente vê na hora)
    setMessages(prev => [...prev, { ...msg, pending: false }]);
    const row = toDbRow(msg);

    const { error } = await rpcWithFallback(
      'fims_send_message',
      {
        p_from_id: row.from_id, p_to_id: row.to_id, p_text: row.text,
        p_sender_name: row.sender_name || null,
        p_role_filter: row.role_filter || null,
        p_client_msg_id: row.client_msg_id || null,
      },
      async () => {
        const { error: e } = await supabase.from(TABLES.MESSAGES).insert([row]);
        if (e) throw e;
        return null;
      }
    );

    if (error) {
      // marca como pendente (sem falso sucesso) e enfileira no outbox
      setMessages(prev => prev.map(m =>
        (m.clientId && m.clientId === msg.clientId) || m.id === msg.id
          ? { ...m, pending: true } : m));
      const outbox = readMsgOutbox();
      if (!outbox.some(r => r.client_msg_id === row.client_msg_id)) {
        outbox.push(row);
        writeMsgOutbox(outbox);
      }
      console.warn('[Comms] Mensagem pendente (outbox):', error.message);
    }
    return { ...msg, pending: !!error };
  }, []);

  const sendMessage = useCallback(async (fromId, toId, text, extra = {}) => {
    const t = (text || '').trim();
    if (!t) return null;
    const fromUser = extra.fromUser || null;
    const msg = {
      id: genId(),
      clientId: genId(),
      fromId: String(fromId),
      toId: String(toId),
      text: t,
      timestamp: new Date().toISOString(),
      read: false,
      senderName: fromUser?.name || null,
      ...extra,
    };
    const saved = await persistMessage(msg);
    // notificação in-app para o destinatário (dedupe por mensagem)
    notify(toId, (fromUser?.name || 'Utilizador') + ': ' + t, 'messages', 'msg:' + msg.clientId);
    return saved;
  }, [persistMessage, notify]);

  /** Mensagem automática do sistema (ex.: fim de inspeção) */
  const sendSystemMessage = useCallback(async (toId, text, sender = null, dedupeKey = null) => {
    if (toId === undefined || toId === null || toId === '') return null;
    const msg = {
      id: genId(),
      clientId: dedupeKey ? ('sys_' + dedupeKey) : genId(),
      fromId: sender ? String(sender.id) : 'system',
      toId: String(toId),
      text,
      timestamp: new Date().toISOString(),
      read: false,
      senderName: sender?.name || 'Sistema FIMS',
      isSystem: true,
    };
    return await persistMessage(msg);
  }, [persistMessage]);

  /**
   * Notifica vários destinatários segundo a configuração de um evento.
   * opts.dedupeKey: chave base de idempotência — cada destinatário recebe
   * 'dedupeKey:uid' (o MESMO evento não duplica notificações/mensagens).
   * opts.excludeId: não notificar o próprio autor (eventos ad-hoc).
   * NOTA: no escalonamento server-side o CEO nunca é excluído (ESC-002).
   */
  const notifyEvent = useCallback(async (event, users, text, link = null, opts = {}) => {
    const channels = opts.channelsOverride || settingsService.channelsFor(event);
    const recipients = settingsService.resolveRecipients(event, users, { excludeId: opts.excludeId, rolesOverride: opts.rolesOverride });
    const baseKey = opts.dedupeKey ? String(opts.dedupeKey) : null;
    const results = [];
    for (const uid of recipients) {
      const key = baseKey ? baseKey + ':' + uid : null;
      if (channels.notification) {
        results.push(await notify(uid, text, link, key));
      }
      if (channels.message) {
        await sendSystemMessage(uid, text, opts.sender, key ? 'ev_' + key : null);
      }
    }
    return { recipients, channels };
  }, [notify, sendSystemMessage]);

  const sendBroadcast = useCallback(async (fromId, text, roleFilter = null, extra = {}) => {
    const t = (text || '').trim();
    if (!t) return null;
    const fromUser = extra.fromUser || null;
    const msg = {
      id: genId(),
      clientId: genId(),
      fromId: String(fromId),
      toId: 'broadcast',
      text: t,
      timestamp: new Date().toISOString(),
      read: false,
      isBroadcast: true,
      roleFilter,
      senderName: fromUser?.name || null,
    };
    await persistMessage(msg);
    // notifica (in-app) todos exceto o autor — destinatários da lista "users"
    const users = extra.users || [];
    if (users.length) {
      const targets = users.filter(u =>
        u.active !== false &&
        String(u.id) !== String(fromId) &&
        (!roleFilter || u.role === roleFilter)
      );
      for (const u of targets) {
        await notify(u.id, '📢 ' + (fromUser?.name || 'Admin') + ': ' + t, 'messages', 'bcast:' + msg.clientId + ':' + u.id);
      }
    }
    return msg;
  }, [persistMessage, notify]);

  const getConversation = useCallback((userId1, userId2) => {
    return messages.filter(m =>
      (m.fromId === String(userId1) && m.toId === String(userId2)) ||
      (m.fromId === String(userId2) && m.toId === String(userId1))
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [messages]);

  const getBroadcastMessages = useCallback(() => {
    return messages.filter(m => m.isBroadcast || m.toId === 'broadcast')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [messages]);

  // ==========================================================================
  // READ STATE — receipts por destinatário (MSG-001) com fallback legado
  // ==========================================================================
  /** A mensagem está lida PARA MIM? receipt próprio OU flag legado (pré-migração) */
  const isReadForMe = useCallback((m) => {
    if (m.pending) return false;
    if (myReadsRef.current.has(String(m.serverId))) return true;
    return m.read === true; // fallback: flag legado (dados antigos)
  }, []);

  const markAsRead = useCallback(async (messageId) => {
    const target = messagesRef.current.find(m => m.id === messageId);
    if (target && String(target.serverId || '').match(/^\d+$/) && currentUserId) {
      const { error } = await rpcWithFallback(
        'fims_mark_message_read',
        { p_message_id: Number(target.serverId), p_user_id: currentUserId },
        async () => {
          const { error: e } = await supabase
            .from(TABLES.MESSAGES)
            .update({ read: true })
            .eq('id', Number(target.serverId));
          if (e) throw e;
          return null;
        }
      );
      if (!error) {
        setMyReads(prev => new Set([...prev, String(target.serverId)]));
      }
    }
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, read: true } : m));
  }, [currentUserId]);

  const markAllAsRead = useCallback(async (userId) => {
    const uid = String(userId);
    if (currentUserId === uid) {
      const { error } = await rpcWithFallback(
        'fims_mark_messages_read',
        { p_user_id: uid },
        async () => {
          // fallback legado: flag partilhada (pré-migração)
          const { error: e } = await supabase.from(TABLES.MESSAGES).update({ read: true })
            .in('to_id', [uid, 'broadcast']).eq('read', false);
          if (e) throw e;
          return null;
        }
      );
      if (!error) {
        // sincroniza receipts locais: marca tudo o que me destina como lido
        setMyReads(prev => {
          const next = new Set(prev);
          messagesRef.current.forEach(m => {
            if ((m.toId === uid || m.toId === 'broadcast') && m.serverId) {
              next.add(String(m.serverId));
            }
          });
          return next;
        });
      }
    }
    setMessages(prev => prev.map(m =>
      ((m.toId === uid || m.toId === 'broadcast') && m.fromId !== uid)
        ? { ...m, read: true } : m
    ));
  }, [currentUserId]);

  const getUnreadCount = useCallback((userId) => {
    const uid = String(userId);
    return messages.filter(m =>
      (m.toId === uid || (m.toId === 'broadcast' && (!m.roleFilter || m.roleFilter === currentUser?.role))) &&
      m.fromId !== uid &&
      !isReadForMe(m)
    ).length;
  }, [messages, currentUser, isReadForMe]);

  const getRecentContacts = useCallback((userId) => {
    const uid = String(userId);
    const contacts = {};
    messages.forEach(m => {
      if (m.fromId === uid || m.toId === uid) {
        const contactId = m.fromId === uid ? m.toId : m.fromId;
        if (contactId && contactId !== 'broadcast') {
          if (!contacts[contactId] || new Date(m.timestamp) > new Date(contacts[contactId].timestamp)) {
            contacts[contactId] = { ...m, contactId };
          }
        }
      }
    });
    return Object.values(contacts).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [messages]);

  // ==========================================================================
  // NOTIFICAÇÕES — marcar como lida (RPC fims_notification_read)
  // ==========================================================================
  const markNotificationRead = useCallback(async (notifId) => {
    setNotifications(prev => prev.map(n => String(n.id) === String(notifId) ? { ...n, read: true } : n));
    if (currentUserId) await notificationService.markAsRead(notifId, currentUserId);
  }, [currentUserId]);

  const markAllNotificationsRead = useCallback(async (userId) => {
    setNotifications(prev => prev.map(n => String(n.userId) === String(userId) ? { ...n, read: true } : n));
    await notificationService.markAllAsRead(userId);
  }, []);

  // ==========================================================================
  // RASCUNHO
  // ==========================================================================
  const clearDraft = () => {
    setDraft('');
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
  };

  // ==========================================================================
  // ANÚNCIOS — persistidos no servidor (fallback local mantido)
  // ==========================================================================
  const createAnnouncement = useCallback((fromId, title, text, targetRole = null, extra = {}) => {
    const fromUser = extra.fromUser || null;
    const announcement = {
      id: genId(),
      fromId,
      fromName: fromUser?.name || null,
      title,
      text,
      timestamp: new Date().toISOString(),
      targetRole,
      dismissedBy: [],
    };
    setAnnouncements(prev => [announcement, ...prev]);
    announcementService.create({
      fromId: fromId != null ? String(fromId) : null,
      fromName: fromUser?.name || null,
      title,
      text,
      targetRole,
    });

    const users = extra.users || [];
    (async () => {
      const targets = users.filter(u =>
        u.active !== false && String(u.id) !== String(fromId) &&
        (!targetRole || u.role === targetRole)
      );
      for (const u of targets) {
        await notify(u.id, '📢 ' + (fromUser?.name || 'Admin') + ': ' + title, 'messages', 'ann:' + announcement.id + ':' + u.id);
      }
    })();
    return announcement;
  }, [notify]);

  const dismissAnnouncement = useCallback((announcementId, userId) => {
    setAnnouncements(prev => prev.map(a => {
      if (a.id !== announcementId) return a;
      const dismissedBy = a.dismissedBy || [];
      if (!dismissedBy.includes(userId)) {
        return { ...a, dismissedBy: [...dismissedBy, userId] };
      }
      return a;
    }));
    setDismissed(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(String(announcementId)) ? arr : [...arr, String(announcementId)];
    });
    announcementService.dismiss(announcementId, userId);
  }, []);

  const getUnseenAnnouncements = useCallback((userId) => {
    const uidStr = String(userId);
    return announcements.filter(a => {
      if ((a.dismissedBy || []).includes(userId)) return false;
      if (dismissed.includes(String(a.id))) return false;
      // anúncio dirigido a outro papel? não mostrar
      if (a.targetRole && currentUser && currentUser.role !== a.targetRole) return false;
      void uidStr;
      return true;
    });
  }, [announcements, dismissed, currentUser]);

  const confirmAnnouncement = useCallback((announcementId, userId, extra = {}) => {
    dismissAnnouncement(announcementId, userId);
    const announcement = announcements.find(a => a.id === announcementId);
    if (!announcement) return;
    const fromUser = extra.fromUser || null;
    const confirmMsg = {
      id: genId(),
      clientId: genId(),
      fromId: String(userId),
      toId: String(announcement.fromId),
      text: '✅ OK Recebido: "' + announcement.title + '"',
      timestamp: new Date().toISOString(),
      read: false,
      isConfirmation: true,
      announcementId,
      senderName: fromUser?.name || null,
    };
    persistMessage(confirmMsg);
    notify(announcement.fromId, (fromUser?.name || 'Utilizador') + ' confirmou recebimento: ' + announcement.title, 'messages', 'annconf:' + announcementId + ':' + userId);
  }, [announcements, dismissAnnouncement, persistMessage, notify]);

  const replyToAnnouncement = useCallback((announcementId, fromId, text, extra = {}) => {
    const announcement = announcements.find(a => a.id === announcementId);
    if (!announcement) return null;
    const fromUser = extra.fromUser || null;
    const replyMsg = {
      id: genId(),
      clientId: genId(),
      fromId: String(fromId),
      toId: String(announcement.fromId),
      text: '📩 Resposta ao anúncio "' + announcement.title + '": ' + text,
      timestamp: new Date().toISOString(),
      read: false,
      isReply: true,
      announcementId,
      senderName: fromUser?.name || null,
    };
    persistMessage(replyMsg);
    notify(announcement.fromId, (fromUser?.name || 'Utilizador') + ' respondeu ao anúncio: ' + announcement.title, 'messages', 'annreply:' + announcementId + ':' + fromId);
    return replyMsg;
  }, [announcements, persistMessage, notify]);

  const broadcastMessage = (fromId, text, extra = {}) => sendBroadcast(fromId, text, null, extra);

  const value = {
    messages,
    notifications,
    announcements,
    dismissed,
    draft,
    setDraft,
    commsStatus,
    sendMessage,
    sendBroadcast,
    sendSystemMessage,
    getConversation,
    getBroadcastMessages,
    getUnreadCount,
    getRecentContacts,
    markAsRead,
    markAllAsRead,
    markNotificationRead,
    markAllNotificationsRead,
    markAllRead: markAllNotificationsRead,
    notify,
    notifyEvent,
    clearDraft,
    createAnnouncement,
    dismissAnnouncement,
    getUnseenAnnouncements,
    confirmAnnouncement,
    replyToAnnouncement,
    broadcastMessage,
    setAnnouncements,
  };

  return (
    <CommsContext.Provider value={value}>
      {children}
    </CommsContext.Provider>
  );
}

export function useComms() {
  const context = useContext(CommsContext);
  if (!context) {
    throw new Error('useComms must be used within a CommsProvider');
  }
  return context;
}

export { CommsContext, NOTIF_EVENTS };
