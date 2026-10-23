import { useState, useEffect } from "react";
import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import { genId } from "../lib/helpers";
import { getClientTemplateAsync } from "../utils/excelTemplateImporter";

export default function NewInspectionModal({ locations, users, currentUser, onClose, onCreate }) {
  const [locId, setLocId] = useState("");
  const [inspectorId, setInspectorId] = useState(currentUser.role === ROLES.INSPECTOR ? currentUser.id : "");
  const [selectedClient, setSelectedClient] = useState(null);
  const [template, setTemplate] = useState(null);
  const [loadingTpl, setLoadingTpl] = useState(false);

  // FIX: async-fetch the template as soon as a client is selected.
  // Previously the sync getClientTemplate returned the DEFAULT template on the
  // first click (localStorage empty) and only cached the real one in the
  // background, so the correct item count only appeared on the 2nd click.
  useEffect(() => {
    if (!selectedClient) { setTemplate(null); return; }
    let cancelled = false;
    setLoadingTpl(true);
    getClientTemplateAsync(selectedClient.name)
      .then(tpl => { if (!cancelled) { setTemplate(tpl || null); setLoadingTpl(false); } })
      .catch(() => { if (!cancelled) { setTemplate(null); setLoadingTpl(false); } });
    return () => { cancelled = true; };
  }, [selectedClient]);

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
    if (!locId || !template) return;
    const loc = locations.find(l => l.id === Number(locId));
    if (!loc) return;

    const inspector = users.find(u => u.id === Number(inspectorId)) || null;
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

  const tplName = template?.clientName || (loadingTpl ? "A carregar..." : "Padrão");
  const tplSections = template?.sections?.length || 0;
  const tplItems = template?.totalItems || template?.sections?.reduce((s, sec) => s + (sec.items?.length || 0), 0) || 0;

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
                <span style={{ fontWeight: 500 }}>{tplName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                <span>{tplSections} secções</span>
                <span>{tplItems} itens</span>
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
          <button className="btn btn-primary" onClick={handleCreate} disabled={!locId || loadingTpl || !template}>Criar Tarefa</button>
        </div>
      </div>
    </div>
  );
}
