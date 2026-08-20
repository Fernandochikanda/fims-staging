// /src/components/Topbar.jsx
import { useState, useEffect } from "react";
import { Icon } from "../lib/icons";
import { useComms } from "../context/CommsContext";

export default function Topbar({ title, onMenuClick, onLogout, currentUser, onNavigate }) {
  const { notifications, markAllRead } = useComms();
  const [showNotif, setShowNotif] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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
  
  const myNotifs = notifications.filter(n => n.userId === currentUser.id && !n.read);
  const allMyNotifs = notifications.filter(n => n.userId === currentUser.id).slice(0, 10);

  const handleLogoutClick = () => {
    if (window.confirm('Tem certeza que deseja sair?')) {
      onLogout();
    }
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
          <button className="icon-btn notif-dot" onClick={() => { setShowNotif(!showNotif); if (!showNotif) markAllRead(currentUser.id); }}>
            <Icon name="bell" size={15} />
          </button>
          {showNotif && (
            <div style={{ position: "absolute", top: 40, right: 0, width: 300, background: "#fff", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 1000, maxHeight: 400, overflowY: "auto" }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #eee", fontWeight: 600, fontSize: 13 }}>Notificações</div>
              {allMyNotifs.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "#888", fontSize: 12 }}>Sem novidades.</div>}
              {allMyNotifs.map(n => (
                <div key={n.id} style={{ padding: "10px 12px", borderBottom: "1px solid #eee", fontSize: 12, cursor: "pointer", background: n.read ? "transparent" : "#E6F1FB" }} 
                  onClick={() => { if(n.link) onNavigate(n.link); setShowNotif(false); }}>
                  {n.text}
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>{new Date(n.timestamp).toLocaleString("pt-PT")}</div>
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
    </div>
  );
}
