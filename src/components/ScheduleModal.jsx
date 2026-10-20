// src/components/ScheduleModal.jsx
import { useState } from "react";
import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import { getClientTemplateAsync } from "../utils/excelTemplateImporter";

export default function ScheduleModal({ locations, users, inspections, onClose, onCreate }) {
  const [locId, setLocId] = useState("");
  const [inspectorId, setInspectorId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("09:00");
  const [recurring, setRecurring] = useState("none");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templateInfo, setTemplateInfo] = useState(null);
  const [error, setError] = useState(null);

  const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
  const inspectors = users.filter(u => u.role === ROLES.INSPECTOR);

  const suggestions = inspectors.map(insp => {
    const hist = inspections.filter(i => String(i.inspector_id) === String(insp.id) && String(i.location_id) === String(locId) && i.score_pct);
    const avgScore = hist.length ? Math.round(hist.reduce((s,i)=>s+i.score_pct,0)/hist.length) : 0;
    const conflicts = inspections.filter(i => String(i.inspector_id) === String(insp.id) && i.date === date && i.accepted !== false).length;
    const rating = avgScore >= 90 ? 5 : avgScore >= 80 ? 4 : avgScore >= 70 ? 3 : 2;
    return { ...insp, histCount: hist.length, avgScore, conflicts, rating };
  }).sort((a,b) => a.conflicts - b.conflicts || b.rating - a.rating);

  // Carregar info do template quando seleciona localização
  const handleLocationChange = (e) => {
    const id = e.target.value;
    setLocId(id);
    setTemplateInfo(null);
    setError(null);
    setShowSuggestions(true);
    
    if (id) {
      const loc = locations.find(l => String(l.id) === String(id));
      if (loc) {
        loadTemplateInfo(loc.name);
      }
    }
  };

  // Carregar template do Supabase
  const loadTemplateInfo = async (clientName) => {
    try {
      setTemplateInfo({ loading: true, name: clientName });
      const template = await getClientTemplateAsync(clientName);
      
      setTemplateInfo({
        loading: false,
        name: clientName,
        sections: template.sections?.length || 0,
        items: template.totalItems || template.sections?.reduce((s, sec) => s + (sec.items?.length || 0), 0),
        source: template.clientId === 'DEFAULT' ? 'Padrão' : 
                template.clientId === 'STATIC' ? 'Estático' : 'Supabase'
      });
    } catch (err) {
      console.error('[ScheduleModal] Erro ao carregar template:', err);
      setTemplateInfo({ loading: false, name: clientName, error: err.message });
    }
  };

  const handleSave = async () => {
    if (!locId || !inspectorId) return alert("Selecione o Cliente e o Inspetor.");
    
    const loc = locations.find(l => String(l.id) === String(locId));
    if (!loc) return alert("Localização não encontrada.");
    
    const insp = users.find(u => String(u.id) === String(inspectorId));
    if (!insp) return alert("Inspetor não encontrado.");
    
    setLoading(true);
    setError(null);
    
    try {
      // BUSCAR TEMPLATE DO SUPABASE (assíncrono)
      console.log(`[ScheduleModal] Buscando template para: ${loc.name}`);
      const template = await getClientTemplateAsync(loc.name);
      const templateSections = template.sections || [];
      const totalItems = templateSections.reduce((s, sec) => s + (sec.items?.length || 0), 0);
      
      console.log(`[ScheduleModal] Template carregado: ${totalItems} itens (${template.clientId})`);
      
      if (totalItems === 0) {
        setError(`⚠️ Template vazio para "${loc.name}". A inspeção será criada com itens padrão.`);
      }

      const baseTask = {
        id: String(Date.now()),
        location_id: loc.id,
        location_name: loc.name,
        inspector_id: String(insp.id),
        inspector_name: insp.name,
        supervisor_id: String(currentUser?.id || 3),
        supervisor_name: currentUser?.name || "Ana Sitoe",
        status: "pending_acceptance",
        accepted: null,
        date,
        start_time: time,
        type: "inspection",
        items: templateSections.flatMap(s => 
          (s.items || []).map(item => ({
            id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            label: item.label || item.text || 'Item',
            text: item.text || item.label || 'Item',
            weight: item.weight || item.max || 1,
            max: item.max || item.weight || 5,
            section_id: s.id,
            score: null,
            comment: "",
            photos: []
          }))
        ),
        sections: templateSections.map(s => ({
          id: s.id,
          title: s.title || s.name || 'Geral',
          name: s.title || s.name || 'Geral',
          observation: "",
          photos: []
        })),
        notes: "",
        alert_level: "ok",
        score_pct: null,
        priority: "normal",
        template_id: template.clientId || "DEFAULT",
        template_version: template.version || "1.0",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      let tasksToCreate = [baseTask];
      
      if (recurring === "monthly") {
        for (let i = 1; i <= 3; i++) {
          let newDate = new Date(date);
          newDate.setMonth(newDate.getMonth() + i);
          tasksToCreate.push({ 
            ...baseTask, 
            id: String(Date.now() + i), 
            date: newDate.toISOString().split("T")[0],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      onCreate(tasksToCreate);
      
    } catch (err) {
      console.error('[ScheduleModal] Erro:', err);
      setError(`Erro ao carregar template: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div style={{ fontSize: 15, fontWeight: 500 }}>Agendar Inspeção (Despacho)</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Cliente (Localização) *</label>
            <select className="form-select" value={locId} onChange={handleLocationChange}>
              <option value="">Selecionar...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Info do Template */}
          {templateInfo && (
            <div style={{ 
              background: templateInfo.error ? '#FEF2F2' : templateInfo.source === 'Supabase' ? '#ECFDF5' : templateInfo.source === 'Padrão' ? '#FFFBEB' : '#F3F4F6',
              padding: 12, 
              borderRadius: 8, 
              marginBottom: 16, 
              fontSize: 12,
              border: `1px solid ${templateInfo.error ? '#FCA5A5' : templateInfo.source === 'Supabase' ? '#6EE7B7' : templateInfo.source === 'Padrão' ? '#FCD34D' : '#D1D5DB'}`
            }}>
              {templateInfo.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div>
                  <span>Carregando template para {templateInfo.name}...</span>
                </div>
              ) : templateInfo.error ? (
                <div>
                  <div style={{ color: '#A32D2D', fontWeight: 600 }}>⚠️ Erro ao carregar template</div>
                  <div style={{ color: '#993C1D', marginTop: 4 }}>{templateInfo.error}</div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>📋 Template: {templateInfo.name}</span>
                    <span style={{ 
                      padding: '2px 8px', 
                      borderRadius: 10, 
                      fontSize: 10, 
                      background: templateInfo.source === 'Supabase' ? '#059669' : templateInfo.source === 'Padrão' ? '#D97706' : '#6B7280',
                      color: '#fff'
                    }}>
                      {templateInfo.source}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, color: '#555' }}>
                    <span>{templateInfo.sections} secções</span>
                    <span>{templateInfo.items} itens</span>
                  </div>
                  {templateInfo.source === 'Padrão' && (
                    <div style={{ color: '#92400E', marginTop: 6, fontSize: 11 }}>
                      ⚠️ Usando template padrão. Verifique se o template existe no Supabase.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showSuggestions && locId && (
            <div style={{ background: "#E6F1FB", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
              <strong style={{ display: "block", marginBottom: 8 }}>🤖 Smart Assignment Assistant:</strong>
              {suggestions.slice(0, 3).map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", marginBottom: 4, borderBottom: "1px solid rgba(0,0,0,0.05)", cursor: "pointer", background: String(s.id) === String(inspectorId) ? "#d4e8fc" : "transparent", borderRadius: 4 }} onClick={() => setInspectorId(s.id)}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1E2A3A" }}>
                      {"⭐".repeat(s.rating)} {s.name}
                    </div>
                    <div style={{ color: "#666", fontSize: 11 }}>
                      Assignments: {s.conflicts} | Available After: {s.conflicts > 0 ? "14:00" : "Now"}
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
            <label className="form-label">Repetição</label>
            <select className="form-select" value={recurring} onChange={e => setRecurring(e.target.value)}>
              <option value="none">Não repetir</option>
              <option value="monthly">Mensalmente (3 meses)</option>
            </select>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', padding: 10, borderRadius: 6, fontSize: 12, color: '#A32D2D', marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!locId || !inspectorId || loading}>
            {loading ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', verticalAlign: 'middle' }}></div>
                Carregando...
              </>
            ) : (
              <>Despachar Tarefa</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
