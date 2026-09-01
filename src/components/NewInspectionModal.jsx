import { useState } from "react";
import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import { genId } from "../lib/helpers";
import { getClientTemplate } from "../utils/excelTemplateImporter";

export default function NewInspectionModal({ locations, users, currentUser, onClose, onCreate }) {
  const [locId, setLocId] = useState("");
  const [inspectorId, setInspectorId] = useState(currentUser.role === ROLES.INSPECTOR ? currentUser.id : "");
  const [selectedClient, setSelectedClient] = useState(null);

  const handleLocationChange = (e) => {
    const id = e.target.value;
    setLocId(id);
    if (id) {
      const loc = locations.find(l => l.id === Number(id));
      setSelectedClient(loc);
    } else {
      setSelectedClient(null);
    }
  };

  const handleCreate = () => {
    if (!locId) return;
    const loc = locations.find(l => l.id === Number(locId));
    if (!loc) return;
    
    const inspector = users.find(u => u.id === Number(inspectorId)) || null;
    const template = getClientTemplate(loc.name);
    const templateSections = template.sections || [];
    
    const items = templateSections.flatMap(s => 
      (s.items || []).map(item => ({ 
        ...item, 
        section_id: s.id, 
        score: null, 
        comment: "", 
        photos: [] 
      }))
    );
    
    const sections = templateSections.map(s => ({ 
      id: s.id, 
      title: s.title || s.name,
      observation: "", 
      photos: [] 
    }));
    
    const insp = {
      id: genId(), 
      location_id: loc.id, 
      location_name: loc.name,
      inspector_id: inspector ? inspector.id : null, 
      inspector_name: inspector ? inspector.name : null,
      supervisor_id: 3, 
      supervisor_name: "Ana Sitoe",
      status: inspector ? "pending_acceptance" : "unassigned", 
      accepted: null, 
      score_pct: null, 
      date: new Date().toISOString().split("T")[0],
      items: items,
      sections: sections,
      notes: "", 
      alert_level: "ok", 
      type: "inspection", 
      priority: "normal",
      template_id: template.clientId || "DEFAULT",
      template_version: template.version || "1.0"
    };
    onCreate(insp);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ fontSize: 15, fontWeight: 500 }}>Nova Inspeção (Dispatch)</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Localização (Cliente) *</label>
            <select className="form-select" value={locId} onChange={handleLocationChange}>
              <option value="">Selecionar localização...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {selectedClient && (
            <div style={{ background: '#F3F4F6', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>📋 Template:</span>
                <span style={{ fontWeight: 500 }}>
                  {getClientTemplate(selectedClient.name).clientName || 'Padrão'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                <span>{getClientTemplate(selectedClient.name).sections?.length || 0} secções</span>
                <span>{getClientTemplate(selectedClient.name).totalItems || 0} itens</span>
              </div>
            </div>
          )}
          {currentUser.role !== ROLES.INSPECTOR && (
            <div className="form-group">
              <label className="form-label">Inspetor (Leave empty for Unassigned Queue)</label>
              <select className="form-select" value={inspectorId} onChange={e => setInspectorId(e.target.value)}>
                <option value="">Unassigned</option>
                {users.filter(u => u.role === ROLES.INSPECTOR).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!locId}>Criar Tarefa</button>
        </div>
      </div>
    </div>
  );
}
