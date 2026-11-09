// /src/App.jsx
import { useState, useEffect, useMemo } from "react";
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
import CapaManagement from "./pages/CapaManagement";
import ScheduleModal from "./components/ScheduleModal";
import RescheduleModal from "./components/RescheduleModal";
import BulkScheduleModal from "./components/BulkScheduleModal";
import { UsersPage, LocationsPage, ReportsPage, TemplatesPage, AuditPage, ActivityReport, SettingsPage } from "./pages/Management";
import { SEED_USERS, SEED_LOCATIONS, ROLES } from "./data/constants";
import { genSeedInspections, genId } from "./lib/helpers";
import { exportToICS } from "./lib/icsExporter";
import { LangProvider } from "./context/LangContext";
import { CommsProvider, useComms } from "./context/CommsContext";
import { getClientTemplate } from "./utils/excelTemplateImporter";
import { authService } from "./services/authService";
import { dataStore } from "./lib/dataStore";
import { defectService } from "./services/defectService";
import settingsService, { NOTIF_EVENTS } from "./services/settingsService";
import { INSPECTION_STATUS, validateTransition, canDelete, labelOf } from "./lib/inspectionStates";
import { validateInspectionSubmission, formatValidationErrors } from "./lib/inspectionValidator";
import PromptModal from "./components/PromptModal";
import PageErrorBoundary from "./components/PageErrorBoundary";
import { showToast } from "./lib/toast";

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
    // Supervisor real: primeiro supervisor ativo da equipa (nada de hardcoded)
    const supervisor = users.find(u => u.role === ROLES.SUPERVISOR && u.active !== false) || null;
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
      supervisor_id: supervisor ? supervisor.id : null, 
      supervisor_name: supervisor ? supervisor.name : null,
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
  const { notify, notifyEvent, notifications } = useComms();
  
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
  const [promptModal, setPromptModal] = useState(null);

  const [isInitialized, setIsInitialized] = useState(false);

  // ─── PROMPT / CONFIRM HELPERS (replace native prompt() & confirm()) ───
  // Each returns a Promise: resolves to the input string (prompt) or true/false (confirm).
  const showPrompt = (opts) =>
    new Promise((resolve) => {
      setPromptModal({
        ...opts,
        showInput: true,
        onConfirm: (val) => { setPromptModal(null); resolve(val); },
        onCancel: () => { setPromptModal(null); resolve(null); },
      });
    });

  const showConfirm = (opts) =>
    new Promise((resolve) => {
      setPromptModal({
        ...opts,
        showInput: false,
        onConfirm: () => { setPromptModal(null); resolve(true); },
        onCancel: () => { setPromptModal(null); resolve(false); },
      });
    });

  // ─── TRANSITION GUARD ───────────────────────────────────────────
  // Validates a status transition + logs blocked attempts to the audit log.
  // Returns true if allowed, false (with toast + audit) if blocked.
  const guardTransition = (inspection, newStatus, actionLabel) => {
    const user = currentUser || { id: "system", name: "Sistema" };
    const result = validateTransition(inspection, newStatus, user);
    if (!result.ok) {
      showToast(result.message, "error", 5000);
      addAuditLog(user, "Transição Bloqueada", "security",
        `${actionLabel} bloqueada: ${result.message} [${result.code}] — Inspeção ${inspection?.location_name || inspection?.id || "?"}`);
      return false;
    }
    return true;
  };

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
        
        let loadedUsers = savedUsers || SEED_USERS;
        try {
          const { dataService } = await import('./services/dataService');
          const result = await dataService.fetchUsers();
          if (result.success && result.users.length > 0) {
            loadedUsers = result.users;
            dataStore.set(STORAGE_KEYS.USERS, result.users);
            console.log("[App] Usuários carregados do Supabase:", result.users.length);
          }
        } catch (e) {
          console.error("Erro ao buscar usuários:", e);
        }
        setUsers(loadedUsers);
        setAuditLogs(savedLogs || []);
        
        const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        const savedPage = localStorage.getItem(STORAGE_KEYS.CURRENT_PAGE);
        const savedEditing = localStorage.getItem(STORAGE_KEYS.EDITING_INSPECTION);
        const savedViewing = localStorage.getItem(STORAGE_KEYS.VIEWING_INSPECTION);
        
        if (savedUser) {
          try {
            const user = JSON.parse(savedUser);
            // MIGRAÇÃO DE SESSÕES ANTIGAS (IDN-001): se o id da sessão for um id
            // numérico legado, remapeia para o id canónico (user_id 'usr_*').
            const s = String(user.id);
            const match = (loadedUsers || []).find(u =>
              String(u.id) === s || (u.dbId != null && String(u.dbId) === s));
            if (match && String(match.id) !== s) {
              const updated = { ...user, id: match.id, name: match.name || user.name, role: match.role || user.role };
              localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updated));
              setCurrentUser(updated);
            } else {
              setCurrentUser(user);
            }
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
    let cleanupPoll = null;
    async function syncInspections() {
      try {
        const { dataService } = await import('./services/dataService');
        const fetchData = async () => {
          const result = await dataService.fetchInspections();
          if (unsubscribed || !result.success) return;
          console.log(`[App] Recebidas ${result.inspections.length} inspeções do Supabase`);
          setInspections(result.inspections);
          dataStore.set(STORAGE_KEYS.INSPECTIONS, result.inspections);
        };
        await fetchData();

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

        // Fallback de fiabilidade: o realtime pode cair (rede/VPN) — refresca
        // por intervalo, e reenvia gravações em fila (outbox) no arranque,
        // quando a ligação recupera e a cada minuto.
        dataService.flushOutbox();
        const onOnline = () => { dataService.flushOutbox(); };
        window.addEventListener("online", onOnline);
        const poll = setInterval(async () => {
          if (unsubscribed) return;
          try {
            await dataService.flushOutbox();
            await fetchData();
          } catch (e) { console.warn("[App] Poll falhou:", e?.message); }
        }, 60000);
        cleanupPoll = () => {
          clearInterval(poll);
          window.removeEventListener("online", onOnline);
        };
      } catch (error) {
        console.error('[App] Erro na sincronização:', error);
      }
    }
    syncInspections();
    return () => {
      unsubscribed = true;
      if (cleanupRealtime) cleanupRealtime();
      if (cleanupPoll) cleanupPoll();
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
  useEffect(() => {
    if (!currentUser) return;
    const runChecks = async () => {
      try {
        const { reminderService } = await import('./services/reminderService');
        const { escalationService } = await import('./services/escalationService');
        await reminderService.checkAndRemind(inspections, users, currentUser);
        await reminderService.checkDailySummary(inspections, currentUser);
        await escalationService.checkAndEscalate();
      } catch (e) { console.warn('[checks]', e); }
    };
    runChecks();
    const interval = setInterval(runChecks, 300000);
    return () => clearInterval(interval);
  }, [currentUser, inspections]);

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

  // ============================================
  // ESCALONAMENTO DE DEFEITOS — AGORA 100% SERVER-SIDE
  // (pg_cron chama fims_escalate_overdue_defects a cada 15 min; o servidor
  // cria as notificações/mensagens com dedupe — CEO incluído sempre).
  // Aqui: apenas REFRESH de UI (leitura) para mostrar escalonamentos recentes.
  // Corrige ESC-001/ESC-002/ESC-003 — o cliente já não decide nem notifica.
  // ============================================
  useEffect(() => {
    if (!isInitialized || !currentUser) return;

    const refreshDefects = async () => {
      try { await defectService.refresh(); } catch (e) {
        console.warn('[App] Refresh de defeitos falhou:', e);
      }
    };

    refreshDefects();
    const iv = setInterval(refreshDefects, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [isInitialized, currentUser?.id]);

  // --- FUNÇÕES ---
  const alertCount = inspections.filter(i => i.alert_level === "critical" && i.score_pct !== null && !i.resolved).length;
  const notifCount = notifications.filter(n => currentUser && String(n.userId) === String(currentUser.id) && !n.read).length;
  
  const topBarTitles = {
    dashboard: "Dashboard", inspections: "Inspeções", alerts: "Alertas", reports: "Relatórios",
    users: "Utilizadores", locations: "Localizações", templates: "Templates", audit: "Auditoria", 
    settings: "Configurações", monthly_report: "Relatório Mensal", schedule: "Operations Calendar", 
    field_map: "Mapa de Campo", team: "Equipa (KPIs)", messages: "Mensagens", report_center: "Centro de Relatórios",
    notifications: "Notificações", capa: "CAPA — Ações Corretivas"
  };

  const addAuditLog = (user, action, type, detail) => {
    // Null-safe: if user is null (e.g. during logout race condition), log as "Sistema"
    // instead of crashing on user.name.
    const safeUser = user || { id: "system", name: "Sistema" };
    const logEntry = { id: genId(), timestamp: new Date().toISOString(), user: safeUser.name, action, type, detail };
    setAuditLogs(prev => [logEntry, ...prev]);
    // Save to Supabase so all users/devices can see it
    (async () => {
      try {
        const { dataService } = await import('./services/dataService');
        await dataService.saveAuditLog({
          userId: safeUser.id,
          userName: safeUser.name,
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
    
    // GUARD: always validate transition to in_progress (not just for pending/needs_corrections).
    // If already in_progress, no status change needed — skip the guard.
    // This prevents opening (and auto-saving) a submitted/reviewed/closed inspection
    // as in_progress, which would revert its status.
    if (insp.status !== "in_progress") {
      if (!guardTransition(insp, INSPECTION_STATUS.IN_PROGRESS, "Iniciar inspeção")) return;
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
      const ok = await dataService.saveInspection(updated);
      if (ok) console.log("[App] Rascunho e fotos salvos no Supabase.");
      else dataService.queueInspectionSave(updated);
    } catch (error) {
      console.error("Erro ao salvar rascunho no Supabase:", error);
      try { const { dataService } = await import('./services/dataService'); dataService.queueInspectionSave(updated); } catch (e2) {}
    }
  };
  
  const handleSubmitInspection = async (updated) => {
    // GUARD 1: validate transition against the STORED record, not the payload.
    // The payload already has status: "submitted" (set by the form), so validating
    // the payload would compare submitted → submitted (always allowed = useless).
    // We must check the CURRENT status in state to enforce in_progress → submitted.
    const stored = inspections.find(i => i.id === updated.id) || updated;
    if (!guardTransition(stored, INSPECTION_STATUS.SUBMITTED, "Submeter inspeção")) return;

    // GUARD 2: validate inspection content (safety net — same checks as the form,
    // but enforced at the handler level so it can't be bypassed by calling
    // handleSubmitInspection directly). Closes loophole L6.
    const validation = validateInspectionSubmission(updated);
    if (!validation.valid) {
      const detail = formatValidationErrors(validation.errors);
      showToast(`Inspeção incompleta: ${validation.summary}`, "error", 6000);
      addAuditLog(currentUser, "Submissão Bloqueada", "security",
        `Submissão bloqueada por validação: ${validation.summary} — ${updated.location_name || updated.id}. Detalhes: ${detail.slice(0, 200)}`);
      return;
    }

    setInspections(prev => prev.map(i => i.id === updated.id ? updated : i));
    setEditingInspection(null);
    localStorage.removeItem(STORAGE_KEYS.EDITING_INSPECTION);
    setPage("inspections");
    
    try {
      const { dataService } = await import('./services/dataService');
      let ok = await dataService.saveInspection(updated);
      if (!ok) {
        // 2ª tentativa após pausa curta — falhas transitórias de rede são comuns
        await new Promise(r => setTimeout(r, 3000));
        ok = await dataService.saveInspection(updated);
      }
      if (!ok) {
        dataService.queueInspectionSave(updated);
        const motivo = dataService.lastSaveError || "ligação indisponível";
        const semNet = typeof navigator !== "undefined" && navigator.onLine === false;
        showToast(`A submissão não chegou ao servidor. Motivo: ${motivo}. ${semNet ? "Aparelho sem internet." : ""} Ficou em fila e será reenviada.`, "warning", 6000);
      } else {
        // Save succeeded — clear the local draft (the form no longer deletes it
        // so the handler can block before the draft is lost).
        try { localStorage.removeItem('fims_draft_' + updated.id); } catch (e) {}
      }
    } catch (error) {
      console.error("Erro ao submeter no Supabase:", error);
      try { const { dataService } = await import('./services/dataService'); dataService.queueInspectionSave(updated); } catch (e2) {}
    }
    addAuditLog(currentUser, "Inspeção Submetida", "notification", `Supervisor(es) notificado(s) sobre a inspeção em ${updated.location_name}`);
    // ============================================================
    // FIM DE INSPEÇÃO (submissão) → supervisores recebem NOTIFICAÇÃO
    // + MENSAGEM no chat, conforme Configurações → Notificações
    // Wrapped in try/catch so a notification failure doesn't break the
    // submit flow (the inspection is already saved at this point).
    // ============================================================
    try {
      await notifyEvent(NOTIF_EVENTS.INSPECTION_SUBMITTED, users,
        `📋 Nova inspeção submetida por ${currentUser.name} para ${updated.location_name} — aguarda revisão.`,
        `inspections:${updated.id}`, { excludeId: currentUser.id, sender: currentUser, dedupeKey: "inspsub:" + updated.id });
    } catch (e) { console.warn('[App] notifyEvent (submitted) failed:', e); }

    const lowScoreItems = (updated.items || []).filter(i => i.score !== null && i.score <= 2);
    if (lowScoreItems.length > 0) {
      // Generate tracked CAPA rows (replaces ad-hoc audit log + chat message).
      // The CAPAs are persisted in fims_capa with status, deadline, evidence,
      // and closure tracking. Idempotent: won't duplicate if resubmitted.
      try {
        const { capaService } = await import('./services/capaService');
        const result = await capaService.generateForInspection(updated, currentUser);
        if (result.created > 0) {
          const dueLabel = new Date(Date.now() + 48 * 3600 * 1000).toLocaleString("pt-PT");
          addAuditLog(currentUser, "CAPA Gerada", "capa_alert",
            `${result.created} CAPA(s) gerada(s) para ${updated.location_name} — ${lowScoreItems.length} defeito(s) crítico(s) (score 1-2). Prazo: ${dueLabel}.`);
          const capaMsg = `⚠️ CAPA: ${updated.location_name} tem ${result.created} defeito(s) crítico(s) (score 1-2). Correção obrigatória em 48h. Verifique a página CAPA.`;
          try {
            await notifyEvent(NOTIF_EVENTS.DEFECT_NEW, users, capaMsg, `inspections:${updated.id}`, {
              excludeId: currentUser.id, sender: currentUser, dedupeKey: "capa:" + updated.id });
          } catch (e) { console.warn('[App] notifyEvent (CAPA) failed:', e); }
        }
      } catch (e) {
        console.warn('[App] CAPA generation failed:', e);
        // Fallback to old behavior if capaService fails (e.g. table doesn't exist yet)
        addAuditLog(currentUser, "CAPA Alert (fallback)", "capa_alert",
          `${lowScoreItems.length} item(s) scored 1-2 at ${updated.location_name}. (CAPA table not available — using audit log fallback.)`);
      }
    }
  };
  
  const handleAcceptTask = async (insp) => {
    // GUARD: validate transition pending_acceptance → pending
    if (!guardTransition(insp, INSPECTION_STATUS.PENDING, "Aceitar tarefa")) return;

    const existing = inspections.find(i => i.id === insp.id) || {};
    const merged = { ...existing, accepted: true, status: "pending" };
    
    setInspections(prev => prev.map(i => i.id === insp.id ? merged : i));
    addAuditLog(currentUser, "Tarefa Aceite", "schedule", `Aceitou a tarefa para ${insp.location_name}`);
    try {
      const { dataService } = await import('./services/dataService');
      const ok = await dataService.saveInspection(merged);
      if (!ok) dataService.queueInspectionSave(merged);
    } catch (error) {
      console.error("Erro ao salvar aceitação no Supabase:", error);
      try { const { dataService } = await import('./services/dataService'); dataService.queueInspectionSave(merged); } catch (e2) {}
    }
    // Notify AFTER save — wrapped in try/catch so notification failure
    // doesn't affect the saved data.
    try {
      await notifyEvent(NOTIF_EVENTS.TASK_SCHEDULED, users,
        `${currentUser.name} aceitou a tarefa para ${insp.location_name}.`, `inspections:${insp.id}`,
        { excludeId: currentUser.id, rolesOverride: ["supervisor", "admin"], sender: currentUser, dedupeKey: "taskacc:" + insp.id });
    } catch (e) { console.warn('[App] notifyEvent (accept) failed:', e); }
  };
  
  const handleDeclineTask = async (insp) => {
    // GUARD: validate transition pending_acceptance → rejected
    if (!guardTransition(insp, INSPECTION_STATUS.REJECTED, "Recusar tarefa")) return;

    const reason = await showPrompt({
      title: "Recusar Tarefa",
      message: `Vai recusar a tarefa para "${insp.location_name}". Indique o motivo da recusa:`,
      placeholder: "Ex: Conflito de agenda, sem transporte...",
      confirmLabel: "Recusar",
      danger: true,
      requireInput: true,
    });
    if (!reason || !reason.trim()) return;

    const existing = inspections.find(i => i.id === insp.id) || {};
    const merged = { ...existing, accepted: false, status: "rejected", decline_reason: reason };
    
    setInspections(prev => prev.map(i => i.id === insp.id ? merged : i));
    addAuditLog(currentUser, "Tarefa Recusada", "schedule", `Recusou a tarefa para ${insp.location_name}. Motivo: ${reason}`);
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(merged);
    } catch (error) { console.error("Erro ao salvar recusa no Supabase:", error); }
    try {
      await notifyEvent(NOTIF_EVENTS.TASK_SCHEDULED, users,
        `⚠️ ${currentUser.name} RECUSOU a tarefa para ${insp.location_name}. Motivo: ${reason}`, `inspections:${insp.id}`,
        { excludeId: currentUser.id, rolesOverride: ["supervisor", "admin"], sender: currentUser, dedupeKey: "taskdec:" + insp.id });
    } catch (e) { console.warn('[App] notifyEvent (decline) failed:', e); }
  };

  const handleRequestLeave = async (user) => {
    const date = await showPrompt({
      title: "Pedir Folga",
      message: `Indique a data da folga para ${user.name}:`,
      placeholder: "AAAA-MM-DD",
      defaultValue: new Date().toISOString().split("T")[0],
      confirmLabel: "Registar Folga",
      requireInput: true,
    });
    if (!date || !date.trim()) return;
    // Validate date format (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(date.trim())) {
      showToast("Formato de data inválido. Use AAAA-MM-DD (ex: 2026-11-15).", "error", 5000);
      return;
    }
    const leaveTask = { id: genId(), inspector_id: user.id, inspector_name: user.name, date, type: "leave", status: "leave" };
    setInspections(prev => [leaveTask, ...prev]);
    addAuditLog(user, "Folga Pedida", "schedule", `Pediu folga para ${date}`);
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(leaveTask);
    } catch (error) { console.error("Erro ao salvar folga no Supabase:", error); }
    try {
      await notifyEvent(NOTIF_EVENTS.TASK_SCHEDULED, users,
        `${user.name} pediu folga para ${date}.`, "schedule",
        { excludeId: user.id, rolesOverride: ["supervisor", "admin"], sender: currentUser, dedupeKey: "leave:" + leaveTask.id });
    } catch (e) { console.warn('[App] notifyEvent (leave) failed:', e); }
    showToast("Folga registada.", "success", 3000);
  };
  
  const handleDelete = async (id) => {
    const insp = inspections.find(i => i.id === id);
    if (!insp) return;

    // GUARD: check if user can delete this inspection
    const guard = canDelete(insp, currentUser);
    if (!guard.ok) {
      showToast(guard.message, "error", 5000);
      addAuditLog(currentUser || { name: "Sistema" }, "Eliminação Bloqueada", "security",
        `${guard.message} [${guard.code}] — Inspeção ${insp.location_name || id}`);
      return;
    }

    // For protected inspections (submitted/reviewed/closed), require admin + reason
    const isProtected = [INSPECTION_STATUS.SUBMITTED, INSPECTION_STATUS.REVIEWED, INSPECTION_STATUS.CLOSED]
      .includes(insp.status);
    let reason = "";
    if (isProtected) {
      reason = await showPrompt({
        title: "Eliminar Inspeção Protegida",
        message: `Esta inspeção (${insp.location_name}) está no estado "${labelOf(insp.status)}". A eliminação requer um motivo justificado.`,
        placeholder: "Motivo da eliminação...",
        confirmLabel: "Eliminar",
        danger: true,
        requireInput: true,
      });
      if (!reason || !reason.trim()) return;
    } else {
      const ok = await showConfirm({
        title: "Eliminar Inspeção",
        message: `Tem a certeza que pretende eliminar a inspeção de "${insp.location_name}"?`,
        confirmLabel: "Eliminar",
        cancelLabel: "Cancelar",
        danger: true,
      });
      if (!ok) return;
    }

    setInspections(prev => prev.filter(i => i.id !== id));
    addAuditLog(currentUser, "Excluir", "inspection",
      `Eliminou a inspeção ${insp.location_name} (ID: ${id})${reason ? ` — Motivo: ${reason}` : ""}`);
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.deleteInspection(id);
    } catch (error) { console.error("Erro ao excluir no Supabase:", error); }
  };
  
  const handleCreateInspection = async (insp) => {
    const template = getClientTemplate(insp.location_name);
    
    // VALIDAÇÃO AUTOMÁTICA
    const validation = validateInspectionAgainstTemplate(template, insp.items);
    if (!validation.valid) {
      console.error("[App] " + validation.error);
      showToast(`Inspeção Inválida! ${validation.error} A inspeção não será criada até que a estrutura corresponda 100% ao template.`, "error", 6000);
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

    // GUARD: validate status transition (for approve / reject / reopen)
    if (updated.status && updated.status !== existing.status) {
      if (!guardTransition(existing, updated.status, "Atualizar inspeção")) return;
    }

    setInspections(prev => prev.map(i => i.id === merged.id ? merged : i));
    if (viewingInspection) setViewingInspection(merged);

    // Save FIRST, then notify — wrapped in try/catch so notification
    // failure doesn't affect the saved data.
    try {
      const { dataService } = await import('./services/dataService');
      const ok = await dataService.saveInspection(merged);
      if (!ok) {
        dataService.queueInspectionSave(merged);
        showToast(`A atualização não chegou ao servidor. Motivo: ${dataService.lastSaveError || "ligação indisponível"}. Ficou em fila.`, "warning", 6000);
      }
    } catch (error) {
      console.error("Erro ao salvar atualização no Supabase:", error);
      try { const { dataService } = await import('./services/dataService'); dataService.queueInspectionSave(merged); } catch (e2) {}
    }
    if (merged.status === "needs_corrections") {
      // Extract the supervisor's correction note from the notes field.
      // InspectionDetail.jsx appends it as: notes + '\n\n[NECESSITA CORREÇÃO]: ' + rejectNote
      const notesStr = String(merged.notes || "");
      const marker = "[NECESSITA CORREÇÃO]";
      const markerIdx = notesStr.indexOf(marker);
      const rejectNote = markerIdx >= 0
        ? notesStr.slice(markerIdx + marker.length).replace(/^[:\s]+/, "").trim()
        : "";
      // Target ONLY the assigned inspector (not all inspectors).
      // Include the rejectNote so the inspector sees the supervisor's feedback
      // directly in the notification. Encode inspectionId in the link for deep-linking.
      try {
        await notifyEvent(NOTIF_EVENTS.INSPECTION_REJECTED, users,
          `A inspeção de ${merged.location_name} foi devolvida por ${currentUser.name}. Correções necessárias${rejectNote ? ": " + rejectNote : ""}.`,
          `inspections:${merged.id}`, { excludeId: currentUser.id, sender: currentUser, dedupeKey: "insprej:" + merged.id, singleUser: String(merged.inspector_id) });
      } catch (e) { console.warn('[App] notifyEvent (rejected) failed:', e); }
    }
    if (merged.status === "reviewed") {
      try {
        await notifyEvent(NOTIF_EVENTS.INSPECTION_COMPLETED, users,
          `Uma inspeção (${merged.location_name}) foi aprovada por ${currentUser.name}. Pronta para envio ao cliente.`,
          `inspections:${merged.id}`, { excludeId: currentUser.id, sender: currentUser, dedupeKey: "inspdone:" + merged.id, singleUser: String(merged.inspector_id) });
      } catch (e) { console.warn('[App] notifyEvent (completed) failed:', e); }
    }
  };

  const handleCreateSchedule = async (tasks) => {
    const tasksWithTemplates = tasks.map(task => {
      const template = getClientTemplate(task.location_name);
      
      // VALIDAÇÃO AUTOMÁTICA
      const validation = validateInspectionAgainstTemplate(template, task.items);
      if (!validation.valid) {
        console.error("[App] " + validation.error);
        showToast(`Inspeção Inválida para ${task.location_name}! ${validation.error}`, "error", 6000);
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
        if (task.inspector_id) {
          await notifyEvent(NOTIF_EVENTS.TASK_SCHEDULED, users,
            `Nova tarefa agendada para ${task.date} no local ${task.location_name}.`, `inspections:${task.id}`,
            { rolesOverride: ["inspector"], excludeId: currentUser.id, sender: currentUser,
              singleUser: String(task.inspector_id), dedupeKey: "tasksch:" + task.id });
        }
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
        if (task.inspector_id) {
          await notifyEvent(NOTIF_EVENTS.TASK_SCHEDULED, users,
            `Nova tarefa agendada para ${task.date} no local ${task.location_name}.`, `inspections:${task.id}`,
            { rolesOverride: ["inspector"], excludeId: currentUser.id, sender: currentUser,
              singleUser: String(task.inspector_id), dedupeKey: "tasksch:" + task.id });
        }
      }
    } catch (error) { console.error("Erro ao salvar despacho múltiplo no Supabase:", error); }
  };

  const handleDragUpdate = async (updated, notifyInspector = true) => {
    const existing = inspections.find(i => i.id === updated.id) || {};
    const merged = { ...existing, ...updated };
    
    setInspections(prev => prev.map(i => i.id === merged.id ? merged : i));
    if (notifyInspector && merged.inspector_id) {
      await notifyEvent(NOTIF_EVENTS.TASK_SCHEDULED, users,
        `Tarefa atualizada: ${merged.location_name} movida para ${merged.date}.`, `inspections:${merged.id}`,
        { rolesOverride: ["inspector"], excludeId: currentUser.id, sender: currentUser,
          singleUser: String(merged.inspector_id) });
    }
    addAuditLog(currentUser, "Tarefa Movida (Drag/Drop)", "schedule", `Moveu ${merged.location_name} para ${merged.date} (${merged.inspector_name || "Unassigned"})`);
    try {
      const { dataService } = await import('./services/dataService');
      await dataService.saveInspection(merged);
    } catch (error) { console.error("Erro ao salvar move no Supabase:", error); }
  };

  const handleConfirmReschedule = async (updated, notifyClient, notifyInspector) => {
    // GUARD: reschedule reason is required
    if (!updated.reschedule_reason || !updated.reschedule_reason.trim()) {
      showToast("É obrigatório indicar o motivo do reagendamento.", "error", 4000);
      return;
    }

    const existing = inspections.find(i => i.id === updated.id) || {};
    const merged = { ...existing, ...updated };
    
    setInspections(prev => prev.map(i => i.id === merged.id ? merged : i));
    addAuditLog(currentUser, "Inspeção Reagendada", "schedule", `Reagendou ${merged.location_name} para ${merged.date}. Motivo: ${merged.reschedule_reason}`);
    if (notifyInspector && merged.inspector_id) {
      await notifyEvent(NOTIF_EVENTS.TASK_SCHEDULED, users,
        `Inspeção reagendada para ${merged.date} às ${merged.start_time}.`, `inspections:${merged.id}`,
        { rolesOverride: ["inspector"], excludeId: currentUser.id, sender: currentUser,
          singleUser: String(merged.inspector_id) });
    }
    if (notifyClient) showToast("Cliente notificado (simulado).", "info", 3000);
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

  // ─── RBAC: filter inspections by role ──────────────────────────
  // Inspectors see ONLY their own inspections (excluding leave/deleted).
  // Supervisors/Admins/CEOs see ALL inspections (excluding leave/deleted).
  // This is applied to ALL pages that receive inspections as a prop —
  // defense in depth so privacy is enforced even if sidebar permissions
  // change or a page is accessed via URL manipulation.
  const accessibleInspections = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === ROLES.INSPECTOR) {
      return inspections.filter(i =>
        String(i.inspector_id) === String(currentUser.id) &&
        i.type !== "leave" &&
        i.status !== "deleted"
      );
    }
    return inspections.filter(i => i.type !== "leave" && i.status !== "deleted");
  }, [currentUser, inspections]);

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
          inspections={accessibleInspections}
          onStartInspection={handleStartInspection}
          onAcceptTask={handleAcceptTask}
          onDeclineTask={handleDeclineTask}
          onViewInspection={handleViewInspection}
        />
        <div className="page scrollbar-thin">
          <PageErrorBoundary
            key={(editingInspection?.id || '') + (viewingInspection?.id || '') + page}
            onBack={() => handleNavigate("dashboard")}
          >
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
              users={users}
            />
          ) : page === "dashboard" ? (
            currentUser.role === ROLES.CEO || currentUser.role === ROLES.ADMIN ? 
              <CEODashboard inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} onView={handleViewInspection} />
            : currentUser.role === ROLES.SUPERVISOR ? 
              <SupervisorDashboard inspections={inspections} users={users} currentUser={currentUser} onView={handleViewInspection} />
            : 
              <InspectorDashboard 
                inspections={accessibleInspections} 
                users={users} 
                currentUser={currentUser} 
                onStartInspection={handleStartInspection} 
                onAcceptTask={handleAcceptTask} 
                onDeclineTask={handleDeclineTask} 
                onRequestLeave={handleRequestLeave} 
              />
          ) : page === "inspections" ? (
            <InspectionsList 
              inspections={accessibleInspections} 
              currentUser={currentUser} 
              onView={handleViewInspection} 
              onCreate={() => setShowNewModal(true)}
              onDelete={handleDelete} 
            />
          ) : page === "report_center" ? (
            <ReportCenter inspections={accessibleInspections} locations={locations} users={users} />
          ) : page === "messages" ? (
            <Messages users={users} currentUser={currentUser} />
          ) : page === "alerts" ? (
            <Alerts inspections={accessibleInspections} onView={handleViewInspection} onUpdate={handleUpdateInspection} />
          ) : page === "defects" ? (
            <Defects currentUser={currentUser} users={users} />
          ) : page === "schedule" ? (
            <div>
              <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => exportToICS(accessibleInspections)}>
                  <Icon name="download" size={13} /> Export to Outlook/Google (.ics)
                </button>
              </div>
              <Schedule 
                inspections={accessibleInspections} 
                users={users} 
                onUpdate={handleDragUpdate} 
                onOpenModal={() => setShowScheduleModal(true)} 
                onReschedule={setReschedulingTask} 
                onBulkSchedule={() => setShowBulkModal(true)} 
              />
            </div>
          ) : page === "field_map" ? (
            <LiveMap 
              inspections={accessibleInspections} 
              users={users} 
              onRefresh={async () => { return; }} 
              refreshIntervalMs={45000} 
            />
          ) : page === "team" ? (
            <Team users={users} inspections={accessibleInspections} />
          ) : page === "monthly_report" ? (
            <MonthlyReport inspections={accessibleInspections} locations={locations} />
          ) : page === "reports" ? (
            <ReportsPage inspections={accessibleInspections} locations={locations} users={users} />
          ) : page === "users" ? (
            <UsersPage users={users} setUsers={setUsers} />
          ) : page === "locations" ? (
            <LocationsPage locations={locations} setLocations={setLocations} users={users} inspections={accessibleInspections} />
          ) : page === "templates" ? (
            <TemplatesPage />
          ) : page === "activity_report" ? (
            <ActivityReport auditLogs={auditLogs} users={users} />
          ) : page === "audit" ? (
            <AuditPage auditLogs={auditLogs} users={users} />
          ) : page === "notifications" ? (
            <Notifications 
              currentUser={currentUser} 
              onNavigate={handleNavigate} 
              inspections={accessibleInspections} 
              onStartInspection={handleStartInspection} 
              onAcceptTask={handleAcceptTask} 
              onDeclineTask={handleDeclineTask} 
            />
          ) : page === "capa" ? (
            <CapaManagement currentUser={currentUser} users={users} />
          ) : page === "settings" ? (
            <SettingsPage 
              inspections={accessibleInspections}
              setInspections={setInspections}
            /> 
          ) : null}
          </PageErrorBoundary>
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
      {promptModal && (
        <PromptModal
          title={promptModal.title}
          message={promptModal.message}
          placeholder={promptModal.placeholder}
          defaultValue={promptModal.defaultValue}
          confirmLabel={promptModal.confirmLabel || "Confirmar"}
          cancelLabel={promptModal.cancelLabel || "Cancelar"}
          danger={promptModal.danger}
          requireInput={promptModal.requireInput}
          showInput={promptModal.showInput}
          onConfirm={promptModal.onConfirm}
          onCancel={promptModal.onCancel}
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
