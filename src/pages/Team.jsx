import { useState } from "react";
import { ROLES } from "../data/constants";
import ScoreRing from "../components/ScoreRing";
import StatusBadge from "../components/StatusBadge";
import { Icon } from "../lib/icons";

export default function Team({ users, inspections }) {
  const [selectedInspector, setSelectedInspector] = useState(null);
  const inspectors = users.filter(u => u.role === ROLES.INSPECTOR);

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Desempenho da Equipa (KPIs)</div><div className="page-sub">Clique no avatar para ver detalhes</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
        {inspectors.map(insp => {
          const myInspections = inspections.filter(i => i.inspector_id === insp.id && i.type !== "leave");
          const completed = myInspections.filter(i => i.score_pct !== null);
          const avgScore = completed.length ? Math.round(completed.reduce((s, i) => s + i.score_pct, 0) / completed.length) : 0;
          const pending = myInspections.filter(i => i.status === "pending" || i.status === "in_progress").length;
          const alerts = myInspections.filter(i => i.alert_level === "critical" || i.alert_level === "warning").length;
          const declines = myInspections.filter(i => i.accepted === false).length;
          
          return (
            <div key={insp.id} className="card" style={{ cursor: "pointer", transition: "transform 0.2s" }} onClick={() => setSelectedInspector(insp)}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ 
                  width: 48, height: 48, borderRadius: "50%", background: "#1E2A3A", color: "#fff", 
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 16,
                  border: "2px solid #378ADD"
                }}>
                  {insp.avatar}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{insp.name}</div>
                  <div style={{ color: "#888", fontSize: 12 }}>Inspetor de Campo</div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div><div style={{ fontSize: 11, color: "#888" }}>Score Médio</div><div style={{ fontSize: 13, fontWeight: 500 }}>{avgScore}%</div></div>
                <ScoreRing pct={avgScore} size={40} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <div style={{ background: "#F8F7F4", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "#0F6E56" }}>{completed.length}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>Concluídas</div>
                </div>
                <div style={{ background: "#F8F7F4", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "#EF9F27" }}>{pending}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>Pendentes</div>
                </div>
                <div style={{ background: "#F8F7F4", padding: "8px", borderRadius: "6px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: declines > 0 ? "#A32D2D" : "#888" }}>{declines}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>Recusas</div>
                </div>
              </div>
              <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: "#378ADD", fontWeight: 500 }}>
                Ver Perfil Completo →
              </div>
            </div>
          );
        })}
      </div>

      {selectedInspector && (
        <InspectorProfileModal 
          inspector={selectedInspector} 
          inspections={inspections} 
          onClose={() => setSelectedInspector(null)} 
        />
      )}
    </div>
  );
}

function InspectorProfileModal({ inspector, inspections, onClose }) {
  const myInspections = inspections.filter(i => i.inspector_id === inspector.id && i.type !== "leave");
  const completed = myInspections.filter(i => i.score_pct !== null);
  const avgScore = completed.length ? Math.round(completed.reduce((s, i) => s + i.score_pct, 0) / completed.length) : 0;
  
  // Advanced Metrics
  const durations = completed.filter(i => i.start_time && i.end_time).map(i => (new Date(i.end_time) - new Date(i.start_time)) / 60000);
  const avgDuration = durations.length ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) : 0;
  
  const assigned = myInspections.filter(i => i.accepted === true).length;
  const declined = myInspections.filter(i => i.accepted === false).length;
  const totalActedOn = assigned + declined;
  const acceptanceRate = totalActedOn > 0 ? Math.round((assigned / totalActedOn) * 100) : 100;

  // Client Breakdown
  const clientMap = {};
  completed.forEach(i => {
    if(!clientMap[i.location_name]) clientMap[i.location_name] = { count: 0, total: 0 };
    clientMap[i.location_name].count++;
    clientMap[i.location_name].total += i.score_pct;
  });
  const clientStats = Object.keys(clientMap).map(name => ({
    name,
    count: clientMap[name].count,
    avg: Math.round(clientMap[name].total / clientMap[name].count)
  })).sort((a,b) => b.count - a.count);

  const recentInsps = [...completed].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header" style={{ borderBottom: "1px solid #eee", paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1E2A3A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 16, border: "2px solid #378ADD" }}>
              {inspector.avatar}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{inspector.name}</div>
              <div style={{ fontSize: 12, color: "#888" }}>Inspector Performance Profile</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className="modal-body">
          {/* Top Metrics Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 24 }}>
            <div style={{ background: "#F8F7F4", padding: 16, borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <ScoreRing pct={avgScore} size={48} />
              <div>
                <div style={{ fontSize: 11, color: "#888" }}>Avg. Score</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{avgScore}%</div>
              </div>
            </div>
            <div style={{ background: "#F8F7F4", padding: 16, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#888" }}>Avg. Duration</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{avgDuration > 0 ? `${avgDuration} min` : "N/A"}</div>
            </div>
            <div style={{ background: "#F8F7F4", padding: 16, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#888" }}>Acceptance Rate</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: acceptanceRate >= 80 ? "#0F6E56" : "#A32D2D" }}>{acceptanceRate}%</div>
            </div>
            <div style={{ background: "#F8F7F4", padding: 16, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#888" }}>Total Inspections</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{completed.length}</div>
            </div>
          </div>

          {/* Client Breakdown */}
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#1E2A3A" }}>Client Performance Breakdown</h4>
          <div className="table-wrap" style={{ marginBottom: 24, maxHeight: 200, overflowY: "auto" }}>
            <table>
              <thead>
                <tr><th>Client</th><th>Visits</th><th>Avg Score</th></tr>
              </thead>
              <tbody>
                {clientStats.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "#888" }}>No data</td></tr>}
                {clientStats.map(c => (
                  <tr key={c.name}>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ fontSize: 12 }}>{c.count}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: c.avg >= 75 ? "#0F6E56" : c.avg >= 60 ? "#BA7517" : "#A32D2D" }}>{c.avg}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent Activity */}
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#1E2A3A" }}>Recent Inspections</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentInsps.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>No recent inspections.</div>}
            {recentInsps.map(insp => (
              <div key={insp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#F8F7F4", borderRadius: 6 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{insp.location_name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{insp.date}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusBadge status={insp.status} />
                  {insp.score_pct !== null && <ScoreRing pct={insp.score_pct} size={32} />}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
