// src/context/CommsContext.jsx
// ============================================================================
// FIMS — Centro de comunicação (notificações + mensagens).
//
// CORREÇÕES principais (versão anterior):
//  1. Mensagens eram 100% localStorage → o destinatário nunca recebia.
//     Agora: persistidas no Supabase (fims_messages) + Realtime + polling.
//  2. notify() adicionava a notificação ao REMETENTE (poluição) e duplicava ids.
//     Agora: grava apenas no Supabase com id determinístico; o destinatário
//     recebe via Realtime/polling. Falhas ficam em outbox com retry.
//  3. Sem polling de segurança → notificações perdidas se o Realtime caísse.
//     Agora: polling periódico + flush do outbox.
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { genId } from '../lib/helpers';
import { supabase } from '../lib/supabase';
import { notificationService } from '../services/notificationService';
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
//         (+ read, sender_name, role_filter, client_msg_id — criados no SQL fix)
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
    clientId: row.client_msg_id || null,
    fromId: String(row.from_id),
    toId: String(row.to_id),
    text: row.text,
    timestamp: row.created_at,
    read: row.read === true,
    isBroadcast: String(row.to_id) === 'broadcast',
    roleFilter: row.role_filter || null,
    senderName: row.sender_name || null,
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

  const [draft, setDraft] = useState(() => localStorage.getItem(STORAGE_KEYS.DRAFT) || '');
  const [commsStatus, setCommsStatus] = useState('connecting'); // connecting | online | offline

  const currentUserId = currentUser?.id != null ? String(currentUser.id) : null;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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
        else if (m.read !== existing.read) { byKey.set(k, { ...existing, read: m.read }); changed = true; }
      });
      if (!changed) return prev;
      return [...byKey.values()].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });
  }, []);

  // ==========================================================================
  // ARRANQUE — carregar config, notificações, mensagens, realtime, polling
  // ==========================================================================
  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;
    let unsubNotif = null;
    let unsubMsgChannel = null;
    const timers = [];

    async function boot() {
      // 0) Config de notificações (partilhada)
      settingsService.load();

      // 1) Notificações do servidor
      const notifs = await notificationService.fetchForUser(currentUserId);
      if (!cancelled) mergeNotifications(notifs);

      // 2) Mensagens do servidor
      try {
        const { data, error } = await supabase
          .from('fims_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
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

      // 3) Flush do outbox (notificações/mensagens pendentes)
      notificationService.flushOutbox().then(n => { if (n > 0) console.log('[Comms] Outbox: ' + n + ' notificações reenviadas'); });
      flushMessageOutbox();

      // 4) Realtime: notificações
      unsubNotif = notificationService.subscribe(currentUserId, (newNotif) => {
        mergeNotifications([newNotif]);
        notifyBrowser(newNotif.text);
      });

      // 5) Realtime: mensagens dirigidas a mim + broadcasts
      const msgChannel = supabase
        .channel('fims-messages-' + currentUserId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fims_messages' }, (payload) => {
          if (!payload.new) return;
          const row = payload.new;
          const isForMe = String(row.to_id) === currentUserId || String(row.to_id) === 'broadcast';
          if (!isForMe) return;
          if (String(row.from_id) === currentUserId) return;
          mergeMessages([fromDbRow(row)]);
          notifyBrowser(row.text);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setCommsStatus('online');
        });
      unsubMsgChannel = () => { try { supabase.removeChannel(msgChannel); } catch (e) {} };

      // 6) Polling de segurança
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
          const { data, error } = await supabase
            .from('fims_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
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
          try {
            const { error } = await supabase.from('fims_messages').insert([row]);
            if (error) remaining.push(row);
          } catch (e) { remaining.push(row); }
        }
        writeMsgOutbox(remaining);
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
  }, [currentUserId, mergeNotifications, mergeMessages]);

  // ==========================================================================
  // NOTIFICAR — grava no Supabase para o DESTINATÁRIO (não polui o remetente)
  // ==========================================================================
  const notify = useCallback(async (userId, text, link = null) => {
    if (userId === undefined || userId === null || userId === '') return null;
    const res = await notificationService.send(userId, text, link);
    // Se eu próprio for o destinatário (ex.: testes), reflete imediatamente
    if (res.notif && String(userId) === currentUserId) {
      mergeNotifications([res.notif]);
    }
    if (!res.ok) {
      console.warn('[Comms] Notificação em outbox (Supabase indisponível):', res.error);
    }
    return res.notif;
  }, [currentUserId, mergeNotifications]);

  /**
   * Notifica vários destinatários segundo a configuração de um evento.
   * (implementado mais abaixo, após sendSystemMessage)
   */

  // ==========================================================================
  // MENSAGENS — persistidas no Supabase + cache local + outbox
  // ==========================================================================
  const persistMessage = useCallback(async (msg) => {
    // cache local imediata (remetente vê na hora)
    setMessages(prev => [...prev, msg]);
    const row = toDbRow(msg);
    try {
      const { data, error } = await supabase.from('fims_messages').insert([row]).select().single();
      if (error) {
        // tenta versão mínima (caso as colunas extra ainda não existam — SQL fix pendente)
        const minimal = {
          from_id: row.from_id, to_id: row.to_id, text: row.text, created_at: row.created_at,
        };
        const { error: err2 } = await supabase.from('fims_messages').insert([minimal]);
        if (err2) {
          const outbox = readMsgOutbox();
          outbox.push(row);
          writeMsgOutbox(outbox);
          console.warn('[Comms] Mensagem em outbox:', err2.message);
        }
      }
    } catch (e) {
      const outbox = readMsgOutbox();
      outbox.push(row);
      writeMsgOutbox(outbox);
      console.warn('[Comms] Mensagem em outbox (exceção):', e.message);
    }
    return msg;
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
    await persistMessage(msg);
    // notificação in-app para o destinatário
    notify(toId, (fromUser?.name || 'Utilizador') + ': ' + t, 'messages');
    return msg;
  }, [persistMessage, notify]);

  /** Mensagem automática do sistema (ex.: fim de inspeção, escalação de defeitos) */
  const sendSystemMessage = useCallback(async (toId, text, sender = null) => {
    if (toId === undefined || toId === null || toId === '') return null;
    const msg = {
      id: genId(),
      clientId: genId(),
      fromId: sender ? String(sender.id) : 'system',
      toId: String(toId),
      text,
      timestamp: new Date().toISOString(),
      read: false,
      senderName: sender?.name || 'Sistema FIMS',
      isSystem: true,
    };
    await persistMessage(msg);
    return msg;
  }, [persistMessage]);

  /**
   * Notifica vários destinatários segundo a configuração de um evento.
   * users: lista real de utilizadores (Supabase fims_users)
   * opts.excludeId: não notificar o próprio autor
   * opts.rolesOverride: substitui os papéis configurados
   * opts.channelsOverride: { notification, message } — substitui canais configurados
   */
  const notifyEvent = useCallback(async (event, users, text, link = null, opts = {}) => {
    const channels = opts.channelsOverride || settingsService.channelsFor(event);
    const recipients = settingsService.resolveRecipients(event, users, { excludeId: opts.excludeId, rolesOverride: opts.rolesOverride });
    const results = [];
    for (const uid of recipients) {
      if (channels.notification) {
        results.push(await notify(uid, text, link));
      }
      if (channels.message) {
        await sendSystemMessage(uid, text, opts.sender);
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
    // notifica (in-app) todos exceto o autor — os destinatários reais vêm da lista "users"
    const users = extra.users || [];
    if (users.length) {
      const targets = users.filter(u =>
        u.active !== false &&
        String(u.id) !== String(fromId) &&
        (!roleFilter || u.role === roleFilter)
      );
      for (const u of targets) {
        await notify(u.id, '📢 ' + (fromUser?.name || 'Admin') + ': ' + t, 'messages');
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

  const markAsRead = useCallback(async (messageId) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      // sincronizar leitura no servidor quando a msg tem id real
      if (String(m.id).startsWith('srv_')) {
        supabase.from('fims_messages').update({ read: true }).eq('id', String(m.id).slice(4))
          .then(() => {}, () => {});
      }
      return { ...m, read: true };
    }));
  }, []);

  const markAllAsRead = useCallback(async (userId) => {
    const uid = String(userId);
    setMessages(prev => prev.map(m =>
      ((m.toId === uid || m.toId === 'broadcast') && !m.read && m.fromId !== uid)
        ? { ...m, read: true } : m
    ));
    // melhor esforço no servidor
    try {
      await supabase.from('fims_messages').update({ read: true })
        .in('to_id', [uid, 'broadcast']).eq('read', false);
    } catch (e) {}
  }, []);

  const getUnreadCount = useCallback((userId) => {
    const uid = String(userId);
    return messages.filter(m =>
      (m.toId === uid || (m.toId === 'broadcast' && (!m.roleFilter || m.roleFilter === currentUser?.role))) &&
      !m.read && m.fromId !== uid
    ).length;
  }, [messages, currentUser]);

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
  // NOTIFICAÇÕES — marcar como lida
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
  // ANÚNCIOS (mantidos; notificações agora vão ao Supabase)
  // ==========================================================================
  const createAnnouncement = useCallback((fromId, title, text, targetRole = null, extra = {}) => {
    const announcement = {
      id: genId(),
      fromId,
      title,
      text,
      timestamp: new Date().toISOString(),
      targetRole,
      dismissedBy: [],
    };
    setAnnouncements(prev => [announcement, ...prev]);
    const fromUser = extra.fromUser || null;
    const users = extra.users || [];
    (async () => {
      const targets = users.filter(u =>
        u.active !== false && String(u.id) !== String(fromId) &&
        (!targetRole || u.role === targetRole)
      );
      for (const u of targets) {
        await notify(u.id, '📢 ' + (fromUser?.name || 'Admin') + ': ' + title, 'messages');
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
  }, []);

  const getUnseenAnnouncements = useCallback((userId) => {
    return announcements.filter(a => !(a.dismissedBy || []).includes(userId));
  }, [announcements]);

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
    notify(announcement.fromId, (fromUser?.name || 'Utilizador') + ' confirmou recebimento: ' + announcement.title, 'messages');
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
    notify(announcement.fromId, (fromUser?.name || 'Utilizador') + ' respondeu ao anúncio: ' + announcement.title, 'messages');
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
