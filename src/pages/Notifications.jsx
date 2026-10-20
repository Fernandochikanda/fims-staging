// src/pages/Notifications.jsx
import { useState } from "react";
import { Icon } from "../lib/icons";
import { useComms } from "../context/CommsContext";
import { ROLES } from "../data/constants";

const NOTIF_TYPES = {
  inspection: { icon: "clipboard", emoji: "📋", label: "Inspeção", color: "#378ADD" },
  alert: { icon: "alert", emoji: "⚠️", label: "Alerta", color: "#A32D2D" },
  message: { icon: "bell", emoji: "💬", label: "Mensagem", color: "#0F6E56" },
  system: { icon: "settings", emoji: "🔧", label: "Sistema", color: "#6B7280" },
  schedule: { icon: "chart", emoji: "📅", label: "Agenda", color: "#BA7517" },
  review: { icon: "check", emoji: "✅", label: "Revisão", color: "#0F6E56" },
};

function classifyNotification(text) {
  if (!text) return "system";
  const lower = text.toLowerCase();
  if (lower.includes("inspeção") || lower.includes("tarefa") || lower.includes("atribuída") || lower.includes("agendada") || lower.includes("inspection") || lower.includes("task") || lower.includes("assigned")) return "inspection";
  if (lower.includes("crítico") || lower.includes("alerta") || lower.includes("critical") || lower.includes("alert") || lower.includes("capa")) return "alert";
  if (lower.includes("mensagem") || lower.includes("msg") || lower.includes("💬") || lower.includes("📢")) return "message";
  if (lower.includes("agenda") || lower.includes("reagendada") || lower.includes("schedule") || lower.includes("reschedule")) return "schedule";
  if (lower.includes("revisão") || lower.includes("aprovada") || lower.includes("rejeitada") || lower.includes("review") || lower.includes("approved") || lower.includes("rejected")) return "review";
  return "system";
}

function timeAgo(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Agora mesmo";
  if (diffMins < 60) return `Há ${diffMins} min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays < 7) return `Há ${diffDays}d`;
  return then.toLocaleDateString("pt-PT");
}

export default function Notifications({ currentUser, onNavigate, inspections, onStartInspection, onAcceptTask, onDeclineTask }) {
  const { notifications, markNotificationRead, markAllRead } = useComms();
  const [filter, setFilter] = useState("all"); // all, unread, inspection, alert, message, schedule, review
  const [actionNotif, setActionNotif] = useState(null);

  const myNotifs = notifications
    .filter(n => String(n.userId) === String(currentUser?.id))
    .sort((a, b) => new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at));

  const unreadCount = myNotifs.filter(n => !n.read).length;

  // Aplicar filtro
  const filtered = myNotifs.filter(n => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    const type = classifyNotification(n.text);
    return type === filter;
  });

  // Agrupar por data
  const grouped = {};
  filtered.forEach(n => {
    const date = new Date(n.timestamp || n.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let groupKey;
    if (date.toDateString() === today.toDateString()) groupKey = "Hoje";
    else if (date.toDateString() === yesterday.toDateString()) groupKey = "Ontem";
    else groupKey = date.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });

    if (!grouped[groupKey]) grouped[groupKey] = [];
    grouped[groupKey].push(n);
  });

  // Clicar na notificação
  const handleNotifClick = (notif) => {
    markNotificationRead(notif.id);

    const type = classifyNotification(notif.text);
    // Se é notificação de inspeção com aceitar/recusar
    if (type === "inspection" && !notif.read) {
      const keyword = ['tarefa', 'inspeção', 'agendada', 'atribuída', 'inspection', 'task', 'assigned'];
      const isInspection = keyword.some(kw => (notif.text || '').toLowerCase().includes(kw));
      if (isInspection && inspections) {
        const locationMatch = notif.text?.match(/(?:para|em|at)\s+(.+?)(?:\.|,|$)/i);
        const locationName = locationMatch ? locationMatch[1].trim() : null;
        let insp = null;
        if (locationName) {
          insp = inspections.find(i =>
            i.status === 'pending_acceptance' &&
            String(i.inspector_id) === String(currentUser.id) &&
            i.location_name?.toLowerCase().includes(locationName.toLowerCase())
          );
        }
        if (!insp) {
          insp = inspections.find(i =>
            i.status === 'pending_acceptance' &&
            String(i.inspector_id) === String(currentUser.id)
          );
        }
        if (insp) {
          setActionNotif({ notif, inspection: insp });
          return;
        }
      }
    }

    // Navegar para o link
    if (notif.link) {
      onNavigate(notif.link);
    }
  };

  // Aceitar inspeção
  const handleAccept = () => {
    if (!actionNotif?.inspection) return;
    const insp = { ...actionNotif.inspection, accepted: true, status: "pending" };
    if (onAcceptTask) onAcceptTask(insp);
    if (onStartInspection) setTimeout(() => onStartInspection(insp), 100);
    setActionNotif(null);
  };

  // Recusar inspeção
  const handleDecline = () => {
    if (!actionNotif?.inspection) return;
    const reason = prompt('Motivo da recusa:');
    if (reason === null) return;
    const insp = { ...actionNotif.inspection, accepted: false, status: "rejected", decline_reason: reason };
    if (onDeclineTask) onDeclineTask(insp);
    setActionNotif(null);
  };

  const filterTabs = [
    { id: "all", label: "Todas" },
    { id: "unread", label: `Não lidas (${unreadCount})` },
    { id: "inspection", label: "📋 Inspeções" },
    { id: "alert", label: "⚠️ Alertas" },
    { id: "message", label: "💬 Mensagens" },
    { id: "schedule", label: "📅 Agenda" },
    { id: "review", label: "✅ Revisões" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Notificações</div>
          <div className="page-sub">{unreadCount > 0 ? `${unreadCount} não lidas` : 'Todas as notificações lidas'}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {unreadCount > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => markAllRead(currentUser.id)}>
              <Icon name="check" size={13} /> Marcar todas como lidas
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {filterTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: filter === tab.id ? 600 : 400,
              border: `1px solid ${filter === tab.id ? '#378ADD' : '#ddd'}`,
              background: filter === tab.id ? '#378ADD' : '#fff',
              color: filter === tab.id ? '#fff' : '#555',
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lista de notificações agrupadas */}
      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "#888" }}>
          <Icon name="bell" size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>Sem notificações{filter !== "all" ? " neste filtro" : ""}.</div>
        </div>
      )}

      {Object.entries(grouped).map(([groupKey, notifs]) => (
        <div key={groupKey} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {groupKey}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {notifs.map((n, idx) => {
              const type = classifyNotification(n.text);
              const typeInfo = NOTIF_TYPES[type] || NOTIF_TYPES.system;
              return (
                <div
                  key={n.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: idx < notifs.length - 1 ? "1px solid #f0f0f0" : "none",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    cursor: "pointer",
                    background: n.read ? "transparent" : "#F0F7FF",
                    transition: "background 0.15s",
                    position: "relative"
                  }}
                  onClick={() => handleNotifClick(n)}
                  onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? "transparent" : "#F0F7FF"}
                >
                  {/* Indicador não lida */}
                  {!n.read && (
                    <div style={{
                      position: "absolute",
                      left: 4,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#378ADD"
                    }} />
                  )}

                  {/* Ícone do tipo */}
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: `${typeInfo.color}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0
                  }}>
                    {typeInfo.emoji}
                  </div>

                  {/* Conteúdo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: n.read ? 400 : 500,
                      color: "#333",
                      lineHeight: 1.4,
                      wordBreak: "break-word"
                    }}>
                      {n.text}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: "#aaa" }}>
                        {timeAgo(n.timestamp || n.created_at)}
                      </span>
                      <span style={{
                        fontSize: 9,
                        padding: "1px 6px",
                        borderRadius: 8,
                        background: `${typeInfo.color}20`,
                        color: typeInfo.color,
                        fontWeight: 600
                      }}>
                        {typeInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Acção rápida para inspeções pendentes */}
                  {type === "inspection" && !n.read && (
                    <div style={{ flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: "#378ADD", fontWeight: 600, whiteSpace: "nowrap" }}>
                        Ver ›
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Modal de Aceitar/Recusar Inspeção */}
      {actionNotif && (
        <div className="modal-overlay" onClick={() => setActionNotif(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div style={{ fontSize: 15, fontWeight: 500 }}>📋 Nova Inspeção Atribuída</div>
              <button className="icon-btn" onClick={() => setActionNotif(null)}><Icon name="x" size={14} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: "#F8F7F4", padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{actionNotif.inspection.location_name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: "#555" }}>
                  <div><span style={{ color: "#888" }}>Data:</span> {actionNotif.inspection.date}</div>
                  <div><span style={{ color: "#888" }}>Hora:</span> {actionNotif.inspection.start_time || "A definir"}</div>
                  <div><span style={{ color: "#888" }}>Tipo:</span> Inspeção</div>
                  <div><span style={{ color: "#888" }}>Status:</span> <span style={{ color: "#EF9F27" }}>Por aceitar</span></div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
                Deseja aceitar esta inspeção? Se aceitar, a inspeção será iniciada imediatamente.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={handleDecline}
                style={{ color: "#A32D2D", borderColor: "#A32D2D" }}
              >
                <Icon name="x" size={13} /> Recusar
              </button>
              <button className="btn btn-primary" onClick={handleAccept}>
                <Icon name="check" size={13} /> Aceitar e Iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
