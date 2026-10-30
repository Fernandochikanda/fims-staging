// src/pages/Dashboards.jsx
import { jsPDF } from "jspdf";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import ScoreTrendChart from "../components/ScoreTrendChart";
import ScoreRing from "../components/ScoreRing";
import CEODashboardView from "../components/CEODashboardView";
import StatusBadge from "../components/StatusBadge";
import { Icon } from "../lib/icons";
import { calcScore, scoreLabel, getMonthlyTrend, getClientRisk, getTopBottomPerformers, SLA_TARGET, getCategoryHealth } from "../lib/helpers";
import { ROLES, TEMPLATE_SECTIONS } from "../data/constants";
import { useLang } from "../context/LangContext";
import { useComms } from "../context/CommsContext";
import { useState, useEffect } from "react";

// Chave para localStorage dos avisos dispensados
const DISMISSED_SYSTEM_ALERTS_KEY = "fims_dismissed_system_alerts";

// Helper to calculate company-wide analytics
function getCompanyAnalytics(inspections) {
  const submitted = inspections.filter(i => i.score_pct !== null);
  const catScores = {};
  const issueMap = {};

  submitted.forEach(insp => {
    if (!insp.items) return;
    insp.items.forEach(item => {
      if (item.score !== null) {
        const secName = TEMPLATE_SECTIONS.find(s => s.id === item.section_id)?.name || "Unknown";
        if (!catScores[secName]) catScores[secName] = { total: 0, count: 0 };
        catScores[secName].total += item.score;
        catScores[secName].count++;

        if (item.score <= 2) {
          if (!issueMap[item.text]) issueMap[item.text] = 0;
          issueMap[item.text]++;
        }
      }
    });
  });

  const lowestCategories = Object.keys(catScores).map(name => ({
    name,
    avg: Number((catScores[name].total / catScores[name].count).toFixed(1))
  })).sort((a, b) => a.avg - b.avg).slice(0, 3);

  const commonIssues = Object.keys(issueMap).map(text => ({ text, count: issueMap[text] }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  return { lowestCategories, commonIssues };
}

// ============================================================
// HOOK PERSONALIZADO PARA AVISOS DO SISTEMA
// Remove avisos hardcoded, usa apenas anúncios reais
// ============================================================
function useSystemAlerts() {
  const { announcements, dismissAnnouncement, confirmAnnouncement } = useComms();
  const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
  
  const [dismissedIds, setDismissedIds] = useState(() => {
    const saved = localStorage.getItem(DISMISSED_SYSTEM_ALERTS_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Filtrar apenas anúncios NÃO dispensados pelo utilizador atual
  const visibleAlerts = (announcements || []).filter(announcement => {
    if (!announcement || !announcement.id) return false;
    
    // Verificar se foi dispensado
    const dismissedBy = announcement.dismissedBy || [];
    const isDismissed = dismissedBy.includes(currentUser?.id) || dismissedIds.includes(announcement.id);
    
    return !isDismissed;
  });

  // Dismissar um aviso
  const handleDismiss = (announcementId) => {
    // Atualizar no CommsContext (que sincroniza com Supabase se disponível)
    if (confirmAnnouncement) {
      confirmAnnouncement(announcementId, currentUser?.id);
    } else if (dismissAnnouncement) {
      dismissAnnouncement(announcementId, currentUser?.id);
    }
    
    // Também guardar localmente como backup
    setDismissedIds(prev => {
      const updated = [...prev, announcementId];
      localStorage.setItem(DISMISSED_SYSTEM_ALERTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Resetar avisos (apenas para admin/CEO)
  const resetAlerts = () => {
    if (currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.CEO) {
      setDismissedIds([]);
      localStorage.removeItem(DISMISSED_SYSTEM_ALERTS_KEY);
    }
  };

  return {
    visibleAlerts,
    handleDismiss,
    resetAlerts,
    canReset: currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.CEO
  };
}

// ============================================================
// COMPONENTE DE AVISO REUTILIZÁVEL
// ============================================================
function SystemAlertBanner({ alert, onDismiss }) {
  if (!alert) return null;
  
  const fromUser = alert.fromId ? 
    JSON.parse(localStorage.getItem('fims_users') || '[]').find(u => u.id === alert.fromId)?.name 
    : null;

  return (
    <div 
      style={{ 
        backgroundColor: "#FEF3C7",
        borderLeft: "3px solid #F59E0B",
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>📢</span>
        <div>
          {alert.title && (
            <div style={{ fontSize: 13, fontWeight: 600, color: "#92400E", marginBottom: 2 }}>
              {alert.title}
            </div>
          )}
          <span style={{ fontSize: 13, color: "#78350F" }}>
            {alert.text || alert.title}
          </span>
          {fromUser && (
            <span style={{ fontSize: 11, color: "#A16207", marginLeft: 8 }}>
              — {fromUser}
            </span>
          )}
          {alert.timestamp && (
            <span style={{ fontSize: 10, color: "#A16207", marginLeft: 8 }}>
              {new Date(alert.timestamp).toLocaleString("pt-PT", { 
                day: '2-digit', 
                month: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          )}
        </div>
      </div>
      <button 
        onClick={() => onDismiss(alert.id)}
        style={{
          backgroundColor: "#F59E0B",
          color: "white",
          border: "none",
          borderRadius: 6,
          padding: "6px 16px",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background-color 0.2s"
        }}
        onMouseEnter={e => e.target.style.backgroundColor = "#D97706"}
        onMouseLeave={e => e.target.style.backgroundColor = "#F59E0B"}
      >
        OK Recebido
      </button>
    </div>
  );
}

// ============================================================
// CEO DASHBOARD
// ============================================================
export function CEODashboard({ inspections, locations, auditLogs, currentUser, onView }) {
  return <CEODashboardView inspections={inspections} locations={locations} auditLogs={auditLogs} currentUser={currentUser} onView={onView} />;
}

export function SupervisorDashboard({ inspections, users, currentUser, onView }) {
  // Usar o hook personalizado (sem avisos hardcoded)
  const { visibleAlerts, handleDismiss } = useSystemAlerts();

  const [period, setPeriod] = useState("month");
  const periodDays = period === "week" ? 7 : period === "month" ? 30 : period === "quarter" ? 90 : 36500;
  const cutoff = Date.now() - periodDays * 86400000;
  const myInsp = inspections.filter(i => i.type !== "leave" && i.date && new Date(i.date).getTime() >= cutoff);
  
  const teamCount = users.filter(u => u.role === ROLES.INSPECTOR).length;
  const pending = myInsp.filter(i => i.status === "pending" || i.status === "in_progress").length;
  const underReview = myInsp.filter(i => i.status === "submitted").length;
  const alerts = myInsp.filter(i => i.alert_level === "critical" && !i.resolved).length;
  const submitted = myInsp.filter(i => i.score_pct !== null);
  const avgScore = submitted.length ? Math.round(submitted.reduce((s, i) => s + i.score_pct, 0) / submitted.length) : 0;
  const completedThisMonth = submitted.filter(i => i.date?.startsWith(new Date().toISOString().split("T")[0].substring(0, 7))).length;
  const totalThisMonth = myInsp.filter(i => i.date?.startsWith(new Date().toISOString().split("T")[0].substring(0, 7))).length;
  const reviewList = myInsp.filter(i => i.status === "submitted").slice(0, 5);
  const criticalAlerts = myInsp.filter(i => i.alert_level === "critical" && !i.resolved).slice(0, 5);
  
  const analytics = getCompanyAnalytics(inspections);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Welcome, {currentUser.name}</div>
          <div className="page-sub">Supervisor Dashboard</div>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)} className="form-select" style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}>
          <option value="week">Esta semana</option>
          <option value="month">Este mês</option>
          <option value="quarter">Este trimestre</option>
          <option value="year">Este ano</option>
        </select>
      </div>
      {(() => { const pending = inspections.filter(i => i.status === 'submitted' && i.type !== 'leave'); if (pending.length === 0) return null; return (<div className="card" style={{ marginBottom: 16, padding: 14, borderLeft: "4px solid #F4A51C", background: "#FFF7ED" }}><div style={{ fontSize: 14, fontWeight: 600, color: "#BA7517" }}>{pending.length} inspecao(oes) aguardando revisao</div></div>); })()}
      
      {/* Avisos do Sistema - APENAS ANÚNCIOS REAIS */}
      {visibleAlerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {visibleAlerts.map(alert => (
            <SystemAlertBanner 
              key={alert.id} 
              alert={alert} 
              onDismiss={handleDismiss} 
            />
          ))}
        </div>
      )}

      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">My Team</div><div className="metric-value" style={{ color: "#1E2A3A" }}>{teamCount}</div></div>
        <div className="metric-card"><div className="metric-label">Pending</div><div className="metric-value" style={{ color: "#185FA5" }}>{pending}</div></div>
        <div className="metric-card"><div className="metric-label">Under Review</div><div className="metric-value" style={{ color: "#534AB7" }}>{underReview}</div></div>
        <div className="metric-card"><div className="metric-label">Alerts</div><div className="metric-value" style={{ color: alerts ? "#A32D2D" : "#3B6D11" }}>{alerts}</div></div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12, color: "#A32D2D" }}>Lowest Scoring Categories (Company-wide)</h3>
          {analytics.lowestCategories.map((cat, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "#444" }}>{cat.name}</span>
                <span style={{ fontWeight: 600, color: cat.avg <= 2 ? "#A32D2D" : "#BA7517" }}>{cat.avg} / 5.0</span>
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${(cat.avg/5)*100}%`, background: cat.avg <= 2 ? "#A32D2D" : "#BA7517" }} /></div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12, color: "#A32D2D" }}>Most Common Issues (Score 1-2)</h3>
          {analytics.commonIssues.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No critical issues found.</div>}
          {analytics.commonIssues.map((issue, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ fontSize: 13, fontWeight: 500, flex: 1, paddingRight: 8 }}>{issue.text}</div>
              <span className="badge badge-critical">{issue.count}x</span>
            </div>
          ))}
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Overall Productivity</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <ScoreRing pct={avgScore} size={64} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
              <div><div style={{ fontSize: 11, color: "#888" }}>Completed</div><div style={{ fontSize: 16, fontWeight: 600 }}>{completedThisMonth}</div></div>
              <div><div style={{ fontSize: 11, color: "#888" }}>Total (Month)</div><div style={{ fontSize: 16, fontWeight: 600 }}>{totalThisMonth}</div></div>
              <div><div style={{ fontSize: 11, color: "#888" }}>Criticals</div><div style={{ fontSize: 16, fontWeight: 600, color: "#A32D2D" }}>{criticalAlerts.length}</div></div>
            </div>
          </div>
          <h4 style={{ fontSize: 13, marginBottom: 8, color: "#888" }}>Inspections Under Review</h4>
          {reviewList.length === 0 && <div style={{ fontSize: 12, color: "#ccc" }}>No inspections waiting for review.</div>}
          {reviewList.map(insp => (
            <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee", cursor: "pointer" }} onClick={() => onView(insp)}>
              <div><div style={{ fontWeight: 500, fontSize: 13 }}>{insp.location_name}</div><div style={{ fontSize: 11, color: "#888" }}>{insp.inspector_name}</div></div>
              <ScoreRing pct={insp.score_pct} size={32} />
            </div>
          ))}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12, color: "#A32D2D" }}>Critical Alerts</h3>
          {criticalAlerts.length === 0 && <div style={{ fontSize: 12, color: "#ccc" }}>No critical alerts.</div>}
          {criticalAlerts.map(insp => (
            <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee", cursor: "pointer" }} onClick={() => onView({...insp, onlyFaults: true})}>
              <div><div style={{ fontWeight: 500, fontSize: 13 }}>{insp.location_name}</div><div style={{ fontSize: 11, color: "#888" }}>{insp.inspector_name}</div></div>
              <StatusBadge status="critical" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// INSPECTOR DASHBOARD
// ============================================================
export function InspectorDashboard({ inspections, users, currentUser, onStartInspection, onAcceptTask, onDeclineTask, onRequestLeave }) {
  const { t } = useLang();
  
  // Usar o hook personalizado (sem avisos hardcoded)
  const { visibleAlerts, handleDismiss } = useSystemAlerts();

  // ===== FIXED FILTER (handles ID type mismatch + name fallback) =====
  const myInsp = inspections.filter(i => {
    if (i.type === "leave") return false;

    if (String(i.inspector_id) === String(currentUser.id)) return true;

    if (
      i.inspector_name &&
      currentUser.name &&
      i.inspector_name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()
    ) {
      return true;
    }

    return false;
  });

  const pendingAcceptance = myInsp.filter(i => i.status === "pending_acceptance");
  const assigned = myInsp.filter(i => i.status === "pending");
  const drafts = myInsp.filter(i => i.status === "in_progress" || i.status === "needs_corrections");
  const recent = myInsp.filter(i => ["submitted", "reviewed", "closed"].includes(i.status));
  const today = new Date().toISOString().split("T")[0];
  const completedToday = recent.filter(i => i.date === today).length;

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text("Relatório Diário de Inspeções", 14, 22);
    doc.setFontSize(12); doc.text(`Inspetor: ${currentUser.name}`, 14, 30); doc.text(`Data: ${new Date().toLocaleDateString("pt-PT")}`, 14, 38);
    let y = 50; doc.setFontSize(14); doc.text("Atividade Recente:", 14, y); y += 8; doc.setFontSize(11);
    if (recent.length === 0) doc.text("Nenhuma inspeção recente.", 14, y);
    else { recent.slice(0, 10).forEach((insp, i) => { doc.text(`${i + 1}. ${insp.location_name} - ${insp.date} - ${insp.status} - Score: ${insp.score_pct || 0}%`, 14, y); y += 8; }); }
    doc.save("relatorio-diario.pdf");
  };

  return (
    <div>
      {(() => {
        const today = new Date().toISOString().split('T')[0];
        const myI = inspections.filter(i => String(i.inspector_id) === String(currentUser.id) && i.type !== 'leave');
        const dueToday = myI.filter(i => i.date === today && !['submitted','reviewed','closed','deleted'].includes(i.status));
        const overdue = myI.filter(i => { if (['submitted','reviewed','closed','deleted'].includes(i.status) || !i.date) return false; return new Date(i.date).getTime() < Date.now() - 48*3600000; });
        if (dueToday.length === 0 && overdue.length === 0) return null;
        return (<div className="card" style={{ marginBottom: 16, padding: 14, borderLeft: "4px solid #A32D2D", background: "#FEF2F2" }}>{dueToday.length > 0 && <div style={{ fontSize: 14, fontWeight: 600, color: "#A32D2D", marginBottom: 4 }}>{dueToday.length} inspecao(oes) marcadas para hoje</div>}{overdue.length > 0 && <div style={{ fontSize: 14, fontWeight: 600, color: "#A32D2D" }}>{overdue.length} inspecao(oes) em atraso (> 48h)</div>}</div>);
      })()}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: 12 }} className="no-print">
        <div>
          <div style={{ fontSize: "22px", fontWeight: 600 }}>{t.welcome}, {currentUser.name}</div>
          <div style={{ fontSize: 14, color: "#888" }}>Here's your inspection schedule for today.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleDownloadPDF}><Icon name="download" size={14} /> Daily PDF</button>
          <button className="btn btn-secondary" onClick={() => onRequestLeave(currentUser)}><Icon name="clipboard" size={14} /> Pedir Folga</button>
        </div>
      </div>

      {/* Avisos do Sistema - APENAS ANÚNCIOS REAIS */}
      {visibleAlerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {visibleAlerts.map(alert => (
            <SystemAlertBanner 
              key={alert.id} 
              alert={alert} 
              onDismiss={handleDismiss} 
            />
          ))}
        </div>
      )}

      <div className="metric-grid" style={{ marginBottom: 24 }}>
        <div className="metric-card"><div className="metric-label">Pending Acceptance</div><div className="metric-value" style={{ color: "#EF9F27" }}>{pendingAcceptance.length}</div></div>
        <div className="metric-card"><div className="metric-label">{t.assigned} Today</div><div className="metric-value" style={{ color: "#185FA5" }}>{assigned.length}</div></div>
        <div className="metric-card"><div className="metric-label">{t.drafts}</div><div className="metric-value" style={{ color: "#534AB7" }}>{drafts.length}</div></div>
        <div className="metric-card"><div className="metric-label">Completed Today</div><div className="metric-value" style={{ color: "#0F6E56" }}>{completedToday}</div></div>
      </div>

      <div className="two-col">
        <div>
          {pendingAcceptance.length > 0 && (
            <div className="card" style={{ marginBottom: 16, borderLeft: "3px solid #EF9F27" }}>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>Tarefas por Aceitar</h3>
              {pendingAcceptance.map(insp => (
                <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{insp.location_name}</div>
                    <div style={{ color: "#888", fontSize: 12 }}>{insp.date} às {insp.start_time || 'N/A'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => onAcceptTask(insp)}>Aceitar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => onDeclineTask(insp)}>Recusar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {assigned.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>{t.assigned}</h3>
              {assigned.map(insp => (
                <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{insp.location_name}</div>
                    <div style={{ color: "#888", fontSize: 12 }}>{insp.date}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => onStartInspection(insp)}>{t.start}</button>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>{t.drafts}</h3>
            {drafts.length === 0 ? (
              <div style={{ color: "#888", fontSize: 13, padding: 16, textAlign: "center" }}>{t.no_drafts}</div>
            ) : (
              drafts.map(insp => (
                <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{insp.location_name}</div>
                    <div style={{ color: "#888", fontSize: 12 }}>{insp.date}</div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => onStartInspection(insp)}>{t.continue}</button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 15 }}>{t.recent_activity}</h3>
          {recent.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13, padding: 16, textAlign: "center" }}>{t.no_recent}</div>
          ) : (
            recent.slice(0, 6).map(insp => (
              <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{insp.location_name}</div>
                  <div style={{ color: "#888", fontSize: 12 }}>{insp.date} · <StatusBadge status={insp.status} /></div>
                </div>
                {insp.score_pct !== null && <ScoreRing pct={insp.score_pct} size={32} />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
