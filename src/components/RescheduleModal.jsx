import { useState } from "react";
import { Icon } from "../lib/icons";
import { ROLES, PRIORITY_LEVELS } from "../data/constants";

export default function RescheduleModal({ inspection, users, onClose, onConfirm }) {
  const [date, setDate] = useState(inspection.date);
  const [time, setTime] = useState(inspection.start_time || "09:00");
  const [inspectorId, setInspectorId] = useState(inspection.inspector_id || "");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState(inspection.priority || "normal");
  const [notifyClient, setNotifyClient] = useState(true);
  const [notifyInspector, setNotifyInspector] = useState(true);

  const handleConfirm = () => {
    if (!reason.trim()) return alert("Reason for reschedule is mandatory.");
    onConfirm({
      ...inspection,
      date, start_time: time,
      inspector_id: inspectorId ? Number(inspectorId) : null,
      inspector_name: inspectorId ? users.find(u => u.id === Number(inspectorId))?.name : "Unassigned",
      priority, reschedule_reason: reason,
      status: inspectorId ? "pending_acceptance" : "unassigned"
    }, notifyClient, notifyInspector);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div style={{ fontSize: 15, fontWeight: 500 }}>Reschedule Inspection</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div style={{ background: "#F8F7F4", padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <strong>Client:</strong> {inspection.location_name}<br />
            <strong>Current:</strong> {inspection.date} at {inspection.start_time || "N/A"}
          </div>
          
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label className="form-label">New Date *</label>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label className="form-label">New Time *</label>
              <input className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Reassign Inspector (Optional)</label>
            <select className="form-select" value={inspectorId} onChange={e => setInspectorId(e.target.value)}>
              <option value="">Leave Unassigned</option>
              {users.filter(u => u.role === ROLES.INSPECTOR).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Priority Level</label>
            <select className="form-select" value={priority} onChange={e => setPriority(e.target.value)}>
              {Object.entries(PRIORITY_LEVELS).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Reason for Reschedule *</label>
            <textarea className="form-textarea" placeholder="Ex: Client requested delay, Inspector sick..." value={reason} onChange={e => setReason(e.target.value)}></textarea>
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={notifyInspector} onChange={e => setNotifyInspector(e.target.checked)} /> Notify Inspector
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={notifyClient} onChange={e => setNotifyClient(e.target.checked)} /> Notify Client
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm}>Save & Notify</button>
        </div>
      </div>
    </div>
  );
}
