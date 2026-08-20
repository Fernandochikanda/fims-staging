import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import { useLang } from "../context/LangContext";

export default function Sidebar({ currentUser, activePage, onNavigate, alertCount, isOpen, onClose }) {
  const role = currentUser.role;
  const { t } = useLang();

  const navItems = [
    { id: "dashboard", icon: "dashboard", label: t.dashboard, roles: [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR, ROLES.INSPECTOR] },
    { id: "inspections", icon: "clipboard", label: t.inspections, roles: [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR, ROLES.INSPECTOR] },
    { id: "schedule", icon: "chart", label: "Agenda", roles: [ROLES.ADMIN, ROLES.SUPERVISOR] },
    { id: "report_center", icon: "file", label: "Relatórios", roles: [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR] },
    { id: "messages", icon: "bell", label: "Mensagens", roles: [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR, ROLES.INSPECTOR] },
    { id: "field_map", icon: "location", label: "Mapa de Campo", roles: [ROLES.ADMIN, ROLES.SUPERVISOR] },
    { id: "team", icon: "users", label: "Equipa (KPIs)", roles: [ROLES.ADMIN, ROLES.SUPERVISOR] },
    { id: "alerts", icon: "alert", label: t.alerts, badge: alertCount || null, roles: [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR] },
    { id: "users", icon: "users", label: t.users, roles: [ROLES.ADMIN] },
    { id: "locations", icon: "location", label: t.locations, roles: [ROLES.ADMIN, ROLES.SUPERVISOR] },
    { id: "templates", icon: "template", label: t.templates, roles: [ROLES.ADMIN] },
    { id: "audit", icon: "audit", label: t.audit, roles: [ROLES.ADMIN] },
    { id: "settings", icon: "settings", label: t.settings, roles: [ROLES.ADMIN] },
  ].filter(item => item.roles.includes(role));

  const roleLabels = { admin: "Administrador", ceo: "CEO", supervisor: "Supervisor", inspector: "Inspetor" };

  return (
    <>
      <div className={`sidebar-backdrop ${isOpen ? 'show' : ''}`} onClick={onClose}></div>
      <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "#378ADD", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="clipboard" size={15} style={{ color: "#fff" }} />
            </div>
            <div><div className="logo-text">FIMS</div><div className="logo-sub">Field Inspection</div></div>
          </div>
        </div>
        <div className="sidebar-nav scrollbar-thin">
          <div className="nav-section">
            {navItems.map(item => (
              <div key={item.id} className={`nav-item ${activePage === item.id ? "active" : ""}`} onClick={() => { onNavigate(item.id); onClose(); }}>
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
                {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="sidebar-user">
          <div className="user-avatar-sm">{currentUser.avatar}</div>
          <div><div className="user-name-sm">{currentUser.name}</div><div className="user-role-sm">{roleLabels[role]}</div></div>
        </div>
      </nav>
    </>
  );
}
