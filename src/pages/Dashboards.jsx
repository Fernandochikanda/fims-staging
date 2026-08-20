// /src/pages/Dashboards.jsx
import { jsPDF } from "jspdf";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import ScoreRing from "../components/ScoreRing";
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
// CEO DASHBOARD
// ============================================================
export function CEODashboard({ inspections, locations, auditLogs, currentUser }) {
  const { announcements, createAnnouncement } = useComms();
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [annText, setAnnText] = useState("");
  
  // Estado para avisos do sistema dispensados
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    const saved = localStorage.getItem(DISMISSED_SYSTEM_ALERTS_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Lista de avisos do sistema (estáticos + dinâmicos)
  const [systemAlerts, setSystemAlerts] = useState(() => {
    // Avisos fixos do sistema
    const fixedAlerts = [
      "O sistema está em revisão",
      "O sistema está sobre revisão!"
    ];
    
    // Adicionar avisos dos anúncios (que são avisos do sistema)
    const safeAnnouncements = Array.isArray(announcements) ? announcements : [];
    const announcementAlerts = safeAnnouncements
      .map(a => a.text)
      .filter(text => text && typeof text === 'string' && text.trim().length > 0);
    
    // Combinar e remover duplicados
    const allAlerts = [...fixedAlerts, ...announcementAlerts];
    // Filtrar valores undefined/null e remover duplicados
    return [...new Set(allAlerts.filter(alert => alert && typeof alert === 'string' && alert.trim().length > 0))];
  });

  // Filtrar avisos não dispensados - CORRIGIDO com verificação de segurança
  const visibleAlerts = systemAlerts.filter((alert, index) => {
    // Verificar se alert é válido
    if (!alert || typeof alert !== 'string' || alert.trim().length === 0) {
      return false;
    }
    const alertId = `alert_${index}_${alert.substring(0, 30)}`;
    return !dismissedAlerts.includes(alertId);
  });

  // Função para dispensar aviso
  const dismissSystemAlert = (alertText, index) => {
    if (!alertText || typeof alertText !== 'string') return;
    const alertId = `alert_${index}_${alertText.substring(0, 30)}`;
    const newDismissed = [...dismissedAlerts, alertId];
    setDismissedAlerts(newDismissed);
    localStorage.setItem(DISMISSED_SYSTEM_ALERTS_KEY, JSON.stringify(newDismissed));
  };

  // Resetar avisos (admin/CEO)
  const resetSystemAlerts = () => {
    if (currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.CEO) {
      setDismissedAlerts([]);
      localStorage.removeItem(DISMISSED_SYSTEM_ALERTS_KEY);
    }
  };

  const submitted = inspections.filter(i => ["submitted", "reviewed", "closed"].includes(i.status));
  const avgScore = submitted.length ? Math.round(submitted.reduce((s, i) => s + (i.score_pct || 0), 0) / submitted.length) : 0;
  const critical = inspections.filter(i => i.alert_level === "critical" && !i.resolved).length;
  const trendData = getMonthlyTrend(inspections);
  const riskClients = getClientRisk(inspections, locations);
  const performers = getTopBottomPerformers(inspections, locations);
  const analytics = getCompanyAnalytics(inspections);
  
  const slaCompliance = Math.round((locations.filter(l => { const li = submitted.filter(i => i.location_id === l.id); return li.length ? (li.reduce((s,i) => s+i.score_pct, 0) / li.length) >= SLA_TARGET : false; }).length / locations.length) * 100);
  const failedSlaCount = locations.length - Math.round((slaCompliance / 100) * locations.length);
  const estimatedPenaltyRisk = failedSlaCount * 15000;
  const excellentClients = locations.filter(l => { const li = submitted.filter(i => i.location_id === l.id); return li.length ? (li.reduce((s,i) => s+i.score_pct, 0) / li.length) >= 95 : false; }).length;
  const inspectorBonusPool = excellentClients * 5000;

  const highLevelLogs = auditLogs.filter(l => ["review", "notification", "schedule", "capa_alert"].includes(l.type)).slice(0, 5);

  const handleBoardroomPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22); doc.text("FIMS - Executive Summary", 14, 22);
    doc.setFontSize(12); doc.text(`Date: ${new Date().toLocaleDateString("pt-PT")}`, 14, 30);
    doc.setFontSize(16); doc.text("Global KPIs", 14, 45);
    doc.setFontSize(12);
    doc.text(`Overall Company Score: ${avgScore}%`, 14, 55);
    doc.text(`SLA Compliance (Target ${SLA_TARGET}%): ${slaCompliance}%`, 14, 63);
    doc.text(`Active Critical Alerts: ${critical}`, 14, 71);
    doc.text(`Financial Penalty Risk: ${estimatedPenaltyRisk.toLocaleString()} MT`, 14, 79);
    doc.text(`Inspector Bonus Pool: ${inspectorBonusPool.toLocaleString()} MT`, 14, 87);
    doc.setFontSize(16); doc.text("Top 3 Performing Clients", 14, 105);
    doc.setFontSize(12);
    performers.top.forEach((p, i) => doc.text(`${i+1}. ${p.name} (${p.avg}%)`, 14, 115 + (i*8)));
    doc.setFontSize(16); doc.text("Bottom 3 Clients (Needs Attention)", 14, 145);
    doc.setFontSize(12);
    performers.bottom.forEach((p, i) => doc.text(`${i+1}. ${p.name} (${p.avg}%)`, 14, 155 + (i*8)));
    doc.setFontSize(16); doc.text("High Churn Risk / SLA Failures", 14, 185);
    doc.setFontSize(12);
    if (riskClients.length === 0) doc.text("None", 14, 195);
    riskClients.slice(0, 5).forEach((c, i) => doc.text(`- ${c.name} (Avg: ${c.avg}%)`, 14, 195 + (i*8)));
    doc.save("FIMS-Executive-Summary.pdf");
  };

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Dashboard Executivo</div><div className="page-sub">Strategic Overview & Risk Management</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAnnModal(true)}><Icon name="bell" size={13} /> Broadcast</button>
          <button className="btn btn-primary btn-sm" onClick={handleBoardroomPDF}><Icon name="download" size={13} /> Boardroom PDF</button>
        </div>
      </div>

      {/* Avisos do Sistema - com persistência */}
      {visibleAlerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {visibleAlerts.map((alert, index) => (
            <div 
              key={`alert_${index}`}
              className="alert-bar alert-info" 
              style={{ 
                justifyContent: "space-between",
                backgroundColor: "#FEF3C7",
                borderLeft: "3px solid #F59E0B",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 12
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ fontSize: 13, color: "#92400E" }}>
                  <strong>Aviso do Sistema:</strong> {alert}
                </span>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => dismissSystemAlert(alert, index)}
                style={{
                  backgroundColor: "#F59E0B",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                OK Recebido
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Botão resetar avisos (apenas admin/CEO) */}
      {(currentUser.role === ROLES.ADMIN || currentUser.role === ROLES.CEO) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={resetSystemAlerts}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: 11,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Resetar avisos
          </button>
        </div>
      )}

      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">Global Score</div><div className="metric-value" style={{ color: scoreLabel(avgScore).color }}>{avgScore}%</div></div>
        <div className="metric-card"><div className="metric-label">SLA Compliance ({SLA_TARGET}%)</div><div className="metric-value" style={{ color: slaCompliance >= 80 ? "#0F6E56" : "#A32D2D" }}>{slaCompliance}%</div></div>
        <div className="metric-card"><div className="metric-label">Penalty Risk</div><div className="metric-value" style={{ color: estimatedPenaltyRisk > 0 ? "#A32D2D" : "#3B6D11" }}>{estimatedPenaltyRisk.toLocaleString()} MT</div></div>
        <div className="metric-card"><div className="metric-label">Bonus Pool</div><div className="metric-value" style={{ color: "#0F6E56" }}>{inspectorBonusPool.toLocaleString()} MT</div></div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>6-Month Quality & Alert Trend</h3>
          <div style={{ width: "100%", height: 250 }}>
            <ResponsiveContainer>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="Score" stroke="#1E2A3A" strokeWidth={3} />
                <Line type="monotone" dataKey="Alertas" stroke="#A32D2D" strokeWidth={2} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Top & Bottom Performers</h3>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#3B6D11", fontWeight: 600, marginBottom: 8 }}>🏆 Top 3 Clients</div>
            {performers.top.map((p, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #eee" }}><span>{p.name}</span><span style={{ fontWeight: 600, color: "#3B6D11" }}>{p.avg}%</span></div>))}
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#A32D2D", fontWeight: 600, marginBottom: 8 }}>⚠️ Bottom 3 Clients</div>
            {performers.bottom.map((p, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #eee" }}><span>{p.name}</span><span style={{ fontWeight: 600, color: "#A32D2D" }}>{p.avg}%</span></div>))}
          </div>
        </div>
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
          <h3 style={{ fontSize: 15, marginBottom: 12, color: "#A32D2D" }}>Client Churn Risk & SLA Failures</h3>
          {riskClients.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>All clients are within SLA targets.</div>}
          {riskClients.map(c => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <div><div style={{ fontWeight: 500, fontSize: 14 }}>{c.name}</div><div style={{ fontSize: 11, color: "#888" }}>Last Score: {c.lastScore}%</div></div>
              <div style={{ display: "flex", gap: 8 }}>
                {c.churnRisk && <span className="badge badge-critical">Churn Risk</span>}
                {c.belowSla && <span className="badge badge-warning">Below SLA</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Management Activity Log</h3>
          {highLevelLogs.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No recent management activity.</div>}
          {highLevelLogs.map(log => (
            <div key={log.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <StatusBadge status={log.type === "review" ? "reviewed" : log.type === "capa_alert" ? "critical" : log.type === "notification" ? "submitted" : "progress"} />
              <div><div style={{ fontSize: 13, fontWeight: 500 }}>{log.user} - {log.action}</div><div style={{ fontSize: 11, color: "#888" }}>{log.detail}</div></div>
            </div>
          ))}
        </div>
      </div>

      {showAnnModal && (
        <div className="modal-overlay" onClick={() => setShowAnnModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header"><div style={{ fontSize: 15, fontWeight: 500 }}>Criar Aviso Geral</div><button className="icon-btn" onClick={() => setShowAnnModal(false)}><Icon name="x" size={14} /></button></div>
            <div className="modal-body">
              <textarea className="form-textarea" placeholder="Escreva o aviso para toda a equipa..." value={annText} onChange={e => setAnnText(e.target.value)}></textarea>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAnnModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => { 
                if (annText && annText.trim()) {
                  createAnnouncement(annText, currentUser.name); 
                  // Adicionar ao sistema de avisos
                  setSystemAlerts(prev => {
                    const newAlerts = [...prev, annText.trim()];
                    return [...new Set(newAlerts.filter(a => a && typeof a === 'string' && a.trim().length > 0))];
                  });
                }
                setShowAnnModal(false); 
                setAnnText(""); 
              }}>Publicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SUPERVISOR DASHBOARD
// ============================================================
export function SupervisorDashboard({ inspections, users, currentUser, onView }) {
  const { announcements } = useComms();
  
  // Estado para avisos do sistema dispensados
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    const saved = localStorage.getItem(DISMISSED_SYSTEM_ALERTS_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Lista de avisos do sistema
  const [systemAlerts, setSystemAlerts] = useState(() => {
    const safeAnnouncements = Array.isArray(announcements) ? announcements : [];
    const fixedAlerts = ["O sistema está em revisão", "O sistema está sobre revisão!"];
    const announcementAlerts = safeAnnouncements
      .map(a => a.text)
      .filter(text => text && typeof text === 'string' && text.trim().length > 0);
    const allAlerts = [...fixedAlerts, ...announcementAlerts];
    return [...new Set(allAlerts.filter(alert => alert && typeof alert === 'string' && alert.trim().length > 0))];
  });

  // Filtrar avisos não dispensados - CORRIGIDO
  const visibleAlerts = systemAlerts.filter((alert, index) => {
    if (!alert || typeof alert !== 'string' || alert.trim().length === 0) {
      return false;
    }
    const alertId = `alert_${index}_${alert.substring(0, 30)}`;
    return !dismissedAlerts.includes(alertId);
  });

  // Função para dispensar aviso
  const dismissSystemAlert = (alertText, index) => {
    if (!alertText || typeof alertText !== 'string') return;
    const alertId = `alert_${index}_${alertText.substring(0, 30)}`;
    const newDismissed = [...dismissedAlerts, alertId];
    setDismissedAlerts(newDismissed);
    localStorage.setItem(DISMISSED_SYSTEM_ALERTS_KEY, JSON.stringify(newDismissed));
  };

  const myInsp = inspections.filter(i => i.supervisor_id === currentUser.id || true);
  const teamCount = users.filter(u => u.role === ROLES.INSPECTOR).length;
  const pending = myInsp.filter(i => i.status === "pending" || i.status === "in_progress").length;
  const underReview = myInsp.filter(i => i.status === "submitted").length;
  const alerts = myInsp.filter(i => i.alert_level === "critical" && !i.resolved).length;
  const submitted = myInsp.filter(i => i.score_pct !== null);
  const avgScore = submitted.length ? Math.round(submitted.reduce((s, i) => s + i.score_pct, 0) / submitted.length) : 0;
  const completedThisMonth = submitted.filter(i => i.date.startsWith(new Date().toISOString().split("T")[0].substring(0, 7))).length;
  const totalThisMonth = myInsp.filter(i => i.date.startsWith(new Date().toISOString().split("T")[0].substring(0, 7))).length;
  const reviewList = myInsp.filter(i => i.status === "submitted").slice(0, 5);
  const criticalAlerts = myInsp.filter(i => i.alert_level === "critical" && !i.resolved).slice(0, 5);
  
  const analytics = getCompanyAnalytics(inspections);

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Welcome, {currentUser.name}</div><div className="page-sub">Supervisor Dashboard</div></div></div>
      
      {/* Avisos do Sistema - com persistência */}
      {visibleAlerts.map((alert, index) => (
        <div 
          key={`alert_${index}`}
          className="alert-bar alert-info" 
          style={{ 
            justifyContent: "space-between",
            backgroundColor: "#FEF3C7",
            borderLeft: "3px solid #F59E0B",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ fontSize: 13, color: "#92400E" }}>
              <strong>Aviso:</strong> {alert}
            </span>
          </div>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => dismissSystemAlert(alert, index)}
            style={{
              backgroundColor: "#F59E0B",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "4px 14px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            OK Recebido
          </button>
        </div>
      ))}

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
  const { announcements } = useComms();
  
  // Estado para avisos do sistema dispensados
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    const saved = localStorage.getItem(DISMISSED_SYSTEM_ALERTS_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Lista de avisos do sistema
  const [systemAlerts, setSystemAlerts] = useState(() => {
    const safeAnnouncements = Array.isArray(announcements) ? announcements : [];
    const fixedAlerts = ["O sistema está em revisão", "O sistema está sobre revisão!"];
    const announcementAlerts = safeAnnouncements
      .map(a => a.text)
      .filter(text => text && typeof text === 'string' && text.trim().length > 0);
    const allAlerts = [...fixedAlerts, ...announcementAlerts];
    return [...new Set(allAlerts.filter(alert => alert && typeof alert === 'string' && alert.trim().length > 0))];
  });

  // Filtrar avisos não dispensados - CORRIGIDO
  const visibleAlerts = systemAlerts.filter((alert, index) => {
    if (!alert || typeof alert !== 'string' || alert.trim().length === 0) {
      return false;
    }
    const alertId = `alert_${index}_${alert.substring(0, 30)}`;
    return !dismissedAlerts.includes(alertId);
  });

  // Função para dispensar aviso
  const dismissSystemAlert = (alertText, index) => {
    if (!alertText || typeof alertText !== 'string') return;
    const alertId = `alert_${index}_${alertText.substring(0, 30)}`;
    const newDismissed = [...dismissedAlerts, alertId];
    setDismissedAlerts(newDismissed);
    localStorage.setItem(DISMISSED_SYSTEM_ALERTS_KEY, JSON.stringify(newDismissed));
  };

  const myInsp = inspections.filter(i => i.inspector_id === currentUser.id && i.type !== "leave");
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

      {/* Avisos do Sistema - com persistência */}
      {visibleAlerts.map((alert, index) => (
        <div 
          key={`alert_${index}`}
          className="alert-bar alert-info" 
          style={{ 
            justifyContent: "space-between",
            backgroundColor: "#FEF3C7",
            borderLeft: "3px solid #F59E0B",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ fontSize: 13, color: "#92400E" }}>
              <strong>Aviso:</strong> {alert}
            </span>
          </div>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => dismissSystemAlert(alert, index)}
            style={{
              backgroundColor: "#F59E0B",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "4px 14px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            OK Recebido
          </button>
        </div>
      ))}

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
                  <div><div style={{ fontWeight: 500, fontSize: 14 }}>{insp.location_name}</div><div style={{ color: "#888", fontSize: 12 }}>{insp.date} às {insp.start_time || 'N/A'}</div></div>
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
                  <div><div style={{ fontWeight: 500, fontSize: 14 }}>{insp.location_name}</div><div style={{ color: "#888", fontSize: 12 }}>{insp.date}</div></div>
                  <button className="btn btn-primary btn-sm" onClick={() => onStartInspection(insp)}>{t.start}</button>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>{t.drafts}</h3>
            {drafts.length === 0 ? <div style={{ color: "#888", fontSize: 13, padding: 16, textAlign: "center" }}>{t.no_drafts}</div> : drafts.map(insp => (
              <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                <div><div style={{ fontWeight: 500, fontSize: 14 }}>{insp.location_name}</div><div style={{ color: "#888", fontSize: 12 }}>{insp.date}</div></div>
                <button className="btn btn-secondary btn-sm" onClick={() => onStartInspection(insp)}>{t.continue}</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 15 }}>{t.recent_activity}</h3>
          {recent.length === 0 ? <div style={{ color: "#888", fontSize: 13, padding: 16, textAlign: "center" }}>{t.no_recent}</div> : recent.slice(0, 6).map(insp => (
            <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
              <div><div style={{ fontWeight: 500, fontSize: 14 }}>{insp.location_name}</div><div style={{ color: "#888", fontSize: 12 }}>{insp.date} · <StatusBadge status={insp.status} /></div></div>
              {insp.score_pct !== null && <ScoreRing pct={insp.score_pct} size={32} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
