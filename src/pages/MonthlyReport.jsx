import { useState } from "react";
import { Icon } from "../lib/icons";
import ScoreRing from "../components/ScoreRing";
import { scoreLabel } from "../lib/helpers";

export default function MonthlyReport({ inspections, locations }) {
  const [month, setMonth] = useState(new Date().toISOString().split("T")[0].substring(0, 7));

  const monthInspections = inspections.filter(i => i.date.startsWith(month) && i.score_pct !== null);
  const avgScore = monthInspections.length ? Math.round(monthInspections.reduce((s, i) => s + i.score_pct, 0) / monthInspections.length) : 0;
  const criticals = monthInspections.filter(i => i.alert_level === "critical").length;

  const customerData = locations.map(loc => {
    const li = monthInspections.filter(i => i.location_id === loc.id);
    const avg = li.length ? Math.round(li.reduce((s, i) => s + i.score_pct, 0) / li.length) : null;
    const crit = li.filter(i => i.alert_level === "critical").length;
    return { ...loc, count: li.length, avg, crit };
  }).filter(l => l.count > 0);

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Monthly Report</div><div className="page-sub">Performance analysis for {new Date(month + "-01").toLocaleDateString("pt-PT", { month: "long", year: "numeric" })}</div></div>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="form-input" style={{ width: 160 }} />
      </div>

      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">Total Inspections</div><div className="metric-value">{monthInspections.length}</div></div>
        <div className="metric-card"><div className="metric-label">Submitted</div><div className="metric-value" style={{ color: "#0F6E56" }}>{monthInspections.filter(i => i.status === "submitted" || i.status === "reviewed").length}</div></div>
        <div className="metric-card"><div className="metric-label">Average Score</div><div className="metric-value" style={{ color: scoreLabel(avgScore).color }}>{avgScore}%</div></div>
        <div className="metric-card"><div className="metric-label">Criticals</div><div className="metric-value" style={{ color: "#A32D2D" }}>{criticals}</div></div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Customers with inspections this month</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Customer</th><th># Inspections</th><th>Avg Score</th><th>Criticals</th><th>Action</th></tr></thead>
            <tbody>
              {customerData.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: "20px" }}>No data for this month.</td></tr>}
              {customerData.map(loc => (
                <tr key={loc.id}>
                  <td style={{ fontWeight: 500 }}>{loc.name}</td>
                  <td>{loc.count}</td>
                  <td><ScoreRing pct={loc.avg} size={32} /></td>
                  <td style={{ color: loc.crit > 0 ? "#A32D2D" : "#888" }}>{loc.crit}</td>
                  <td><button className="btn btn-secondary btn-sm"><Icon name="download" size={12} /> PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
