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


// Chaves para localStorage
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
            <div style={{ 
              background: '#F3F4F6', 
              padding: '10px 12px', 
              borderRadius: 6,
              marginBottom: 12,
              fontSize: 13
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>📋 Template:</span>
                <span style={{ fontWeight: 500 }}>
                  {getClientTemplate(selectedClient.name).clientName || 'Padrão'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                <span>{getClientTemplate(selectedClient.name).sections?.length || 0} secções</span>
                <span>{getClientTemplate(selectedClient.name).totalItems || 0} itens</span>
              </div>
            </div>
          )}
          {currentUser.role !== ROLES.INSPECTOR && (
            <div className="form-group">
              <label className="form-label">Inspetor (Leave empty for Unassigned Queue)</label>
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
  
    // --- ESTADO ---
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

  // --- CARREGAR DADOS DO INDEXEDDB + localStorage (uma vez) ---
  useEffect(() => {
    async function loadData() {
      try {
        // 1. Load heavy data from IndexedDB
        const [savedInspections, savedUsers, savedLocations, savedLogs] = await Promise.all([
          dataStore.get(STORAGE_KEYS.INSPECTIONS),
          dataStore.get(STORAGE_KEYS.USERS),
          dataStore.get(STORAGE_KEYS.LOCATIONS),
          dataStore.get(STORAGE_KEYS.LOGS),
        ]);

        setInspections(savedInspections || genSeedInspections());
        setUsers(savedUsers || SEED_USERS);
        setLocations(savedLocations || SEED_LOCATIONS);
        setAuditLogs(savedLogs || []);

        // 2. Load light session data from localStorage
        const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        const savedPage = localStorage.getItem(STORAGE_KEYS.CURRENT_PAGE);
        const savedEditing = localStorage.getItem(STORAGE_KEYS.EDITING_INSPECTION);
        const savedViewing = localStorage.getItem(STORAGE_KEYS.VIEWING_INSPECTION);

        if (savedUser) {
          try {
            const user = JSON.parse(savedUser);
            setCurrentUser(user);
            if (savedPage && savedPage !== "login") {
              setPage(savedPage);
            }
          } catch (e) {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
          }
        }

        if (savedEditing) {
          try {
            setEditingInspection(JSON.parse(savedEditing));
          } catch (e) {}
        }

        if (savedViewing) {
          try {
            setViewingInspection(JSON.parse(savedViewing));
          } catch (e) {}
        }
      } catch (err) {
        console.error("Error loading data:", err);
        // fallback
        setInspections(genSeedInspections());
        setUsers(SEED_USERS);
        setLocations(SEED_LOCATIONS);
      } finally {
        setIsInitialized(true);
      }
    }

    loadData();
  }, []);

  // --- SALVAR DADOS PESADOS NO INDEXEDDB ---
  useEffect(() => {
    if (!isInitialized) return;
    dataStore.set(STORAGE_KEYS.INSPECTIONS, inspections);
  }, [inspections, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    dataStore.set(STORAGE_KEYS.USERS, users);
  }, [users, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    dataStore.set(STORAGE_KEYS.LOCATIONS, locations);
  }, [locations, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    dataStore.set(STORAGE_KEYS.LOGS, auditLogs);
  }, [auditLogs, isInitialized]);

  // --- SALVAR DADOS LEVES NO localStorage ---
  useEffect(() => {
    if (currentUser && page) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_PAGE, page);
    }
  }, [page, currentUser]);

  useEffect(() => {
    if (editingInspection) {
      localStorage.setItem(STORAGE_KEYS.EDITING_INSPECTION, JSON.stringify(editingInspection));
    } else {
      localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
    }
  }, [editingInspection]);

  useEffect(() => {
    if (viewingInspection) {
      localStorage.setItem(STORAGE_KEYS.VIEWING_INSPECTION, JSON.stringify(viewingInspection));
    } else {
      localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
    }
  }, [viewingInspection]);
  // --- FUNÇÕES ---
  const alertCount = inspections.filter(i => i.alert_level === "critical" && i.score_pct !== null && !i.resolved).length;
  
  const topBarTitles = {
    dashboard: "Dashboard", 
    inspections: "Inspeções", 
    alerts: "Alertas", 
    reports: "Relatórios",
    users: "Utilizadores", 
    locations: "Localizações", 
    templates: "Templates",
    audit: "Auditoria", 
    settings: "Configurações", 
    monthly_report: "Relatório Mensal",
    schedule: "Operations Calendar", 
    field_map: "Mapa de Campo", 
    team: "Equipa (KPIs)", 
    messages: "Mensagens", 
    report_center: "Centro de Relatórios"
  };

  const addAuditLog = (user, action, type, detail) => {
    setAuditLogs(prev => [{ id: genId(), timestamp: new Date().toISOString(), user: user.name, action, type, detail }, ...prev]);
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    // Restaurar página anterior ou ir para dashboard
    const savedPage = localStorage.getItem(STORAGE_KEYS.CURRENT_PAGE);
    // Se for página de login ou vazia, vai para dashboard
    if (savedPage && savedPage !== "login" && savedPage !== "") {
      setPage(savedPage);
    } else {
      setPage("dashboard");
    }
    addAuditLog(user, "Login", "login", "Entrou no sistema");
  };

  const handleLogout = async () => {
    if (currentUser) {
      await authService.logout(currentUser.id);
      addAuditLog(currentUser, "Logout", "logout", "Saiu do sistema");
    }
    // Limpar todos os dados de sessão
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PAGE);
    localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
    localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
    setCurrentUser(null);
    setPage("dashboard");
    setEditingInspection(null);
    setViewingInspection(null);
  };

  const handleNavigate = (p) => {
    setPage(p);
    setViewingInspection(null);
    setEditingInspection(null);
    localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
    localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
    if (p === "new-inspection") setShowNewModal(true);
  };
  
  const handleViewInspection = (insp) => {
    setViewingInspection(insp);
    setEditingInspection(null);
    localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
    setPage("inspections");
  };
  
  const handleStartInspection = (insp) => {
    let updated = { ...insp };
    if (insp.status === "pending" || insp.status === "needs_corrections") {
      updated.status = "in_progress";
    }
    
    if (!updated.items || updated.items.length === 0) {
      const template = getClientTemplate(updated.location_name);
      const templateSections = template.sections || [];
      
      updated.items = templateSections.flatMap(s => 
        (s.items || []).map(item => ({ 
          ...item, 
          section_id: s.id, 
          score: null, 
          comment: "", 
          photos: [] 
        }))
      );
      
      updated.sections = templateSections.map(s => ({ 
        id: s.id, 
        title: s.title || s.name,
        observation: "", 
        photos: [] 
      }));
      
      updated.template_id = template.clientId || "DEFAULT";
      updated.template_version = template.version || "1.0";
    }
    
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingInspection(updated);
    setViewingInspection(null);
    localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
    setPage("inspections");
  };
  
  const handleSaveInspection = (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingInspection(updated);
  };
  
  const handleSubmitInspection = (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingInspection(null);
    localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
    setPage("inspections");
    addAuditLog(currentUser, "Notificação Enviada", "notification", `Email e WhatsApp enviados para o Supervisor (${updated.supervisor_name}) sobre a inspeção em ${updated.location_name}`);
    notify(3, `Nova inspeção submetida por ${currentUser.name} para ${updated.location_name}.`, "inspections");
    
    const lowScoreItems = (updated.items || []).filter(i => i.score !== null && i.score <= 2);
    if (lowScoreItems.length > 0) {
      const capaDeadline = new Date();
      capaDeadline.setHours(capaDeadline.getHours() + 48);
      addAuditLog(currentUser, "CAPA Alert Triggered", "capa_alert", `${lowScoreItems.length} item(s) scored 1-2 at ${updated.location_name}. Corrective action required by ${capaDeadline.toLocaleString("pt-PT")}.`);
      notify(3, `⚠️ CAPA ALERT: ${updated.location_name} has ${lowScoreItems.length} critical defect(s). Fix within 48 hours.`, "inspections");
      notify(2, `⚠️ CAPA ALERT: ${updated.location_name} has ${lowScoreItems.length} critical defect(s). Supervisor has been notified.`, "inspections");
    }
  };
  
  const handleCreateInspection = (insp) => {
    setInspections(prev => [insp, ...prev]);
    setShowNewModal(false);
    setEditingInspection(insp);
    setPage("inspections");
  };
  
  const handleUpdateInspection = (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    if (viewingInspection) setViewingInspection(updated);
    if (updated.status === "needs_corrections") notify(updated.inspector_id, `A inspeção de ${updated.location_name} foi rejeitada. Veja as correções necessárias.`, "inspections");
    if (updated.status === "reviewed") notify(2, `Uma inspeção foi aprovada por ${currentUser.name}. Pronta para envio ao cliente.`, "inspections");
  };

  const handleCreateSchedule = (tasks) => {
    const tasksWithTemplates = tasks.map(task => {
      const template = getClientTemplate(task.location_name);
      const templateSections = template.sections || [];
      
      return {
        ...task,
        items: templateSections.flatMap(s => 
          (s.items || []).map(item => ({ 
            ...item, 
            section_id: s.id, 
            score: null, 
            comment: "", 
            photos: [] 
          }))
        ),
        sections: templateSections.map(s => ({ 
          id: s.id, 
          title: s.title || s.name,
          observation: "", 
          photos: [] 
        })),
        template_id: template.clientId || "DEFAULT",
        template_version: template.version || "1.0"
      };
    });
    
    setInspections(prev => [...tasksWithTemplates, ...prev]);
    setShowScheduleModal(false);
    addAuditLog(currentUser, "Despacho Criado", "schedule", `Agendou ${tasksWithTemplates.length} tarefa(s)`);
    tasksWithTemplates.forEach(t => {
      if(t.inspector_id) notify(t.inspector_id, `Nova tarefa agendada para ${t.date} no local ${t.location_name}.`, "schedule");
    });
  };

  const handleBulkSchedule = (tasks) => {
    const tasksWithTemplates = tasks.map(task => {
      const template = getClientTemplate(task.location_name);
      const templateSections = template.sections || [];
      
      return {
        ...task,
        items: templateSections.flatMap(s => 
          (s.items || []).map(item => ({ 
            ...item, 
            section_id: s.id, 
            score: null, 
            comment: "", 
            photos: [] 
          }))
        ),
        sections: templateSections.map(s => ({ 
          id: s.id, 
          title: s.title || s.name,
          observation: "", 
          photos: [] 
        })),
        template_id: template.clientId || "DEFAULT",
        template_version: template.version || "1.0"
      };
    });
    
    setInspections(prev => [...tasksWithTemplates, ...prev]);
    setShowBulkModal(false);
    addAuditLog(currentUser, "Despacho Múltiplo Criado", "schedule", `Agendou ${tasksWithTemplates.length} tarefas via bulk scheduling.`);
    tasksWithTemplates.forEach(t => {
      if(t.inspector_id) notify(t.inspector_id, `Nova tarefa agendada para ${t.date} no local ${t.location_name}.`, "schedule");
    });
  };

  const handleDragUpdate = (updated, notifyInspector = true) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    if (notifyInspector && updated.inspector_id) {
      notify(updated.inspector_id, `Tarefa atualizada: ${updated.location_name} movida para ${updated.date}.`, "schedule");
    }
    addAuditLog(currentUser, "Tarefa Movida (Drag/Drop)", "schedule", `Moveu ${updated.location_name} para ${updated.date} (${updated.inspector_name || "Unassigned"})`);
  };

  const handleConfirmReschedule = (updated, notifyClient, notifyInspector) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    addAuditLog(currentUser, "Inspeção Reagendada", "schedule", `Reagendou ${updated.location_name} para ${updated.date}. Motivo: ${updated.reschedule_reason}`);
    if (notifyInspector && updated.inspector_id) notify(updated.inspector_id, `Inspeção reagendada para ${updated.date} às ${updated.start_time}.`, "schedule");
    if (notifyClient) alert("Client notified (Simulated).");
    setReschedulingTask(null);
  };

  const handleAcceptTask = (insp) => {
    setInspections(prev => prev.map(i => i.id === insp.id ? { ...i, accepted: true, status: "pending" } : i));
    addAuditLog(currentUser, "Tarefa Aceite", "schedule", `Aceitou a tarefa para ${insp.location_name}`);
    notify(3, `${currentUser.name} aceitou a tarefa para ${insp.location_name}.`, "schedule");
  };

  const handleDeclineTask = (insp) => {
    const reason = prompt("Motivo da recusa:", "");
    if (reason === null) return;
    setInspections(prev => prev.map(i => i.id === insp.id ? { ...i, accepted: false, status: "rejected", decline_reason: reason } : i));
    addAuditLog(currentUser, "Tarefa Recusada", "schedule", `Recusou a tarefa para ${insp.location_name}. Motivo: ${reason}`);
    notify(3, `⚠️ ${currentUser.name} RECUSOU a tarefa para ${insp.location_name}. Motivo: ${reason}`, "schedule");
  };

  const handleRequestLeave = (user) => {
    const date = prompt("Data da folga (AAAA-MM-DD):", new Date().toISOString().split("T")[0]);
    if (!date) return;
    const leaveTask = { id: genId(), inspector_id: user.id, inspector_name: user.name, date, type: "leave", status: "leave" };
    setInspections(prev => [leaveTask, ...prev]);
    addAuditLog(user, "Folga Pedida", "schedule", `Pediu folga para ${date}`);
    notify(3, `${user.name} pediu folga para ${date}.`, "schedule");
    alert("Folga registada.");
  };

  // --- RENDER ---
  if (!isInitialized) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="spinner"></div>
    </div>;
  }

  // Se não tem usuário logado, mostra Login
  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  // Determinar o título da página
  let pageTitle = topBarTitles[page] || "FIMS";
  if (editingInspection) pageTitle = editingInspection.location_name;
  else if (viewingInspection) pageTitle = viewingInspection.location_name;

  return (
    <div className="fims-app">
      <Sidebar 
        currentUser={currentUser} 
        activePage={page} 
        onNavigate={handleNavigate} 
        alertCount={alertCount} 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
      />
      <div className="main">
        <Topbar 
          title={pageTitle}
          onMenuClick={() => setSidebarOpen(true)} 
          onLogout={handleLogout} 
          currentUser={currentUser} 
          onNavigate={handleNavigate} 
        />
        <div className="page scrollbar-thin">
          {editingInspection ? (
            <InspectionForm 
              inspection={editingInspection} 
              onSave={handleSaveInspection} 
              onSubmit={handleSubmitInspection} 
              onBack={() => { 
                setEditingInspection(null); 
                localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
                setPage("inspections"); 
              }} 
              allInspections={inspections} 
            />
          ) : viewingInspection ? (
            <InspectionDetail 
              inspection={viewingInspection} 
              currentUser={currentUser} 
              onBack={() => {
                setViewingInspection(null);
                localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
              }} 
              onUpdate={handleUpdateInspection} 
              addAuditLog={addAuditLog} 
              allInspections={inspections} 
            />
          ) : page === "dashboard" ? (
            currentUser.role === ROLES.CEO || currentUser.role === ROLES.ADMIN ? 
              <CEODashboard inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} />
            : currentUser.role === ROLES.SUPERVISOR ? 
              <SupervisorDashboard inspections={inspections} users={users} currentUser={currentUser} onView={handleViewInspection} />
            : 
              <InspectorDashboard 
                inspections={inspections} 
                users={users} 
                currentUser={currentUser} 
                onStartInspection={handleStartInspection} 
                onAcceptTask={handleAcceptTask} 
                onDeclineTask={handleDeclineTask} 
                onRequestLeave={handleRequestLeave} 
              />
          ) : page === "inspections" ? (
            <InspectionsList 
              inspections={inspections} 
              currentUser={currentUser} 
              onView={handleViewInspection} 
              onCreate={() => setShowNewModal(true)} 
            />
          ) : page === "report_center" ? (
            <ReportCenter inspections={inspections} locations={locations} users={users} />
          ) : page === "messages" ? (
            <Messages users={users} currentUser={currentUser} />
          ) : page === "alerts" ? (
            <Alerts inspections={inspections} onView={handleViewInspection} onUpdate={handleUpdateInspection} />
          ) : page === "schedule" ? (
            <div>
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => exportToICS(inspections)}>
                  <Icon name="download" size={13} /> Export to Outlook/Google (.ics)
                </button>
              </div>
              <Schedule 
                inspections={inspections} 
                users={users} 
                onUpdate={handleDragUpdate} 
                onOpenModal={() => setShowScheduleModal(true)} 
                onReschedule={setReschedulingTask} 
                onBulkSchedule={() => setShowBulkModal(true)} 
              />
            </div>
          ) : page === "field_map" ? (
            <LiveMap 
              inspections={inspections} 
              users={users} 
              onRefresh={async () => { return; }} 
              refreshIntervalMs={45000} 
            />
          ) : page === "team" ? (
            <Team users={users} inspections={inspections} />
          ) : page === "monthly_report" ? (
            <MonthlyReport inspections={inspections} locations={locations} />
          ) : page === "reports" ? (
            <ReportsPage inspections={inspections} locations={locations} users={users} />
          ) : page === "users" ? (
            <UsersPage users={users} setUsers={setUsers} />
          ) : page === "locations" ? (
            <LocationsPage locations={locations} setLocations={setLocations} users={users} inspections={inspections} />
          ) : page === "templates" ? (
            <TemplatesPage />
          ) : page === "audit" ? (
            <AuditPage auditLogs={auditLogs} />
          ) : page === "settings" ? (
            <SettingsPage />
          ) : null}
        </div>
      </div>
      {showNewModal && (
        <NewInspectionModal 
          locations={locations} 
          users={users} 
          currentUser={currentUser} 
          onClose={() => setShowNewModal(false)} 
          onCreate={handleCreateInspection} 
        />
      )}
      {showScheduleModal && (
        <ScheduleModal 
          locations={locations} 
          users={users} 
          inspections={inspections} 
          onClose={() => setShowScheduleModal(false)} 
          onCreate={handleCreateSchedule} 
        />
      )}
      {showBulkModal && (
        <BulkScheduleModal 
          locations={locations} 
          users={users} 
          onClose={() => setShowBulkModal(false)} 
          onCreate={handleBulkSchedule} 
        />
      )}
      {reschedulingTask && (
        <RescheduleModal 
          inspection={reschedulingTask} 
          users={users} 
          onClose={() => setReschedulingTask(null)} 
          onConfirm={handleConfirmReschedule} 
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <CommsProvider>
        <AppContent />
      </CommsProvider>
    </LangProvider>
  );
}
