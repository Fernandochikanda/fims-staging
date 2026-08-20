import { useState } from "react";
import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import { getTemplate } from "../data/clientTemplates";

export default function BulkScheduleModal({ locations, users, onClose, onCreate }) {
  const [selectedLocs, setSelectedLocs] = useState([]);
  const [inspectorId, setInspectorId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("09:00");

  const handleToggle = (id) => {
    setSelectedLocs(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSave = () => {
    if (selectedLocs.length === 0) return alert("Selecione pelo menos um cliente.");
    
    const tasks = selectedLocs.map(locId => {
      const loc = locations.find(l => l.id === locId);
      const insp = users.find(u => u.id === Number(inspectorId));
      const template = getTemplate(loc.name);
      
      return {
        id: Date.now() + Math.random(),
        location_id: loc.id, location_name: loc.name,
        inspector_id: insp ? insp.id : null,
        inspector_name: insp ? insp.name : null,
        supervisor_id: 3, supervisor_name: "Ana Sitoe",
        status: insp ? "pending_acceptance" : "unassigned",
        accepted: null, date, start_time: time, type: "inspection",
        items: template.sections.flatMap(s => s.items.map(item => ({ ...item, section_id: s.id, score: null, comment: "", photos: [] }))),
        sections: template.sections.map(s => ({ id: s.id, observation: "", photos: [] })),
        notes: "", alert_level: "ok", score_pct: null, priority: "normal"
      };
    });

    onCreate(tasks);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div style={{ fontSize: 15, fontWeight: 500 }}>Bulk Scheduling</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Select Clients *</label>
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #ddd", borderRadius: 6, padding: 8 }}>
              {locations.map(l => (
                <div key={l.id} style={{ padding: "4px 0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={selectedLocs.includes(l.id)} onChange={() => handleToggle(l.id)} />
                    {l.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Assign Inspector (Optional)</label>
            <select className="form-select" value={inspectorId} onChange={e => setInspectorId(e.target.value)}>
              <option value="">Leave Unassigned</option>
              {users.filter(u => u.role === ROLES.INSPECTOR).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Date *</label>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Time *</label>
              <input className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Create {selectedLocs.length} Schedules</button>
        </div>
      </div>
    </div>
  );
}
