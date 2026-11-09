// /src/components/CapaSummaryWidget.jsx
// Reusable CAPA summary widget for dashboards.
// Shows open/in_progress/overdue/closed counts as clickable cards.
// Used on SupervisorDashboard and CEODashboardView.

import { useState, useEffect } from "react";
import { Icon } from "../lib/icons";
import { capaService, CAPA_STATUS } from "../services/capaService";

export default function CapaSummaryWidget({ currentUser, onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Auto-mark overdue first
        await capaService.markOverdue().catch(() => {});
        const res = await capaService.getSummary(null); // company-wide
        if (!cancelled && res.success) {
          setSummary(res.summary);
        }
      } catch (e) {
        // Silent — widget is best-effort
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // Refresh every 60 seconds
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>📋 CAPA — Ações Corretivas</h3>
        <div style={{ fontSize: 13, color: "#888" }}>A carregar...</div>
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>📋 CAPA — Ações Corretivas</h3>
        <div style={{ fontSize: 13, color: "#0F6E56", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="check" size={16} /> Nenhuma CAPA pendente. Tudo em ordem.
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Abertas", count: summary.open || 0, color: "#EF9F27", bg: "#FFFBEB" },
    { label: "Em Curso", count: summary.in_progress || 0, color: "#378ADD", bg: "#EFF6FF" },
    { label: "Atrasadas", count: summary.overdue || 0, color: "#A32D2D", bg: "#FEF2F2" },
    { label: "Fechadas", count: summary.closed || 0, color: "#0F6E56", bg: "#ECFDF5" },
  ];

  const openTotal = (summary.open || 0) + (summary.overdue || 0) + (summary.in_progress || 0);

  return (
    <div className="card" style={{ marginBottom: 16, cursor: onNavigate ? "pointer" : "default" }} onClick={() => onNavigate && onNavigate("capa")}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>📋 CAPA — Ações Corretivas</h3>
        {openTotal > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "#A32D2D", background: "#FEF2F2", padding: "3px 10px", borderRadius: 12 }}>
            {openTotal} pendente(s)
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {cards.map((card) => (
          <div key={card.label} style={{ textAlign: "center", padding: "10px 6px", background: card.bg, borderRadius: 6 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.count}</div>
            <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", fontWeight: 600 }}>{card.label}</div>
          </div>
        ))}
      </div>
      {onNavigate && (
        <div style={{ fontSize: 11, color: "#378ADD", marginTop: 8, textAlign: "right" }}>
          Ver detalhes →
        </div>
      )}
    </div>
  );
}
