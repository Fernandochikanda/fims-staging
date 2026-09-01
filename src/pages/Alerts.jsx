import { Icon } from "../lib/icons";
import ScoreRing from "../components/ScoreRing";
import StatusBadge from "../components/StatusBadge";
import { useLang } from "../context/LangContext";

export default function Alerts({ inspections, onView, onUpdate }) {
  const { t } = useLang();
  const critical = inspections.filter(i => i.alert_level === "critical" && i.score_pct !== null && !i.resolved);
  const warning = inspections.filter(i => i.alert_level === "warning" && i.score_pct !== null && !i.resolved);
  const resolved = inspections.filter(i => i.resolved);

  const renderAlert = (insp, color, bgColor, borderColor) => (
    <div key={insp.id} style={{ background: bgColor, border: `0.5px solid ${borderColor}`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <ScoreRing pct={insp.score_pct} size={44} />
      <div style={{ flex: 1, minWidth: 150 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{insp.location_name}</div>
        <div style={{ fontSize: 12, color }}>{insp.inspector_name} · {insp.date}</div>
      </div>
      <StatusBadge status={insp.status} />
      <button className="btn btn-secondary btn-sm" onClick={() => onView(insp)}>Ver</button>
      <button className="btn btn-primary btn-sm" onClick={() => onUpdate({ ...insp, resolved: true })}>{t.resolve}</button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">{t.alerts}</div><div className="page-sub">{critical.length} crítico(s), {warning.length} aviso(s), {resolved.length} resolvido(s)</div></div>
      </div>

      {critical.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#A32D2D", marginBottom: 10 }}>Alertas Críticos (Score &lt; 60%)</div>
          {critical.map(insp => renderAlert(insp, "#A32D2D", "#FCEBEB", "#F7C1C1"))}
        </div>
      )}

      {warning.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#854F0B", marginBottom: 10 }}>Avisos (Score 60–75%)</div>
          {warning.map(insp => renderAlert(insp, "#854F0B", "#FAEEDA", "#FAC775"))}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#3B6D11", marginBottom: 10 }}>{t.resolved}</div>
          {resolved.map(insp => (
            <div key={insp.id} style={{ background: "#EAF3DE", border: "0.5px solid #C3E1A4", borderLeft: "3px solid #3B6D11", borderRadius: 8, padding: "12px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: 0.7 }}>
              <ScoreRing pct={insp.score_pct} size={44} />
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{insp.location_name}</div>
                <div style={{ fontSize: 12, color: "#3B6D11" }}>{insp.inspector_name} · {insp.date}</div>
              </div>
              <StatusBadge status={insp.status} />
              <button className="btn btn-secondary btn-sm" onClick={() => onView(insp)}>Ver</button>
            </div>
          ))}
        </div>
      )}

      {critical.length === 0 && warning.length === 0 && resolved.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <Icon name="check" size={40} style={{ color: "#3B6D11", display: "block", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 16, fontWeight: 500, color: "#3B6D11" }}>Nenhum alerta ativo</div>
        </div>
      )}
    </div>
  );
}
