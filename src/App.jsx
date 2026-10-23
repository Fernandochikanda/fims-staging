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
import Defects from "./pages/Defects";
import Schedule from "./pages/Schedule";
import LiveMap from "./pages/LiveMap";
import Team from "./pages/Team";
import Messages from "./pages/Messages";
import Notifications from "./pages/Notifications";
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

// Função de Validação Estrita: Template vs Inspeção
function validateInspectionAgainstTemplate(template, inspectionItems) {
  if (!template || !template.sections) {
    return { valid: true, error: null }; // Se não há template, não valida
  }
  
  // Contar itens do template original
  const templateItemsCount = template.sections.reduce((acc, s) => acc + (s.items?.length || 0), 0);
  const inspectionItemsCount = inspectionItems?.length || 0;
  
  // Validação 100% exata
  if (templateItemsCount !== inspectionItemsCount) {
    return {
      valid: false,
      error: `ERRO DE INTEGRIDADE: Template tem ${templateItemsCount} itens, mas a inspeção foi criada com ${inspectionItemsCount} itens. ${templateItemsCount - inspectionItemsCount} itens estão em falta.`
    };
  }
  
  return { valid: true, error: null };
}

function NewInspectionModal({ locations, users, currentUser, onClose, onCreate }) {
  const [locId, setLocId] = useState("");
  const [inspectorId, setInspectorId] = useState(currentUser.role === ROLES.INSPECTOR ? currentUser.id : "");
  const [selectedClient, setSelectedClient] = useState(null);
  const handleLocationChange = (e) => {
    const id = e.target.value;
    setLocId(id);
    if (id) {
      const loc = locations.find(l => String(l.id) === String(id));
      setSelectedClient(loc);
    } else {
      setSelectedClient(null);
    }
  };
  const handleCreate = () => {
    if (!locId) return;
    const loc = locations.find(l => String(l.id) === String(locId));
    if (!loc) return;
    
    const inspector = users.find(u => String(u.id) === String(inspectorId)) || null;
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
      template_version: template.version || "1.0",
      photosByItem: {}
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
  const { notify, notifications } = useComms();
  
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
        const [savedInspections, savedUsers, savedLocations, savedLogs] = await Promise.all([
          dataStore.get(STORAGE_KEYS.INSPECTIONS),
          dataStore.get(STORAGE_KEYS.USERS),
          dataStore.get(STORAGE_KEYS.LOCATIONS),
          dataStore.get(STORAGE_KEYS.LOGS),
        ]);
        setInspections(savedInspections || genSeedInspections());
        setLocations(savedLocations || SEED_LOCATIONS);
        
        try {
          const { dataService } = await import('./services/dataService');
          const result = await dataService.fetchUsers();
          if (result.success && result.users.length > 0) {
            setUsers(result.users);
            dataStore.set(STORAGE_KEYS.USERS, result.users);
            console.log("[App] Usuários carregados do Supabase:", result.users.length);
          } else {
            setUsers(savedUsers || SEED_USERS);
          }
        } catch (e) {
          console.error("Erro ao buscar usuários:", e);
          setUsers(savedUsers || SEED_USERS);
        }
        setAuditLogs(savedLogs || []);
        
        const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        const savedPage = localStorage.getItem(STORAGE_KEYS.CURRENT_PAGE);
        const savedEditing = localStorage.getItem(STORAGE_KEYS.EDITING_INSPECTION);
        const savedViewing = localStorage.getItem(STORAGE_KEYS.VIEWING_INSPECTION);
        
        if (savedUser) {
          try {
            const user = JSON.parse(savedUser);
            setCurrentUser(user);
            if (savedPage && savedPage !== "login") setPage(savedPage);
          } catch (e) { localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); }
        }
        if (savedEditing) try { setEditingInspection(JSON.parse(savedEditing)); } catch (e) {}
        if (savedViewing) try { setViewingInspection(JSON.parse(savedViewing)); } catch (e) {}
        
      } catch (err) {
        console.error("Error loading data:", err);
        setInspections(genSeedInspections());
        setUsers(SEED_USERS);
        setLocations(SEED_LOCATIONS);
      } finally {
        setIsInitialized(true);
      }
    }
    loadData();
  }, []);

  // ============================================
  // SINCRONIZAÇÃO COM SUPABASE - INSPEÇÕES
  // ============================================
  useEffect(() => {
    if (!isInitialized || !currentUser) return;
    let unsubscribed = false;
    let cleanupRealtime = null;
    async function syncInspections() {
      try {
        const { dataService } = await import('./services/dataService');
        const result = await dataService.fetchInspections();
        
        if (unsubscribed || !result.success) return;
        
        console.log(`[App] Recebidas ${result.inspections.length} inspeções do Supabase`);
        setInspections(result.inspections);
        dataStore.set(STORAGE_KEYS.INSPECTIONS, result.inspections);
        
        cleanupRealtime = dataService.subscribeToInspectionChanges((payload) => {
          if (unsubscribed) return;
          if (payload.eventType === 'INSERT' && payload.new) {
            setInspections(prev => {
              if (prev.some(i => String(i.id) === String(payload.new.id))) return prev;
              const updated = [payload.new, ...prev];
              dataStore.set(STORAGE_KEYS.INSPECTIONS, updated);
              return updated;
            });
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setInspections(prev => {
              const updated = prev.map(i => {
                if (String(i.id) === String(payload.new.id)) {
                  // FUSÃO: Se o Realtime vier sem itens/fotos, manter os que já estão no ecrã
                  return {
                    ...i,
                    ...payload.new,
                    items: (payload.new.items && payload.new.items.length > 0) ? payload.new.items : (i.items || []),
                    sections: (payload.new.sections && payload.new.sections.length > 0) ? payload.new.sections : (i.sections || []),
                    photosByItem: (payload.new.photosByItem && Object.keys(payload.new.photosByItem).length > 0) ? payload.new.photosByItem : (i.photosByItem || {}),
                  };
                }
                return i;
              });
              dataStore.set(STORAGE_KEYS.INSPECTIONS, updated);
              return updated;
            });
          }
        });
      } catch (error) {
        console.error('[App] Erro na sincronização:', error);
      }
    }
    syncInspections();
    return () => {
      unsubscribed = true;
      if (cleanupRealtime) cleanupRealtime();
    };
  }, [isInitialized, currentUser]);

  // ============================================
  // SINCRONIZAÇÃO COM SUPABASE - AUDIT LOGS
  // ============================================
  useEffect(() => {
    if (!isInitialized || !currentUser) return;
    let unsubscribed = false;
    async function syncAuditLogs() {
      try {
        const { dataService } = await import('./services/dataService');
        const result = await dataService.fetchAuditLogs();
        if (unsubscribed || !result.success) return;

        console.log(`[App] Recebidos ${result.logs.length} audit logs do Supabase`);
        // Merge: Supabase logs + local-only logs (not yet synced)
        setAuditLogs(prev => {
          const supabaseIds = new Set(result.logs.map(l => String(l.id)));
          const localOnly = prev.filter(l => !supabaseIds.has(String(l.id)));
          // Supabase first (most recent), then any local-only entries
          const merged = [...result.logs, ...localOnly];
          dataStore.set(STORAGE_KEYS.LOGS, merged);
          return merged;
        });
      } catch (error) {
        console.error('[App] Erro na sincronização de audit logs:', error);
      }
    }
    syncAuditLogs();
    // Refresh audit logs every 30 seconds
    const interval = setInterval(syncAuditLogs, 30000);
    return () => {
      unsubscribed = true;
      clearInterval(interval);
    };
  }, [isInitialized, currentUser]);

  // --- SALVAR DADOS PESADOS NO INDEXEDDB ---
  useEffect(() => { if (isInitialized) dataStore.set(STORAGE_KEYS.INSPECTIONS, inspections); }, [inspections, isInitialized]);
  useEffect(() => { if (isInitialized) dataStore.set(STORAGE_KEYS.USERS, users); }, [users, isInitialized]);
  useEffect(() => { if (isInitialized) dataStore.set(STORAGE_KEYS.LOCATIONS, locations); }, [locations, isInitialized]);
  useEffect(() => { if (isInitialized) dataStore.set(STORAGE_KEYS.LOGS, auditLogs); }, [auditLogs, isInitialized]);

  // --- SALVAR DADOS LEVES NO localStorage ---
  useEffect(() => { if (currentUser && page) localStorage.setItem(STORAGE_KEYS.CURRENT_PAGE, page); }, [page, currentUser]);
  useEffect(() => {
    if (editingInspection) localStorage.setItem(STORAGE_KEYS.EDITING_INSPECTION, JSON.stringify(editingInspection));
    else localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
  }, [editingInspection]);
  useEffect(() => {
    if (viewingInspection) localStorage.setItem(STORAGE_KEYS.VIEWING_INSPECTION, JSON.stringify(viewingInspection));
    else localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
  }, [viewingInspection]);

  // --- FUNÇÕES ---
  const alertCount = inspections.filter(i => i.alert_level === "critical" && i.score_pct !== null && !i.resolved).length;
  const notifCount = notifications.filter(n => currentUser && String(n.userId) === String(currentUser.id) && !n.read).length;
  
  const topBarTitles = {
    dashboard: "Dashboard", inspections: "Inspeções", alerts: "Alertas", reports: "Relatórios",
    users: "Utilizadores", locations: "Localizações", templates: "Templates", audit: "Auditoria", 
    settings: "Configurações", monthly_report: "Relatório Mensal", schedule: "Operations Calendar", 
    field_map: "Mapa de Campo", team: "Equipa (KPIs)", messages: "Mensagens", report_center: "Centro de Relatórios",
    notifications: "Notificações"
  };

  const addAuditLog = (user, action, type, detail) => {
    const logEntry = { id: genId(), timestamp: new Date().toISOString(), user: user.name, action, type, detail };
    setAuditLogs(prev => [logEntry, ...prev]);
    // Save to Supabase so all users/devices can see it
    (async () => {
      try {
        const { dataService } = await import('./services/dataService');
        await dataService.saveAuditLog({
          userId: user.id,
          userName: user.name,
          action,
          type,
          detail
        });
      } catch (e) {
        console.warn('[App] Failed to save audit log to Supabase:', e);
      }
    })();
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    const savedPage = localStorage.getItem(STORAGE_KEYS.CURRENT_PAGE);
    setPage(savedPage && savedPage !== "login" && savedPage !== "" ? savedPage : "dashboard");
    addAuditLog(user, "Login", "login", "Entrou no sistema");
  };

  const handleLogout = async () => {
    if (currentUser) {
      await authService.logout(currentUser.id);
      addAuditLog(currentUser, "Logout", "logout", "Saiu do sistema");
    }
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
  
  const handleStartInspection = async (insp) => {
    let updated = { ...insp };
    let needsSave = false;
    
    if (insp.status === "pending" || insp.status === "needs_corrections") {
      updated.status = "in_progress";
      needsSave = true;
    }
    
    if (!updated.items || updated.items.length === 0) {
      const template = getClientTemplate(updated.location_name);
      const templateSections = template.sections || [];
      updated.items = templateSections.flatMap(s => (s.items || []).map(item => ({ ...item, section_id: s.id, score: null, comment: "", photos: [] })));
      updated.sections = templateSections.map(s => ({ id: s.id, title: s.title || s.name, observation: "", photos: [] }));
      updated.template_id = template.clientId || "DEFAULT";
      updated.template_version = template.version || "1.0";
      needsSave = true;
    }
    
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingInspection(updated);
    setViewingInspection(null);
    localStorage.removeItem(STORAGE_KEYS.VIEWING_INSPECTION);
    setPage("inspections");
    if (needsSave) {
      try {
        const { dataService } = await import('./services/dataService');
        await dataService.saveInspection(updated);
      } catch (error) { console.error("Erro ao iniciar inspeção no Supabase:", error); }
    }
  };
  
  const handleSaveInspection = async (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingInspection(updated);
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(updated);
      console.log("[App] Rascunho e fotos salvos no Supabase.");
    } catch (error) { console.error("Erro ao salvar rascunho no Supabase:", error); }
  };
  
  const handleSubmitInspection = async (updated) => {
    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingInspection(null);
    localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
    setPage("inspections");
    
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(updated);
    } catch (error) { console.error("Erro ao submeter no Supabase:", error); }
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
  
  const handleAcceptTask = async (insp) => {
    const existing = inspections.find(i => i.id === insp.id) || {};
    const merged = { ...existing, accepted: true, status: "pending" };
    
    setInspections(prev => prev.map(i => i.id === insp.id ? merged : i));
    addAuditLog(currentUser, "Tarefa Aceite", "schedule", `Aceitou a tarefa para ${insp.location_name}`);
    notify(3, `${currentUser.name} aceitou a tarefa para ${insp.location_name}.`, "schedule");
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(merged);
    } catch (error) { console.error("Erro ao salvar aceitação no Supabase:", error); }
  };
  
  const handleDeclineTask = async (insp) => {
    const reason = prompt("Motivo da recusa:", "");
    if (reason === null) return;
    
    const existing = inspections.find(i => i.id === insp.id) || {};
    const merged = { ...existing, accepted: false, status: "rejected", decline_reason: reason };
    
    setInspections(prev => prev.map(i => i.id === insp.id ? merged : i));
    addAuditLog(currentUser, "Tarefa Recusada", "schedule", `Recusou a tarefa para ${insp.location_name}. Motivo: ${reason}`);
    notify(3, `⚠️ ${currentUser.name} RECUSOU a tarefa para ${insp.location_name}. Motivo: ${reason}`, "schedule");
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(merged);
    } catch (error) { console.error("Erro ao salvar recusa no Supabase:", error); }
  };

  const handleRequestLeave = async (user) => {
    const date = prompt("Data da folga (AAAA-MM-DD):", new Date().toISOString().split("T")[0]);
    if (!date) return;
    const leaveTask = { id: genId(), inspector_id: user.id, inspector_name: user.name, date, type: "leave", status: "leave" };
    setInspections(prev => [leaveTask, ...prev]);
    addAuditLog(user, "Folga Pedida", "schedule", `Pediu folga para ${date}`);
    notify(3, `${user.name} pediu folga para ${date}.`, "schedule");
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(leaveTask);
    } catch (error) { console.error("Erro ao salvar folga no Supabase:", error); }
    alert("Folga registada.");
  };
  
  const handleDelete = async (id) => {
    setInspections(prev => prev.filter(i => i.id !== id));
    addAuditLog(currentUser, "Excluir", "inspection", `Excluiu a inspeção ID: ${id}`);
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.deleteInspection(id);
    } catch (error) { console.error("Erro ao exuir no Supabase:", error); }
  };
  
  const handleCreateInspection = async (insp) => {
    const template = getClientTemplate(insp.location_name);
    
    // VALIDAÇÃO AUTOMÁTICA
    const validation = validateInspectionAgainstTemplate(template, insp.items);
    if (!validation.valid) {
      console.error("[App] " + validation.error);
      alert(`Inspeção Inválida!\n\n${validation.error}\n\nA inspeção não será criada até que a estrutura corresponda 100% ao template.`);
      return; // Bloqueia a criação
    }

    setInspections(prev => [insp, ...prev]);
    setShowNewModal(false);
    setEditingInspection(insp);
    setPage("inspections");
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(insp);
    } catch (error) { console.error("Erro ao salvar nova inspeção no Supabase:", error); }
  };
  
  const handleUpdateInspection = async (updated) => {
    const existing = inspections.find(i => i.id === updated.id) || {};
    const merged = { ...existing, ...updated };
    
    setInspections(prev => prev.map(i => i.id === merged.id ? merged : i));
    if (viewingInspection) setViewingInspection(merged);
    
    if (merged.status === "needs_corrections") notify(merged.inspector_id, `A inspeção de ${merged.location_name} foi rejeitada. Veja as correções necessárias.`, "inspections");
    if (merged.status === "reviewed") notify(2, `Uma inspeção foi aprovada por ${currentUser.name}. Pronta para envio ao cliente.`, "inspections");
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(merged);
    } catch (error) { console.error("Erro ao salvar atualização no Supabase:", error); }
  };

  const handleCreateSchedule = async (tasks) => {
    const tasksWithTemplates = tasks.map(task => {
      const template = getClientTemplate(task.location_name);
      
      // VALIDAÇÃO AUTOMÁTICA
      const validation = validateInspectionAgainstTemplate(template, task.items);
      if (!validation.valid) {
        console.error("[App] " + validation.error);
        alert(`Inspeção Inválida para ${task.location_name}!\n\n${validation.error}`);
        return null; // Marca para ser filtrado
      }
      
      const templateSections = template.sections || [];
      return {
        ...task,
        items: templateSections.flatMap(s => (s.items || []).map(item => ({ ...item, section_id: s.id, score: null, comment: "", photos: [] }))),
        sections: templateSections.map(s => ({ id: s.id, title: s.title || s.name, observation: "", photos: [] })),
        template_id: template.clientId || "DEFAULT",
        template_version: template.version || "1.0",
        photosByItem: {}
      };
    }).filter(Boolean); // Remove os que falharam a validação

    if (tasksWithTemplates.length === 0) return; // Se todos falharam, aborta
    
    setInspections(prev => [...tasksWithTemplates, ...prev]);
    setShowScheduleModal(false);
    addAuditLog(currentUser, "Despacho Criado", "schedule", `Agendou ${tasksWithTemplates.length} tarefa(s)`);
    
    try {
      const { dataService } = await import('./services/dataService');
      for (const task of tasksWithTemplates) {
        await dataService.saveInspection(task);
        if(task.inspector_id) notify(task.inspector_id, `Nova tarefa agendada para ${task.date} no local ${task.location_name}.`, "schedule");
      }
    } catch (error) { console.error("Erro ao salvar despacho no Supabase:", error); }
  };

  const handleBulkSchedule = async (tasks) => {
    const tasksWithTemplates = tasks.map(task => {
      const template = getClientTemplate(task.location_name);
      const templateSections = template.sections || [];
      return {
        ...task,
        items: templateSections.flatMap(s => (s.items || []).map(item => ({ ...item, section_id: s.id, score: null, comment: "", photos: [] }))),
        sections: templateSections.map(s => ({ id: s.id, title: s.title || s.name, observation: "", photos: [] })),
        template_id: template.clientId || "DEFAULT",
        template_version: template.version || "1.0",
        photosByItem: {}
      };
    });
    
    setInspections(prev => [...tasksWithTemplates, ...prev]);
    setShowBulkModal(false);
    addAuditLog(currentUser, "Despacho Múltiplo Criado", "schedule", `Agendou ${tasksWithTemplates.length} tarefas via bulk scheduling.`);
    
    try {
      const { dataService } = await import('./services/dataService');
      for (const task of tasksWithTemplates) {
        await dataService.saveInspection(task);
        if(task.inspector_id) notify(task.inspector_id, `Nova tarefa agendada para ${task.date} no local ${task.location_name}.`, "schedule");
      }
    } catch (error) { console.error("Erro ao salvar despacho múltiplo no Supabase:", error); }
  };

  const handleDragUpdate = async (updated, notifyInspector = true) => {
    const existing = inspections.find(i => i.id === updated.id) || {};
    const merged = { ...existing, ...updated };
    
    setInspections(prev => prev.map(i => i.id === merged.id ? merged : i));
    if (notifyInspector && merged.inspector_id) {
      notify(merged.inspector_id, `Tarefa atualizada: ${merged.location_name} movida para ${merged.date}.`, "schedule");
    }
    addAuditLog(currentUser, "Tarefa Movida (Drag/Drop)", "schedule", `Moveu ${merged.location_name} para ${merged.date} (${merged.inspector_name || "Unassigned"})`);
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(merged);
    } catch (error) { console.error("Erro ao salvar move no Supabase:", error); }
  };

  const handleConfirmReschedule = async (updated, notifyClient, notifyInspector) => {
    const existing = inspections.find(i => i.id === updated.id) || {};
    const merged = { ...existing, ...updated };
    
    setInspections(prev => prev.map(i => i.id === merged.id ? merged : i));
    addAuditLog(currentUser, "Inspeção Reagendada", "schedule", `Reagendou ${merged.location_name} para ${merged.date}. Motivo: ${merged.reschedule_reason}`);
    if (notifyInspector && merged.inspector_id) notify(merged.inspector_id, `Inspeção reagendada para ${merged.date} às ${merged.start_time}.`, "schedule");
    if (notifyClient) alert("Client notified (Simulated).");
    setReschedulingTask(null);
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(merged);
    } catch (error) { console.error("Erro ao salvar reagendamento no Supabase:", error); }
  };

  if (!isInitialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!currentUser) return <Login onLogin={handleLogin} />;

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
        notifCount={notifCount} 
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
          inspections={inspections}
          onStartInspection={handleStartInspection}
          onAcceptTask={handleAcceptTask}
          onDeclineTask={handleDeclineTask}
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
              <CEODashboard inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} onView={handleViewInspection} />
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
              onDelete={handleDelete} 
            />
          ) : page === "report_center" ? (
            <ReportCenter inspections={inspections} locations={locations} users={users} />
          ) : page === "messages" ? (
            <Messages users={users} currentUser={currentUser} />
          ) : page === "alerts" ? (
            <Alerts inspections={inspections} onView={handleViewInspection} onUpdate={handleUpdateInspection} />
          ) : page === "defects" ? (
            <Defects currentUser={currentUser} />
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
            <AuditPage auditLogs={auditLogs} users={users} />
          ) : page === "notifications" ? (
            <Notifications 
              currentUser={currentUser} 
              onNavigate={handleNavigate} 
              inspections={inspections} 
              onStartInspection={handleStartInspection} 
              onAcceptTask={handleAcceptTask} 
              onDeclineTask={handleDeclineTask} 
            />
          ) : page === "settings" ? (
            <SettingsPage 
              inspections={inspections}
              setInspections={setInspections}
            /> 
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
      <CommsProvider currentUser={JSON.parse(localStorage.getItem('fims_current_user') || 'null')}>
        <AppContent />
      </CommsProvider>
    </LangProvider>
  );
}
