// /src/App.jsx
import { useState, useEffect } from "react";
import { Icon } from "./lib/icons";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Login from "./pages/Login";
import ErrorBoundary from "./components/ErrorBoundary";
import SignUp from "./pages/SignUp";
import NewInspectionModal from "./components/NewInspectionModal";
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
import { CommsProvider } from "./context/CommsContext";
import { getClientTemplate } from "./utils/excelTemplateImporter";
import { authService } from "./services/authService";
import { dataService } from "./services/dataService";
import { useComms } from "./context/CommsContext";
import { AuthProvider, useAuth } from "./context/AuthContext";


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


function AppContent() {
  const { notify } = useComms();
  
  // --- ESTADO COM PERSISTÊNCIA ---
  const { user: currentUser, setUser: setCurrentUser, showSignUp, setShowSignUp } = useAuth();
  
  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_PAGE);
    return saved || "dashboard";
  });
  
  const [inspections, setInspections] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.INSPECTIONS);
    return saved ? JSON.parse(saved) : genSeedInspections();
  });
  
  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    return saved ? JSON.parse(saved) : SEED_USERS;
  });
  
  const [locations, setLocations] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LOCATIONS);
    return saved ? JSON.parse(saved) : SEED_LOCATIONS;
  });
  
  const [auditLogs, setAuditLogs] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LOGS);
    return saved ? JSON.parse(saved) : [];
  });

  const [viewingInspection, setViewingInspection] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VIEWING_INSPECTION);
    return saved ? JSON.parse(saved) : null;
  });
  
  const [editingInspection, setEditingInspection] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.EDITING_INSPECTION);
    return saved ? JSON.parse(saved) : null;
  });
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [reschedulingTask, setReschedulingTask] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
    
  const [isInitialized, setIsInitialized] = useState(false);

  // --- PERSISTÊNCIA DE ESTADO ---
  // Salvar página atual sempre que mudar (apenas se usuário logado)
  useEffect(() => {
    if (currentUser && page) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_PAGE, page);
    }
  }, [page, currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(inspections));
  }, [inspections]);

  // Sync inspections to Supabase (debounced - saves 2s after last change)
  useEffect(() => {
    if (!currentUser || inspections.length === 0) return;
    const timeoutId = setTimeout(() => {
      dataService.syncInspections(inspections);
    }, 2000);
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspections]);

  // Sync locations to Supabase (debounced)
  useEffect(() => {
    if (!currentUser || locations.length === 0) return;
    const timeoutId = setTimeout(() => {
      dataService.syncLocations(locations);
    }, 2000);
    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations));
  }, [locations]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Persistir inspeção sendo editada/visualizada
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

  // Verificar se o usuário ainda está logado após refresh
  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        // Verificar se o usuário ainda existe na lista
        const userExists = users.some(u => u.id === user.id && u.active !== false);
        if (!userExists) {
          // Usuário foi removido ou desativado
          localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
          localStorage.removeItem(STORAGE_KEYS.CURRENT_PAGE);
          setCurrentUser(null);
          setPage("dashboard");
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        setCurrentUser(null);
      }
    }
    setIsInitialized(true);
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      authService.fetchAllUsers().then(result => {
        if (result.success && result.users && result.users.length > 0) {
          setUsers(prev => {
            const existingEmails = new Set(prev.map(u => (u.email || "").toLowerCase()));
            const existingIds = new Set(prev.map(u => String(u.id)));
            const newUsers = result.users.filter(u =>
              !existingIds.has(String(u.id)) &&
              !existingEmails.has((u.email || "").toLowerCase())
            );
            return newUsers.length > 0 ? [...prev, ...newUsers] : prev;
          });
        }
      });
    }
  }, [currentUser]);

  // Fetch inspections from Supabase on login
  useEffect(() => {
    if (currentUser) {
      console.log("[App] Fetching inspections from Supabase...");
      dataService.fetchInspections().then(result => {
        if (result.success && result.inspections && result.inspections.length > 0) {
          console.log("[App] Inspections from Supabase:", result.inspections.length);
          setInspections(prev => {
            const existingIds = new Set(prev.map(i => String(i.id)));
            const newInsps = result.inspections.filter(i => !existingIds.has(String(i.id)));
            return newInsps.length > 0 ? [...newInsps, ...prev] : prev;
          });
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Fetch locations from Supabase on login
  useEffect(() => {
    if (currentUser) {
      console.log("[App] Fetching locations from Supabase...");
      dataService.fetchLocations().then(result => {
        if (result.success && result.locations && result.locations.length > 0) {
          console.log("[App] Locations from Supabase:", result.locations.length);
          setLocations(prev => {
            const existingIds = new Set(prev.map(l => String(l.id)));
            const newLocs = result.locations.filter(l => !existingIds.has(String(l.id)));
            return newLocs.length > 0 ? [...newLocs, ...prev] : prev;
          });
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // ============================================
  // REAL-TIME: Live updates from other users
  // ============================================
  useEffect(() => {
    if (!currentUser) return;
    console.log("[App] Setting up real-time subscription...");

    const unsubscribe = dataService.subscribeToInspectionChanges((payload) => {
      if (payload.eventType === "INSERT") {
        const newIns = payload.new?.data;
        if (newIns) {
          setInspections(prev => {
            const exists = prev.some(i => String(i.id) === String(newIns.id));
            if (exists) return prev;
            // Show notification if created by someone else
            if (newIns.inspector_name && (newIns.inspector_name === currentUser.name || newIns.inspector_email === currentUser.email)) {
              // This inspection is for the current user — they should see it
              notify(currentUser.id,
                `Nova inspecao: ${newIns.location_name} por ${newIns.inspector_name}`,
                "inspections");
            }
            console.log("[App] Real-time: new inspection added:", newIns.location_name);
            return [newIns, ...prev];
          });
        }
      } else if (payload.eventType === "UPDATE") {
        const updated = payload.new?.data;
        if (updated) {
          setInspections(prev => prev.map(i =>
            String(i.id) === String(updated.id) ? updated : i
          ));
          console.log("[App] Real-time: inspection updated:", updated.id);
        }
      } else if (payload.eventType === "DELETE") {
        const deletedId = payload.old?.id;
        if (deletedId) {
          setInspections(prev => prev.filter(i => String(i.id) !== String(deletedId)));
          console.log("[App] Real-time: inspection deleted:", deletedId);
        }
      }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

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
    // MANUAL_LOCATION_SYNC: Force sync locations on login
    setTimeout(() => {
      const locs = JSON.parse(localStorage.getItem('fims_locations') || '[]');
      if (locs.length > 0) {
        console.log('[MANUAL] Syncing', locs.length, 'locations...');
        import('./services/dataService').then(({ dataService }) => {
          dataService.syncLocations(locs).then(r => {
            console.log('[MANUAL] Location sync result:', r);
          });
        });
      }
    }, 3000);
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
      // Don't overwrite items if ScheduleModal already set them
      if (task.items && task.items.length > 0) {
        const template = getClientTemplate(task.location_name);
        return {
          ...task,
          template_id: template?.clientId || "DEFAULT",
          template_version: template?.version || "1.0"
        };
      }
      const template = getClientTemplate(task.location_name);
      const templateSections = template?.sections || [];
      
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


  // DEBUG: Expose sync functions to browser console
  useEffect(() => {
    window.__syncLocs = () => {
      const locs = JSON.parse(localStorage.getItem("fims_locations") || "[]");
      console.log("[DEBUG] Locations in localStorage:", locs.length, locs);
      if (locs.length > 0) {
        dataService.syncLocations(locs).then(r => console.log("[DEBUG] Sync result:", r));
      } else {
        console.log("[DEBUG] No locations in localStorage. Using state:", locations.length);
        if (locations.length > 0) {
          dataService.syncLocations(locations).then(r => console.log("[DEBUG] Sync result:", r));
        }
      }
    };
    window.__syncInsps = () => {
      console.log("[DEBUG] Inspections:", inspections.length);
      dataService.syncInspections(inspections).then(r => console.log("[DEBUG] Sync result:", r));
    };
    console.log("[DEBUG] Run window.__syncLocs() to manually sync locations");
  });

  // --- RENDER ---
  if (!isInitialized) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div className="spinner"></div>
    </div>;
  }

  // Se não tem usuário logado, mostra Login
  if (!currentUser) {
    if (showSignUp) {
      return <SignUp onSignUpComplete={() => setShowSignUp(false)} switchToLogin={() => setShowSignUp(false)} />;
    }
    return <Login onLogin={handleLogin} onSignUp={() => setShowSignUp(true)} />;
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
    <ErrorBoundary>
      <AuthProvider>
      <LangProvider>
        <CommsProvider>
          <AppContent />
        </CommsProvider>
      </LangProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
