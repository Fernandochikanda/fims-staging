// /src/App.jsx
import { useState, useEffect } from "react";
import { Icon } from "./lib/icons";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Login from "./pages/Login";
import { CEODashboard, SupervisorDashboard, InspectorDashboard } from "./pages/Dashboards";
import InspectionForm from "./pages/InspectionForm";
import InspectionsList from "./pages/InspectionsList";
import InspectionDetail from "./pages/InspectionDetail";
import MonthlyReport from "./pages/MonthlyReport";
import ReportCenter from "./pages/ReportCenter";
import Alerts from "./pages/Alerts";
import Schedule from "./pages/Schedule";
import LiveMap from "./pages/LiveMap";
import Team from "./pages/Team";
import Messages from "./pages/Messages";
import ScheduleModal from "./components/ScheduleModal";
import RescheduleModal from "./components/RescheduleModal";
import BulkScheduleModal from "./components/BulkScheduleModal";
import { UsersPage, LocationsPage, ReportsPage, TemplatesPage, AuditPage, SettingsPage } from "./pages/Management";
import { SEED_USERS, SEED_LOCATIONS, ROLES } from "./data/constants";
import { genSeedInspections, genId } from "./lib/helpers";
import { exportToICS } from "./lib/icsExporter";
import { LangProvider } from "./context/LangContext";
import { CommsProvider, useComms } from "./context/CommsContext";
import { getClientTemplate } from "./utils/excelTemplateImporter";
import { authService } from "./services/authService";
import { dataStore } from "./lib/dataStore";
import { supabase } from "./lib/supabase";

const STORAGE_KEYS = {
  CURRENT_USER: "fims_current_user",
  CURRENT_PAGE: "fims_current_page",
  EDITING_INSPECTION: "fims_editing_inspection",
  VIEWING_INSPECTION: "fims_viewing_inspection",
  INSPECTIONS: "fims_inspections",
  USERS: "fims_users",
  LOCATIONS: "fims_locations",
  LOGS: "fims_logs",
  MESSAGES_DRAFT: "fims_messages_draft",
};

function NewInspectionModal({ locations, users, currentUser, onClose, onCreate }) {
  const [locId, setLocId] = useState("");
  const [inspectorId, setInspectorId] = useState(currentUser.role === ROLES.INSPECTOR ? currentUser.id : "");
  const [selectedClient, setSelectedClient] = useState(null);

  const handleLocationChange = (e) => {
    const id = e.target.value;
    setLocId(id);
    if (id) {
      const loc = locations.find(l => l.id === Number(id));
      setSelectedClient(loc);
    } else {
      setSelectedClient(null);
    }
  };

  const handleCreate = () => {
    if (!locId) return;
    const loc = locations.find(l => l.id === Number(locId));
    if (!loc) return;
    
    const inspector = users.find(u => u.id === Number(inspectorId)) || null;
    const template = getClientTemplate(loc.name);
    const templateSections = template.sections || [];
    
    const items = templateSections.flatMap(s =>
      (s.items || []).map(item => ({
        ...item,
        section_id: s.id,
        score: null,
        comment: "",
        photos: []
      }))
    );
    
    const sections = templateSections.map(s => ({
      id: s.id,
      title: s.title || s.name,
      observation: "",
      photos: []
    }));
    
    const insp = {
      id: genId(),
      location_id: loc.id,
      location_name: loc.name,
      inspector_id: inspector ? inspector.id : null,
      inspector_name: inspector ? inspector.name : null,
      supervisor_id: 3,
      supervisor_name: "Ana Sitoe",
      status: inspector ? "pending_acceptance" : "unassigned",
      accepted: null,
      score_pct: null,
      date: new Date().toISOString().split("T")[0],
      items: items,
      sections: sections,
      notes: "",
      alert_level: "ok",
      type: "inspection",
      priority: "normal",
      template_id: template.clientId || "DEFAULT",
      template_version: template.version || "1.0"
    };
    onCreate(insp);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontSize: 15, fontWeight: 500 }}>Nova Inspeção (Dispatch)</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Localização (Cliente) *</label>
            <select className="form-select" value={locId} onChange={handleLocationChange}>
              <option value="">Selecionar localização...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {selectedClient && (
            <div style={{ background: '#F3F4F6', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>📋 Template:</span>
                <span style={{ fontWeight: 500 }}>{getClientTemplate(selectedClient.name).clientName || 'Padrão'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                <span>{getClientTemplate(selectedClient.name).sections?.length || 0} secções</span>
                <span>{getClientTemplate(selectedClient.name).totalItems || 0} itens</span>
              </div>
            </div>
          )}
          {currentUser.role !== ROLES.INSPECTOR && (
            <div className="form-group">
              <label className="form-label">Inspetor</label>
              <select className="form-select" value={inspectorId} onChange={e => setInspectorId(e.target.value)}>
                <option value="">Unassigned</option>
                {users.filter(u => u.role === ROLES.INSPECTOR).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!locId}>Criar Tarefa</button>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { notify } = useComms();
  
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [inspections, setInspections] = useState([]);
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [viewingInspection, setViewingInspection] = useState(null);
  const [editingInspection, setEditingInspection] = useState(null);
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [reschedulingTask, setReschedulingTask] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Helper to push single inspection to Supabase
  const syncInspectionToSupabase = async (insp) => {
    try {
      await supabase.from('fims_inspections').upsert(insp);
    } catch (err) {
      console.error("Supabase sync error:", err);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const dbUsers = await authService.getAllUsers();
        console.log("USERS FROM SUPABASE:", dbUsers);
        setUsers(dbUsers.length > 0 ? dbUsers : SEED_USERS);

        const { data: supabaseInspections, error } = await supabase.from('fims_inspections').select('*');
        if (!error && supabaseInspections) {
          setInspections(supabaseInspections);
          await dataStore.set(STORAGE_KEYS.INSPECTIONS, supabaseInspections);
        } else {
          const savedInspections = await dataStore.get(STORAGE_KEYS.INSPECTIONS);
          setInspections(savedInspections || genSeedInspections());
        }

        const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        const savedPage = localStorage.getItem(STORAGE_KEYS.CURRENT_PAGE);
        if (savedUser) {
          try {
            const user = JSON.parse(savedUser);
            setCurrentUser(user);
            if (savedPage && savedPage !== "login") setPage(savedPage);
          } catch (e) { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); }
        }
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setIsInitialized(true);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    dataStore.set(STORAGE_KEYS.INSPECTIONS, inspections);
  }, [inspections, isInitialized]);

  useEffect(() => { if (currentUser && page) localStorage.setItem(STORAGE_KEYS.CURRENT_PAGE, page); }, [page, currentUser]);
  useEffect(() => {
    if (editingInspection) localStorage.setItem(STORAGE_KEYS.EDITING_INSPECTION, JSON.stringify(editingInspection));
    else localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
  }, [editingInspection]);
  useEffect(() => {
    if (viewingInspection) localStorage.setItem(STORAGE_KEYS.VIEWING_INSPECTION, JSON.stringify(viewingInspection));
    else localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
  }, [viewingInspection]);

  const alertCount = inspections.filter(i => i.alert_level === "critical" && i.score_pct !== null && !i.resolved).length;
  const addAuditLog = (user, action, type, detail) => setAuditLogs(prev => [{ id: genId(), timestamp: new Date().toISOString(), user: user.name, action, type, detail }, ...prev]);

  const handleLogin = (user) => {
    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    const savedPage = localStorage.getItem(STORAGE_KEYS.CURRENT_PAGE);
    setPage(savedPage && savedPage !== "login" ? savedPage : "dashboard");
    addAuditLog(user, "Login", "login", "Entrou no sistema");
  };

  const handleLogout = async () => {
    if (currentUser) {
      await authService.logout(currentUser.id, currentUser.name);
      addAuditLog(currentUser, "Logout", "logout", "Saiu do sistema");
    }
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
    localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
    setCurrentUser(null);
    setPage("dashboard");
  };

  const handleNavigate = (p) => {
    setPage(p);
    setViewingInspection(null);
    setEditingInspection(null);
    if (p === "new-inspection") setShowNewModal(true);
  };
  
  const handleViewInspection = (insp) => { setViewingInspection(insp); setEditingInspection(null); setPage("inspections"); };
  const handleStartInspection = (insp) => {
    let updated = { ...insp };
    if (insp.status === "pending" || insp.status === "needs_corrections") updated.status = "in_progress";
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    syncInspectionToSupabase(updated);
    setEditingInspection(updated);
    setViewingInspection(null);
    setPage("inspections");
  };
  
  const handleSaveInspection = (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    syncInspectionToSupabase(updated);
    setEditingInspection(updated);
  };
  
  const handleSubmitInspection = (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    syncInspectionToSupabase(updated);
    setEditingInspection(null);
    setPage("inspections");
    addAuditLog(currentUser, "Notificação Enviada", "notification", `Email enviado sobre ${updated.location_name}`);
    notify(3, `Nova inspeção submetida por ${currentUser.name} para ${updated.location_name}.`, "inspections");
  };
  
  const handleCreateInspection = (insp) => {
    setInspections(prev => [insp, ...prev]);
    syncInspectionToSupabase(insp);
    setShowNewModal(false);
    setEditingInspection(insp);
    setPage("inspections");
  };
  
  const handleUpdateInspection = (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    syncInspectionToSupabase(updated);
    if (viewingInspection) setViewingInspection(updated);
  };

  const handleCreateSchedule = (tasks) => {
    const tasksWithTemplates = tasks.map(task => { const t = getClientTemplate(task.location_name); return { ...task, items: (t.sections||[]).flatMap(s => (s.items||[]).map(i => ({...i, section_id:s.id, score:null, comment:"", photos:[]}))), sections: (t.sections||[]).map(s => ({id:s.id, observation:"", photos:[]})) }; });
    setInspections(prev => [...tasksWithTemplates, ...prev]);
    tasksWithTemplates.forEach(t => syncInspectionToSupabase(t));
    setShowScheduleModal(false);
  };

  const handleBulkSchedule = (tasks) => {
    const tasksWithTemplates = tasks.map(task => { const t = getClientTemplate(task.location_name); return { ...task, items: (t.sections||[]).flatMap(s => (s.items||[]).map(i => ({...i, section_id:s.id, score:null, comment:"", photos:[]}))), sections: (t.sections||[]).map(s => ({id:s.id, observation:"", photos:[]})) }; });
    setInspections(prev => [...tasksWithTemplates, ...prev]);
    tasksWithTemplates.forEach(t => syncInspectionToSupabase(t));
    setShowBulkModal(false);
  };

  const handleDragUpdate = (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    syncInspectionToSupabase(updated);
  };
  const handleConfirmReschedule = (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    syncInspectionToSupabase(updated);
    setReschedulingTask(null);
  };
  const handleAcceptTask = (insp) => {
    const updated = { ...insp, accepted: true, status: "pending" };
    setInspections(prev => prev.map(i => i.id === insp.id ? updated : i));
    syncInspectionToSupabase(updated);
  };
  const handleDeclineTask = (insp) => {
    const reason = prompt("Motivo da recusa:", "");
    if (reason === null) return;
    const updated = { ...insp, accepted: false, status: "rejected", decline_reason: reason };
    setInspections(prev => prev.map(i => i.id === insp.id ? updated : i));
    syncInspectionToSupabase(updated);
  };
  const handleRequestLeave = (user) => {
    const date = prompt("Data da folga (AAAA-MM-DD):", new Date().toISOString().split("T")[0]);
    if (!date) return;
    const leaveTask = { id: genId(), inspector_id: user.id, inspector_name: user.name, date, type: "leave", status: "leave" };
    setInspections(prev => [leaveTask, ...prev]);
    syncInspectionToSupabase(leaveTask);
  };

  if (!isInitialized) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><div className="spinner"></div></div>;
  if (!currentUser) return <Login onLogin={handleLogin} />;

  let pageTitle = topBarTitles[page] || "FIMS";
  if (editingInspection) pageTitle = editingInspection.location_name;
  else if (viewingInspection) pageTitle = viewingInspection.location_name;

  return (
    <div className="fims-app">
      <Sidebar currentUser={currentUser} activePage={page} onNavigate={handleNavigate} alertCount={alertCount} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main">
        <Topbar title={pageTitle} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} currentUser={currentUser} onNavigate={handleNavigate} />
        <div className="page scrollbar-thin">
          {editingInspection ? (
            <InspectionForm inspection={editingInspection} onSave={handleSaveInspection} onSubmit={handleSubmitInspection} onBack={() => { setEditingInspection(null); setPage("inspections"); }} allInspections={inspections} />
          ) : viewingInspection ? (
            <InspectionDetail inspection={viewingInspection} currentUser={currentUser} onBack={() => setViewingInspection(null)} onUpdate={handleUpdateInspection} addAuditLog={addAuditLog} allInspections={inspections} />
          ) : page === "dashboard" ? (
            currentUser.role === ROLES.CEO || currentUser.role === ROLES.ADMIN ? <CEODashboard inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} /> :
            currentUser.role === ROLES.SUPERVISOR ? <SupervisorDashboard inspections={inspections} users={users} currentUser={currentUser} onView={handleViewInspection} /> :
            <InspectorDashboard inspections={inspections} users={users} currentUser={currentUser} onStartInspection={handleStartInspection} onAcceptTask={handleAcceptTask} onDeclineTask={handleDeclineTask} onRequestLeave={handleRequestLeave} />
          ) : page === "inspections" ? <InspectionsList inspections={inspections} currentUser={currentUser} onView={handleViewInspection} onCreate={() => setShowNewModal(true)} /> 
          : page === "report_center" ? <ReportCenter inspections={inspections} locations={locations} users={users} /> 
          : page === "messages" ? <Messages users={users} currentUser={currentUser} /> 
          : page === "alerts" ? <Alerts inspections={inspections} onView={handleViewInspection} onUpdate={handleUpdateInspection} /> 
          : page === "schedule" ? (
            <div>
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => exportToICS(inspections)}><Icon name="download" size={13} /> Export to Outlook/Google (.ics)</button>
              </div>
              <Schedule inspections={inspections} users={users} onUpdate={handleDragUpdate} onOpenModal={() => setShowScheduleModal(true)} onReschedule={setReschedulingTask} onBulkSchedule={() => setShowBulkModal(true)} />
            </div>
          ) : page === "field_map" ? <LiveMap inspections={inspections} users={users} onRefresh={async () => { return; }} refreshIntervalMs={45000} /> 
          : page === "team" ? <Team users={users} inspections={inspections} /> 
          : page === "monthly_report" ? <MonthlyReport inspections={inspections} locations={locations} /> 
          : page === "reports" ? <ReportsPage inspections={inspections} locations={locations} users={users} /> 
          : page === "users" ? <UsersPage users={users} setUsers={setUsers} /> 
          : page === "locations" ? <LocationsPage locations={locations} setLocations={setLocations} users={users} inspections={inspections} /> 
          : page === "templates" ? <TemplatesPage /> 
          : page === "audit" ? <AuditPage auditLogs={auditLogs} /> 
          : page === "settings" ? <SettingsPage /> 
          : null}
        </div>
      </div>
      {showNewModal && <NewInspectionModal locations={locations} users={users} currentUser={currentUser} onClose={() => setShowNewModal(false)} onCreate={handleCreateInspection} />}
      {showScheduleModal && <ScheduleModal locations={locations} users={users} inspections={inspections} onClose={() => setShowScheduleModal(false)} onCreate={handleCreateSchedule} />}
      {showBulkModal && <BulkScheduleModal locations={locations} users={users} onClose={() => setShowBulkModal(false)} onCreate={handleBulkSchedule} />}
      {reschedulingTask && <RescheduleModal inspection={reschedulingTask} users={users} onClose={() => setReschedulingTask(null)} onConfirm={handleConfirmReschedule} />}
    </div>
  );
}

const topBarTitles = {
  dashboard: "Dashboard", inspections: "Inspeções", alerts: "Alertas", reports: "Relatórios", users: "Utilizadores", locations: "Localizações", templates: "Templates", audit: "Auditoria", settings: "Configurações", monthly_report: "Relatório Mensal", schedule: "Operations Calendar", field_map: "Mapa de Campo", team: "Equipa (KPIs)", messages: "Mensagens", report_center: "Centro de Relatórios"
};

export default function App() {
  return (
    <LangProvider>
      <CommsProvider>
        <AppContent />
      </CommsProvider>
    </LangProvider>
  );
}
