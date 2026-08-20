import { useState } from "react";
import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import { getTemplate } from "../data/clientTemplates";
import { getClientTemplate } from "../utils/excelTemplateImporter";
import { showToast } from "../lib/toast";

export default function ScheduleModal({ locations, users, inspections, onClose, onCreate }) {
  const [locId, setLocId] = useState("");
  const [inspectorId, setInspectorId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("09:00");
  const [recurring, setRecurring] = useState("none");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [creating, setCreating] = useState(false);

  const inspectors = users.filter(u => u.role === ROLES.INSPECTOR);

  const suggestions = inspectors.map(insp => {
    const hist = inspections.filter(i => String(i.inspector_id) === String(insp.id) && i.location_id === Number(locId) && i.score_pct);
    const avgScore = hist.length ? Math.round(hist.reduce((s,i)=>s+i.score_pct,0)/hist.length) : 0;
    const conflicts = inspections.filter(i => String(i.inspector_id) === String(insp.id) && i.date === date && i.accepted !== false).length;
    const rating = avgScore >= 90 ? 5 : avgScore >= 80 ? 4 : avgScore >= 70 ? 3 : 2;
    return { ...insp, histCount: hist.length, avgScore, conflicts, rating };
  }).sort((a,b) => a.conflicts - b.conflicts || b.rating - a.rating);

  const handleSave = () => {
    if (!locId || !inspectorId) {
      showToast("Selecione o Cliente e o Inspetor.", "warning");
      return;
    }

    setCreating(true);

    try {
      // Use String comparison (handles both numeric and string IDs)
      const loc = locations.find(l => String(l.id) === String(locId));
      if (!loc) {
        showToast("Localizacao nao encontrada. Tente novamente.", "error");
        setCreating(false);
        return;
      }

      const insp = users.find(u => String(u.id) === String(inspectorId));
      if (!insp) {
        showToast("Inspetor nao encontrado.", "error");
        setCreating(false);
        return;
      }

      // Try getClientTemplate first, fall back to getTemplate
      let template = null;
      try { template = getClientTemplate(loc.name); } catch (e) {}
      if (!template || !template.sections) {
        try { template = getTemplate(loc.name); } catch (e) { template = { sections: [] }; }
      }

      const templateSections = template?.sections || [];

      const baseTask = {
        id: Date.now(),
        location_id: loc.id,
        location_name: loc.name,
        inspector_id: insp.id,
        inspector_name: insp.name,
        inspector_email: insp.email || "",
        supervisor_id: 3,
        supervisor_name: "Ana Sitoe",
        status: "pending_acceptance",
        accepted: null,
        date,
        start_time: time,
        type: "inspection",
        items: templateSections.flatMap(s =>
          (s.items || []).map(item => ({ ...item, section_id: s.id, score: null, comment: "", photos: [] }))
        ),
        sections: templateSections.map(s => ({ id: s.id, title: s.title || s.name, observation: "", photos: [] })),
        notes: "",
        alert_level: "ok",
        score_pct: null,
        priority: "normal",
        template_id: template?.clientId || "DEFAULT",
        template_version: template?.version || "1.0"
      };

      let tasksToCreate = [baseTask];

      if (recurring === "monthly") {
        for (let i = 1; i <= 3; i++) {
          let newDate = new Date(date);
          newDate.setMonth(newDate.getMonth() + i);
          tasksToCreate.push({ ...baseTask, id: Date.now() + i, date: newDate.toISOString().split("T")[0] });
        }
      }

      console.log("[ScheduleModal] Creating tasks:", tasksToCreate.length);
      onCreate(tasksToCreate);
      showToast(`${tasksToCreate.length} tarefa(s) despachada(s) para ${insp.name}`, "success");

    } catch (error) {
      console.error("[ScheduleModal] handleSave error:", error);
      showToast("Erro ao criar tarefa: " + error.message, "error");
      setCreating(false);
    }
  };

  const canSubmit = locId && inspectorId && !creating;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontSize: 15, fontWeight: 500 }}>Agendar Inspeção (Despacho)</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Cliente (Localização) *</label>
            <select className="form-select" value={locId} onChange={e => { setLocId(e.target.value); setShowSuggestions(true); }}>
              <option value="">Selecionar...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {locations.length === 0 && (
              <div style={{ fontSize: 12, color: "#A32D2D", marginTop: 4 }}>
                ⚠️ Nenhuma localização disponível. Verifique se as localizações estão carregadas.
              </div>
            )}
          </div>

          {showSuggestions && locId && suggestions.length > 0 && (
            <div style={{ background: "#E6F1FB", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
              <strong style={{ display: "block", marginBottom: 8 }}>🤖 Smart Assignment Assistant:</strong>
              {suggestions.slice(0, 3).map(s => (
                <div key={s.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px", borderRadius: 4, marginBottom: 4,
                  background: String(s.id) === String(inspectorId) ? "#d4e8fc" : "transparent",
                  cursor: "pointer"
                }} onClick={() => setInspectorId(s.id)}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1E2A3A" }}>
                      {"⭐".repeat(s.rating)} {s.name}
                    </div>
                    <div style={{ color: "#666", fontSize: 11 }}>
                      Assignments: {s.conflicts} | Available: {s.conflicts > 0 ? "14:00" : "Now"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: s.conflicts > 0 ? "#A32D2D" : "#0F6E56" }}>
                    {s.conflicts > 0 ? "Busy" : "Free"}<br/>
                    {s.histCount > 0 ? `Score: ${s.avgScore}%` : "No hist"}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Inspetor *</label>
            <select className="form-select" value={inspectorId} onChange={e => setInspectorId(e.target.value)}>
              <option value="">Selecionar...</option>
              {inspectors.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {inspectors.length === 0 && (
              <div style={{ fontSize: 12, color: "#A32D2D", marginTop: 4 }}>
                ⚠️ Nenhum inspetor disponível.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Data *</label>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Hora *</label>
              <input className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Repetição (Recorrência)</label>
            <select className="form-select" value={recurring} onChange={e => setRecurring(e.target.value)}>
              <option value="none">Não repetir</option>
              <option value="monthly">Repetir mensalmente (3 meses)</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSubmit}>
            {creating ? "Despachando..." : "Despachar Tarefa"}
          </button>
        </div>
      </div>
    </div>
  );
}
