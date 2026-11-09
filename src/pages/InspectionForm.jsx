// src/pages/InspectionForm.jsx
// Substituir o componente inteiro
import { useState, useEffect, useRef } from "react";
import { Icon } from "../lib/icons";
import { calcScore, isItemComplete, getCategoryHealth, generateAISummary } from "../lib/helpers";
import { validateInspectionSubmission } from "../lib/inspectionValidator";
import { photoStore } from "../lib/photoStore";
import { getClientTemplate, getClientTemplateAsync } from "../data/constants";
import { timingService } from "../services/timingService";
import { logService } from "../services/logService";
import SignaturePad from "../components/SignaturePad";
import PhotoUploader from "../components/PhotoUploader";
import VoiceInput from "../components/VoiceInput";

export default function InspectionForm({ inspection, onSave, onSubmit, onBack, allInspections }) {
  const draftKey = `fims_draft_${inspection.id}`;
  const [items, setItems] = useState([]);
  const [sections, setSections] = useState([]);
  const [notes, setNotes] = useState("");
  const [expandedSections, setExpandedSections] = useState([]);
  const [saved, setSaved] = useState(false);
  const [photosByItem, setPhotosByItem] = useState({});
  const [validationErrors, setValidationErrors] = useState(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [templateSource, setTemplateSource] = useState("");
  const [clientMgrName, setClientMgrName] = useState("");
  const [inspectorSig, setInspectorSig] = useState("");
  const [clientSig, setClientSig] = useState("");
  const [gpsCoords, setGpsCoords] = useState(null);
  const [showRefModal, setShowRefModal] = useState(null);
  const [refPhotos, setRefPhotos] = useState([]);
  const draftOutboxTimer = useRef(null);

  // Hidden timing: start when form opens (inspector unaware)
  useEffect(() => {
    if (inspection?.id) {
      timingService.start(inspection);
    }
  }, [inspection?.id]);

  // Carregar template - VERSÃO MELHORADA COM SUPABASE
  useEffect(() => {
    async function loadTemplate() {
      // Verificar se a inspeção já tem items (returned for corrections, or resumed draft)
      if (Array.isArray(inspection.items) && inspection.items.length > 0) {
        console.log('[InspectionForm] Usando items da inspeção (inclui notas e assinaturas)');
        setItems(inspection.items);
        setSections(Array.isArray(inspection.sections) ? inspection.sections : []);
        // CRITICAL: load ALL existing field values from the inspection object.
        // Without this, the supervisor's correction note (stored in inspection.notes)
        // is lost on the first save — the local state starts as "" and overwrites it.
        // Same for clientMgrName, signatures, GPS — all would be wiped on save.
        setNotes(inspection.notes || "");
        setClientMgrName(inspection.client_mgr_name || "");
        setInspectorSig(inspection.inspector_sig || "");
        setClientSig(inspection.client_sig || "");
        setGpsCoords(inspection.gps_coords || null);
        setTemplateSource("inspeção");
        return;
      }
      // Verificar draft salvo
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.items && parsed.items.length > 0) {
            console.log('[InspectionForm] Usando draft salvo');
            setItems(parsed.items);
            setSections(parsed.sections || []);
            setNotes(parsed.notes || "");
            setClientMgrName(parsed.clientMgrName || "");
            setInspectorSig(parsed.inspectorSig || "");
            setClientSig(parsed.clientSig || "");
            setTemplateSource("draft");
            return;
          }
        }
      } catch (e) {}
      // Buscar template - PRIMEIRO LOCALSTORAGE, DEPOIS SUPABASE
      setIsLoadingTemplate(true);
      console.log('[InspectionForm] Buscando template para:', inspection.location_name);
      
      try {
        const template = await getClientTemplateAsync(inspection.location_name);
        
        if (template && template.sections && template.sections.length > 0) {
          const templateSections = template.sections;
          const newItems = templateSections.flatMap(s => 
            (s.items || []).map(item => ({ 
              ...item, 
              section_id: s.id, 
              score: null, 
              comment: "", 
              photos: [] 
            }))
          );
          const newSections = templateSections.map(s => ({ 
            id: s.id, 
            title: s.title || s.name,
            observation: "", 
            photos: [] 
          }));
          
          console.log(`[InspectionForm] Template carregado: ${newItems.length} itens de ${templateSource || 'Supabase/local'}`);
          setItems(newItems);
          setSections(newSections);
          setTemplateSource(template.clientId === 'DEFAULT' ? 'padrão' : 
                           template.clientId === 'STATIC' ? 'estático' : 'Supabase');
        } else {
          console.warn('[InspectionForm] Template vazio ou inválido');
          setItems([]);
          setSections([]);
          setTemplateSource("vazio");
        }
      } catch (error) {
        console.error('[InspectionForm] Erro ao carregar template:', error);
        // Fallback síncrono
        const fallbackTemplate = getClientTemplate(inspection.location_name);
        const templateSections = fallbackTemplate.sections || [];
        setItems(templateSections.flatMap(s => 
          (s.items || []).map(item => ({ 
            ...item, 
            section_id: s.id, 
            score: null, 
            comment: "", 
            photos: [] 
          }))
        ));
        setSections(templateSections.map(s => ({ 
          id: s.id, 
          title: s.title || s.name,
          observation: "", 
          photos: [] 
        })));
        setTemplateSource("fallback");
      } finally {
        setIsLoadingTemplate(false);
      }
    }
    loadTemplate();
  }, [inspection.id, inspection.location_name]);

  // Expandir primeira seção quando items carregam
  useEffect(() => {
    if (sections.length > 0 && expandedSections.length === 0) {
      setExpandedSections([sections[0].id]);
    }
  }, [sections]);

  // Salvar draft (INCLUI FOTOS) + queue to outbox (debounced)
  // The draft is saved to localStorage on every change (fast).
  // Additionally, after a 2-second debounce, the full inspection is queued
  // to the dataService outbox with status 'in_progress'. This ensures that
  // if the user closes the tab while offline, the draft survives and will
  // be synced to Supabase when the connection returns.
  // Closes crash-risk C5 (draft autosave lost on tab close).
  useEffect(() => {
    if (items.length > 0 || sections.length > 0) {
      const draftData = { items, sections, notes, clientMgrName, inspectorSig, clientSig, photosByItem };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draftData));
      } catch (e) {
        console.warn('[InspectionForm] Erro ao salvar draft:', e);
      }
      // Debounced save: when online, save directly to Supabase (which clears
      // the outbox on success). When offline, queue to outbox for later flush.
      // This prevents stale drafts from overwriting a successful submit.
      clearTimeout(draftOutboxTimer.current);
      draftOutboxTimer.current = setTimeout(() => {
        const fullInspection = {
          ...inspection,
          items,
          sections,
          notes,
          client_mgr_name: clientMgrName,
          inspector_sig: inspectorSig,
          client_sig: clientSig,
          photosByItem,
          status: 'in_progress',
        };
        const isOnline = typeof navigator !== 'undefined' && navigator.onLine !== false;
        import('../services/dataService').then(({ dataService }) => {
          if (isOnline) {
            // Online: save directly. saveInspection clears the outbox on success.
            dataService.saveInspection(fullInspection).then((ok) => {
              if (!ok) {
                // Save failed (network error) — queue to outbox as fallback
                dataService.queueInspectionSave(fullInspection);
              }
            }).catch(() => {
              dataService.queueInspectionSave(fullInspection);
            });
          } else {
            // Offline: queue to outbox for later flush
            dataService.queueInspectionSave(fullInspection);
          }
        }).catch(() => {});
      }, 2000);
    }
    return () => clearTimeout(draftOutboxTimer.current);
  }, [items, sections, notes, clientMgrName, inspectorSig, clientSig, photosByItem, draftKey, inspection]);

  // GPS
  useEffect(() => {
    if (!gpsCoords && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGpsCoords(`${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`),
        (err) => console.warn("GPS Error:", err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, [gpsCoords]);

  // Fotos (Carregar do JSON, Draft ou Supabase Storage)
  useEffect(() => {
    let cancelled = false;
    
    // 1. Verificar se a inspeção (vinda do Supabase) já tem fotos guardadas
    if (inspection.photosByItem && Object.keys(inspection.photosByItem).length > 0) {
      setPhotosByItem(inspection.photosByItem);
      return;
    }
    // 2. Verificar rascunho local
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.photosByItem && Object.keys(parsed.photosByItem).length > 0) {
          setPhotosByItem(parsed.photosByItem);
          return;
        }
      }
    } catch (e) {}
    // 3. Fallback: Buscar do Supabase Storage (para inspeções antigas)
    photoStore.listByInspection(inspection.id).then(grouped => {
      if (cancelled) return;
      setPhotosByItem(grouped);
    }).catch(() => {});
    
    return () => { cancelled = true; };
  }, [inspection.id, inspection.photosByItem, draftKey]);

  // Funções de atualização
  const setScore = (itemId, score) => setItems(prev => prev.map(i => i.id === itemId ? { ...i, score } : i));
  const setComment = (itemId, comment) => setItems(prev => prev.map(i => i.id === itemId ? { ...i, comment } : i));
  const setSectionObservation = (secId, text) => setSections(prev => prev.map(s => s.id === secId ? { ...s, observation: text } : s));

  // FUNÇÃO ADD PHOTO COM TRATAMENTO DE ERROS
  const addPhoto = async (entityId, file) => {
    try {
      const meta = await photoStore.add(inspection.id, entityId, file);
      if (meta && meta.url) {
        setPhotosByItem(prev => ({ ...prev, [entityId]: [...(prev[entityId] || []), meta] }));
      } else {
        alert("Erro ao carregar a foto. Tente novamente.");
      }
    } catch (error) {
      console.error("[InspectionForm] Falha no upload da foto:", error);
      alert("Erro ao enviar a foto. Verifique se as permissões do Supabase Storage estão configuradas (RLS Policies).");
    }
  };

  const removePhoto = async (entityId, photo) => {
    await photoStore.remove(photo.id);
    setPhotosByItem(prev => ({ ...prev, [entityId]: (prev[entityId] || []).filter(p => p.id !== photo.id) }));
  };

  const handleShowRefImage = (itemId) => {
    if (!allInspections) return;
    const clientInsps = allInspections.filter(i => String(i.location_id) === String(inspection.location_id) && i.id !== inspection.id && i.score_pct !== null);
    if (clientInsps.length === 0) return alert("No previous inspections found for this client.");
    const lastInsp = clientInsps.sort((a,b) => new Date(b.date) - new Date(a.date))[0];
    photoStore.listByInspection(lastInsp.id).then(grouped => {
      setRefPhotos(grouped[itemId] || []);
      setShowRefModal(itemId);
    });
  };

  const photoCount = entityId => (photosByItem[entityId] || []).length;
  const totalComplete = items.filter(i => isItemComplete(i, photoCount(i.id))).length;
  const totalItems = items.length;

  const handleSave = () => {
    timingService.pause(inspection.id);
    logService.log({ id: inspection.inspector_id, name: inspection.inspector_name }, "Guardou rascunho", "inspection", inspection.location_name);
    onSave({ 
      ...inspection, 
      items, 
      sections, 
      notes, 
      status: "in_progress", 
      photosByItem, // ADICIONADO AQUI
      client_mgr_name: clientMgrName, 
      inspector_sig: inspectorSig, 
      client_sig: clientSig, 
      gps_coords: gpsCoords 
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSubmit = () => {
    // Build the full inspection payload FIRST (before any side effects)
    const clearedItems = items.map(i => i.qc_comment ? { ...i, qc_comment: null } : i);
    const pct = calcScore(clearedItems);
    const alertLevel = pct < 60 ? "critical" : pct < 75 ? "warning" : "ok";
    const payload = {
      ...inspection,
      items: clearedItems,
      sections,
      notes,
      status: "submitted",
      score_pct: pct,
      alert_level: alertLevel,
      photosByItem,
      client_mgr_name: clientMgrName,
      inspector_sig: inspectorSig,
      client_sig: clientSig,
      gps_coords: gpsCoords,
    };

    // VALIDATE FIRST — before stopping timer, logging, or deleting draft.
    // Uses the shared inspectionValidator.js (same logic as the handler guard).
    const validation = validateInspectionSubmission(payload);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    // Validation passed — now safe to stop timer and log
    timingService.stop(inspection.id);
    logService.log({ id: inspection.inspector_id, name: inspection.inspector_name }, "Submeteu inspeção", "inspection", inspection.location_name);

    // Do NOT delete the local draft here — the handler (handleSubmitInspection)
    // will delete it after the save succeeds. This prevents losing the draft
    // if the handler blocks the submit (transition guard or validation guard).
    onSubmit(payload);
  };

  const toggleSection = (secId) => {
    setExpandedSections(prev => prev.includes(secId) ? prev.filter(id => id !== secId) : [...prev, secId]);
  };

  const aiSummary = generateAISummary(items, inspection.location_name);

  // Estado de carregamento
  if (isLoadingTemplate) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: 16, color: '#666' }}>Carregando template de inspeção...</p>
        <p style={{ fontSize: 12, color: '#999' }}>{inspection.location_name}</p>
      </div>
    );
  }

  // Aviso se template está vazio
  if (items.length === 0 && !isLoadingTemplate) {
    return (
      <div>
        <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>← Voltar</button>
        <div className="card" style={{ padding: 24, textAlign: 'center', border: '2px solid #EF9F27' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h3 style={{ color: '#EF9F27', marginBottom: 8 }}>Template Não Encontrado</h3>
          <p style={{ color: '#666', marginBottom: 16 }}>
            Não foi possível carregar os itens de inspeção para <strong>{inspection.location_name}</strong>.
          </p>
          <p style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
            Fonte: {templateSource} | Verifique se o template existe no Supabase
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button 
              className="btn btn-primary" 
              onClick={async () => {
                setIsLoadingTemplate(true);
                const { templateService } = await import('../services/templateService');
                const template = await templateService.fetchTemplateByClientName(inspection.location_name);
                if (template.success && template.template) {
                  const s = template.template.sections;
                  setItems(s.flatMap(sec => sec.items.map(item => ({ ...item, section_id: sec.id, score: null, comment: "", photos: [] }))));
                  setSections(s.map(sec => ({ id: sec.id, title: sec.title || sec.name, observation: "", photos: [] })));
                  setTemplateSource('Supabase (retry)');
                } else {
                  alert('Template não encontrado no Supabase: ' + (template.error || 'Erro desconhecido'));
                }
                setIsLoadingTemplate(false);
              }}
            >
              Tentar Novamente (Supabase)
            </button>
            <button className="btn btn-secondary" onClick={onBack}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ flexWrap: "wrap", gap: "16px" }}>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>← Voltar</button>
          <div className="page-title">{inspection.location_name}</div>
          <div className="page-sub">
            Relatório de Inspeção · {inspection.date}
            <span style={{ marginLeft: 12, fontSize: 11, color: templateSource === 'Supabase' ? '#0F6E56' : '#888' }}>
              📋 {totalItems} itens (fonte: {templateSource})
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div style={{ color: gpsCoords ? "#0F6E56" : "#888", fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
              <Icon name="location" size={12} /> {gpsCoords ? "GPS Captured" : "Requesting GPS..."}
            </div>
            {gpsCoords && <a href={`https://maps.google.com/?q=${gpsCoords}`} target="_blank" rel="noreferrer" style={{ color: "#378ADD", fontSize: 10 }}>{gpsCoords}</a>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: "#888" }}>Progress</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{totalComplete}/{totalItems}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAIPanel(true)}><Icon name="star" size={13} /> AI Review</button>
        </div>
      </div>

      {/* Supervisor Feedback Banner — shown when inspection was returned for corrections */}
      {inspection.status === "needs_corrections" && (() => {
        // Extract the supervisor's correction note from the notes field.
        // InspectionDetail.jsx appends it as: notes + '\n\n[NECESSITA CORREÇÃO]: ' + rejectNote
        const notesStr = String(notes || "");
        const marker = "[NECESSITA CORREÇÃO]";
        const markerIdx = notesStr.indexOf(marker);
        const correctionNote = markerIdx >= 0
          ? notesStr.slice(markerIdx + marker.length).replace(/^[:\s]+/, "").trim()
          : "";
        return correctionNote ? (
          <div style={{
            background: "#FEF3C7",
            border: "1px solid #F59E0B",
            borderLeft: "4px solid #F59E0B",
            borderRadius: 8,
            padding: "14px 16px",
            marginBottom: 16,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}>
            <div style={{ fontSize: 20, lineHeight: 1 }}>⚠️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#92400E", marginBottom: 4 }}>
                Correções pedidas pelo supervisor:
              </div>
              <div style={{ fontSize: 13, color: "#78350F", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {correctionNote}
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {/* Validation Modal */}
      {validationErrors && (
        <div className="modal-overlay" onClick={() => setValidationErrors(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header" style={{ borderBottom: "1px solid #A32D2D" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#A32D2D" }}>⚠️ Inspection Cannot Be Submitted</div>
              <button className="icon-btn" onClick={() => setValidationErrors(null)}><Icon name="x" size={14} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, marginBottom: 16 }}>The following sections require attention:</p>
              {validationErrors.map((err, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 10, background: "#FCEBEB", borderRadius: 6, cursor: "pointer" }} 
                  onClick={() => { setExpandedSections([err.id]); setValidationErrors(null); window.scrollTo({top: 0, behavior: 'smooth'}); }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#A32D2D" }}>{err.section}</div>
                  <ul style={{ margin: "4px 0 0 20px", fontSize: 12, color: "#993C1D" }}>
                    {err.errors.map((e, idx) => <li key={idx}>{e}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setValidationErrors(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setValidationErrors(null)}>Review Missing Items</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Panel */}
      {showAIPanel && (
        <div className="modal-overlay" onClick={() => setShowAIPanel(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><div style={{ fontSize: 15, fontWeight: 500 }}>🤖 AI Inspection Assistant</div><button className="icon-btn" onClick={() => setShowAIPanel(false)}><Icon name="x" size={14} /></button></div>
            <div className="modal-body">
              <div style={{ background: "#E6F1FB", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Executive Summary</div>
                <div style={{ fontSize: 12, color: "#444" }}>{aiSummary.summary}</div>
              </div>
              {aiSummary.recommendations && aiSummary.recommendations.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Recommended Corrective Actions:</div>
                  {aiSummary.recommendations.map((rec, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#444", marginBottom: 8, padding: 8, background: "#F8F7F4", borderRadius: 6 }} dangerouslySetInnerHTML={{ __html: rec.replace(/\*\*(.*?)\*\*/, '<strong>$1</strong>') }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Categories */}
      <div style={{ marginBottom: 16 }}>
        {sections.map(section => {
          const sItems = items.filter(i => i.section_id === section.id);
          const secData = sections.find(s => s.id === section.id) || { observation: "" };
          const health = getCategoryHealth(sItems);
          const isExpanded = expandedSections.includes(section.id);
          const complete = sItems.filter(i => isItemComplete(i, photoCount(i.id))).length;
          
          return (
            <div key={section.id} className="card" style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
              <div 
                style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: isExpanded ? "#1E2A3A" : "#fff", color: isExpanded ? "#fff" : "#1E2A3A" }}
                onClick={() => toggleSection(section.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: isExpanded ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)', border: `1px solid ${isExpanded ? 'rgba(255,255,255,0.3)' : '#ddd'}` }}>
                    <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 300, color: isExpanded ? '#fff' : '#1E2A3A' }}>{isExpanded ? '−' : '+'}</span>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{section.title || section.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 60, height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${health.health}%`, height: "100%", background: health.color }}></div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{complete}/{sItems.length}</span>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: health.color, color: "#fff" }}>{health.risk}</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ padding: 16 }}>
                  <div style={{ background: "#F8F7F4", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Category Observation <span className="required">*</span></label>
                    <VoiceInput 
                      multiline
                      placeholder="Mandatory: Enter overall observations for this category..." 
                      value={secData.observation} 
                      onChange={val => setSectionObservation(section.id, val)} 
                      style={{ minHeight: 60, resize: "vertical", marginBottom: 12, borderColor: !secData.observation?.trim() ? "#A32D2D" : undefined }}
                    />
                    <label className="form-label" style={{ fontWeight: 600 }}>Category Photos (Min 3, Max 4) <span className="required">*</span></label>
                    <PhotoUploader 
                      id={section.id} 
                      photos={photosByItem[section.id] || []} 
                      onAdd={addPhoto} 
                      onRemove={removePhoto} 
                      max={4} 
                      isRequired={true} 
                    />
                  </div>
                  {sItems.map(item => {
                    const itemComplete = isItemComplete(item, photoCount(item.id));
                    const scored = item.score !== null;
                    const isLowScore = scored && item.score <= 3;
                    const needsNote = isLowScore && !item.comment?.trim();
                    const needsPhotos = isLowScore && photoCount(item.id) < 1;
                    
                    return (
                      <div key={item.id} className={`checklist-item ${scored ? "scored" : ""} ${itemComplete ? "complete" : needsNote || needsPhotos ? "needs-note" : ""}`}>
                        <div style={{ marginBottom: 8, fontSize: 13, display: "flex", alignItems: "flex-start", gap: 6 }}>
                          <span style={{ flex: 1 }}>{item.label || item.text}</span>
                          {itemComplete && <Icon name="check" size={14} style={{ color: "#0F6E56", flexShrink: 0, marginTop: 1 }} />}
                        </div>
                        
                        {item.qc_comment && (
                          <div style={{ background: "#FCEBEB", padding: 8, borderRadius: 6, marginBottom: 8, borderLeft: "3px solid #A32D2D" }}>
                            <div style={{ fontSize: 11, color: "#A32D2D", fontWeight: 600, marginBottom: 4 }}>⚠️ CORREÇÃO PEDIDA PELO SUPERVISOR:</div>
                            <div style={{ fontSize: 12, color: "#A32D2D" }}>{item.qc_comment}</div>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            {[1, 2, 3, 4, 5].map(n => (
                              <button key={n} className={`score-btn score-${n} ${item.score === n ? "selected" : ""}`} onClick={() => setScore(item.id, n)}>{n}</button>
                            ))}
                          </div>
                          <button className="btn btn-secondary btn-sm" style={{ fontSize: 10, marginLeft: "auto" }} onClick={() => handleShowRefImage(item.id)}>
                            <Icon name="eye" size={12} /> Ref
                          </button>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <VoiceInput 
                            placeholder={isLowScore ? "Observations (Mandatory for low scores)..." : "Observations (Optional)..." }
                            value={item.comment || ""} 
                            onChange={val => setComment(item.id, val)} 
                            style={{ fontSize: 12, borderColor: needsNote ? "#A32D2D" : undefined }}
                          />
                        </div>
                        {isLowScore && needsPhotos && (
                          <div style={{ fontSize: 11, color: "#A32D2D", fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                            <Icon name="alert" size={12} /> Photo evidence required for scores 1-3.
                          </div>
                        )}
                        <PhotoUploader id={item.id} photos={photosByItem[item.id] || []} onAdd={addPhoto} onRemove={removePhoto} max={3} isRequired={isLowScore} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label className="form-label">Observações Gerais da Inspeção</label>
        <VoiceInput multiline placeholder="Notas adicionais sobre esta inspeção..." value={notes} onChange={setNotes} style={{ resize: "vertical" }} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14, color: "#1E2A3A" }}>Assinaturas Obrigatórias</div>
        <div className="form-group">
          <label className="form-label">Nome do Supervisor do Cliente <span className="required">*</span></label>
          <VoiceInput placeholder="Nome do gestor do cliente" value={clientMgrName} onChange={setClientMgrName} />
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 250 }}>
            <SignaturePad label="Assinatura do Inspetor *" onSave={setInspectorSig} onClear={() => setInspectorSig("")} />
            {inspectorSig && <div style={{ fontSize: 11, color: "#0F6E56", marginBottom: 8 }}>✓ Assinatura do Inspetor capturada.</div>}
          </div>
          <div style={{ flex: 1, minWidth: 250 }}>
            <SignaturePad label="Assinatura do Cliente *" onSave={setClientSig} onClear={() => setClientSig("")} />
            {clientSig && <div style={{ fontSize: 11, color: "#0F6E56", marginBottom: 8 }}>✓ Assinatura do Cliente capturada.</div>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
        <button className="btn btn-secondary" onClick={handleSave}>{saved ? <><Icon name="check" size={13} />Guardado!</> : "Guardar Rascunho"}</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={totalComplete === 0}><Icon name="check" size={13} />Submeter Inspeção</button>
      </div>

      {showRefModal && (
        <div className="modal-overlay" onClick={() => setShowRefModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><div style={{ fontSize: 15, fontWeight: 500 }}>Reference Images (Last Inspection)</div><button className="icon-btn" onClick={() => setShowRefModal(null)}><Icon name="x" size={14} /></button></div>
            <div className="modal-body">
              {refPhotos.length === 0 ? <div style={{ textAlign: "center", color: "#888", padding: 20 }}>No reference photos found for this item.</div> : (
                <div className="photo-grid">{refPhotos.map(p => (<div key={p.id} className="photo-thumb"><img src={p.url} alt={p.filename} /></div>))}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
