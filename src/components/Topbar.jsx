// src/components/Topbar.jsx
import { useState, useEffect } from "react";
import { Icon } from "../lib/icons";
import { useComms } from "../context/CommsContext";

export default function Topbar({ title, onMenuClick, onLogout, currentUser, onNavigate, inspections, onStartInspection, onAcceptTask, onDeclineTask, onViewInspection }) {
  const { notifications, markAllRead, markNotificationRead } = useComms();
  const [showNotif, setShowNotif] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [actionNotif, setActionNotif] = useState(null); // Notificação para aceitar/recusar

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const myNotifs = notifications.filter(n => String(n.userId) === String(currentUser.id) && !n.read);
  const allMyNotifs = notifications.filter(n => String(n.userId) === String(currentUser.id)).slice(0, 15);

  const handleLogoutClick = () => {
    if (window.confirm('Tem certeza que deseja sair?')) {
      onLogout();
    }
  };

  // Verificar se é notificação de inspeção
  const isInspectionNotif = (text) => {
    if (!text) return false;
    const keywords = ['tarefa', 'inspeção', 'agendada', 'atribuída', 'inspection', 'task', 'assigned'];
    return keywords.some(kw => text.toLowerCase().includes(kw));
  };

  // Encontrar inspeção associada à notificação — by ID from the link field.
  // The link format is "inspections:INSPECTION_ID" (set by App.jsx notifyEvent calls).
  // Falls back to regex only if the link doesn't contain an ID (legacy notifications).
  const findInspectionFromNotif = (notif) => {
    if (!inspections) return null;

    // Primary: parse inspectionId from the link ("inspections:insp_123")
    if (notif.link && notif.link.includes(":")) {
      const inspId = notif.link.split(":")[1];
      if (inspId) {
        const found = inspections.find(i => String(i.id) === String(inspId));
        if (found) return found;
      }
    }

    // Legacy fallback: regex on notification text (for old notifications without ID in link)
    const locationMatch = notif.text?.match(/no local\s+(.+?)(?:\.|,|$)/i);
    const locationName = locationMatch ? locationMatch[1].trim() : null;
    if (locationName) {
      const insp = inspections.find(i =>
        String(i.inspector_id) === String(currentUser.id) &&
        i.location_name?.toLowerCase().includes(locationName.toLowerCase())
      );
      if (insp) return insp;
    }

    // Last resort: if it's a pending_acceptance task, return the first match
    return inspections.find(i =>
      i.status === 'pending_acceptance' &&
      String(i.inspector_id) === String(currentUser.id)
    );
  };

  // Clicar na notificação
  const handleNotifClick = (notif) => {
    // Marcar como lida
    markNotificationRead(notif.id);

    // Se é notificação de inspeção, mostrar diálogo ou abrir inspeção
    if (isInspectionNotif(notif.text) || (notif.link && notif.link.startsWith("inspections:"))) {
      const insp = findInspectionFromNotif(notif);
      if (insp) {
        // If it's a pending task → show accept/decline dialog
        if (insp.status === 'pending_acceptance') {
          setActionNotif({ notif, inspection: insp });
          setShowNotif(false);
          return;
        }
        // If it's returned for corrections → open the inspection for editing
        if (insp.status === 'needs_corrections' && onStartInspection) {
          onStartInspection(insp);
          setShowNotif(false);
          return;
        }
        // Otherwise → view the inspection
        if (onViewInspection) {
          onViewInspection(insp);
          setShowNotif(false);
          return;
        }
      }
    }

    // Para outras notificações, navegar para o link (strip the ID part if present)
    if (notif.link) {
      const page = notif.link.split(":")[0];
      onNavigate(page);
    }
    setShowNotif(false);
  };

  // Aceitar inspeção
  const handleAccept = () => {
    if (!actionNotif?.inspection) return;
    
    const insp = {
      ...actionNotif.inspection,
      accepted: true,
      status: "pending"
    };
    
    if (onAcceptTask) onAcceptTask(insp);
    
    // Iniciar a inspeção imediatamente
    if (onStartInspection) {
      setTimeout(() => onStartInspection(insp), 100);
    }
    
    setActionNotif(null);
  };

  // Recusar inspeção
  const handleDecline = () => {
    if (!actionNotif?.inspection) return;
    
    const reason = prompt('Motivo da recusa:');
    if (reason === null) return; // Usuário cancelou
    
    const insp = {
      ...actionNotif.inspection,
      accepted: false,
      status: "rejected",
      decline_reason: reason
    };
    
    if (onDeclineTask) onDeclineTask(insp);
    
    setActionNotif(null);
  };

  return (
    <div className="topbar">
      <button className="mobile-menu-btn" onClick={onMenuClick}>
        <Icon name="menu" size={18} />
      </button>
      <div className="topbar-title">{title}</div>
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        <div title={isOnline ? "Online" : "Offline Mode Active"} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: isOnline ? "#0F6E56" : "#EF9F27", marginRight: 8 }}>
          <Icon name={isOnline ? "cloud" : "cloudOff"} size={14} /> {isOnline ? "Online" : "Offline"}
        </div>
        <div style={{ position: "relative" }}>
          <button className="icon-btn notif-dot" onClick={() => setShowNotif(!showNotif)}>
            <Icon name="bell" size={15} />
            {myNotifs.length > 0 && (
              <span style={{ position: "absolute", top: -2, right: -2, background: "#A32D2D", color: "#fff", fontSize: 9, width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>
                {myNotifs.length > 9 ? '9+' : myNotifs.length}
              </span>
            )}
          </button>
          
          {showNotif && (
            <div style={{ position: "absolute", top: 40, right: 0, width: 320, background: "#fff", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 1000, maxHeight: 400, overflowY: "auto" }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee", fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Notificações</span>
                {myNotifs.length > 0 && (
                  <button onClick={(e) => { e.stopPropagation(); markAllRead(currentUser.id); }} style={{ fontSize: 11, color: "#378ADD", background: "none", border: "none", cursor: "pointer" }}>
                    Marcar todas como lidas
                  </button>
                )}
              </div>
              {allMyNotifs.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#888", fontSize: 12 }}>Sem novidades.</div>}
              {allMyNotifs.map(n => (
                <div key={n.id} 
                  style={{ 
                    padding: "10px 12px", 
                    borderBottom: "1px solid #eee", 
                    fontSize: 12, 
                    cursor: "pointer", 
                    background: n.read ? "transparent" : "#E6F1FB",
                    transition: "background 0.2s"
                  }} 
                  onClick={() => handleNotifClick(n)}
                  onMouseEnter={e => e.currentTarget.style.background = "#f0f0f0"}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? "transparent" : "#E6F1FB"}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    {isInspectionNotif(n.text) ? (
                      <span style={{ fontSize: 14 }}>📋</span>
                    ) : (
                      <span style={{ fontSize: 14 }}>💬</span>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#333" }}>{n.text}</div>
                      <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>{new Date(n.timestamp || n.created_at).toLocaleString("pt-PT")}</div>
                    </div>
                    {isInspectionNotif(n.text) && !n.read && (
                      <span style={{ fontSize: 10, color: "#0F6E56", whiteSpace: "nowrap" }}>Aceitar ›</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={handleLogoutClick} title="Logout">
          <Icon name="logout" size={15} />
        </button>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#1E2A3A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff" }}>
          {currentUser.avatar || currentUser.name?.substring(0, 2).toUpperCase() || 'US'}
        </div>
      </div>

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
              <button 
                className="btn btn-primary" 
                onClick={handleAccept}
              >
                <Icon name="check" size={13} /> Aceitar e Iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
