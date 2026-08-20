// /src/pages/InspectionDetail.jsx
import { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import { Icon } from "../lib/icons";
import ScoreRing from "../components/ScoreRing";
import StatusBadge from "../components/StatusBadge";
import { photoStore } from "../lib/photoStore";
import { getClientTemplate, ROLES } from "../data/constants";
import { scoreLabel, getCategoryHealth, generateAISummary } from "../lib/helpers";

export default function InspectionDetail({ inspection, currentUser, onBack, onUpdate, addAuditLog, allInspections }) {
  const [activeTab, setActiveTab] = useState("resumo");
  const [photosByItem, setPhotosByItem] = useState({});
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [qcItem, setQcItem] = useState(null);
  const [qcText, setQcText] = useState("");
  const [loading, setLoading] = useState(true);

  // Verificar se o usuário pode revisar (ADMIN ou SUPERVISOR)
  const canReview = currentUser && [ROLES.ADMIN, ROLES.SUPERVISOR].includes(currentUser.role);

  // Obter template do cliente para nomes das seções
  const template = getClientTemplate(inspection.location_name);
  const TEMPLATE_SECTIONS = template.sections || [];

  useEffect(() => {
    const loadPhotos = async () => {
      setLoading(true);
      try {
        const grouped = await photoStore.listByInspection(inspection.id);
        setPhotosByItem(grouped);
      } catch (e) {
        console.error("Erro ao carregar fotos:", e);
      } finally {
        setLoading(false);
      }
    };
    loadPhotos();
  }, [inspection.id]);

  // Calcular estatísticas
  const totalItems = inspection.items?.length || 0;
  const scoredItems = inspection.items?.filter(i => i.score !== null) || [];
  const completedItems = scoredItems.length;
  const avgScore = completedItems > 0 
    ? Math.round(scoredItems.reduce((s, i) => s + i.score, 0) / scoredItems.length * 20)
    : 0;
  
  const criticalItems = scoredItems.filter(i => i.score <= 2);
  const okItems = scoredItems.filter(i => i.score >= 4);
  const mediumItems = scoredItems.filter(i => i.score === 3);

  // Calcular scores por categoria
  const sectionScores = TEMPLATE_SECTIONS.map(s => {
    const sItems = inspection.items?.filter(i => i.section_id === s.id && i.score !== null) || [];
    const avg = sItems.length ? Math.round((sItems.reduce((sum, i) => sum + Number(i.score), 0) / (sItems.length * 5)) * 100) : null;
    const health = getCategoryHealth(sItems);
    return { ...s, avg, count: sItems.length, health };
  });

  // ============================================================
  // HEATMAP CORRIGIDO - Analisa todas as inspeções do mesmo cliente
  // ============================================================
  const defectHeatmap = (() => {
    if (!allInspections || allInspections.length === 0) return [];
    
    // Filtrar inspeções do mesmo cliente (incluindo a atual)
    const clientInsps = allInspections.filter(i => 
      i.location_id === inspection.location_id && 
      i.score_pct !== null
    );
    
    // Se não houver outras inspeções do cliente, usar apenas a atual
    const inspsToCheck = clientInsps.length > 0 ? clientInsps : [inspection];
    
    // Mapa para contar defeitos
    const defectMap = {};
    
    inspsToCheck.forEach(insp => {
      (insp.items || []).forEach(item => {
        // Verificar se o item tem score e é crítico (<= 2)
        if (item.score !== null && item.score <= 2) {
          const key = item.label || item.text || "Item sem nome";
          if (!defectMap[key]) {
            defectMap[key] = { 
              count: 0, 
              section: item.section_id,
              lastScore: item.score,
              lastDate: insp.date || "N/A"
            };
          }
          defectMap[key].count++;
          // Atualizar com o último score e data
          defectMap[key].lastScore = item.score;
          if (insp.date && insp.date > defectMap[key].lastDate) {
            defectMap[key].lastDate = insp.date;
          }
        }
      });
    });
    
    // Converter para array e ordenar por frequência
    const results = Object.keys(defectMap)
      .map(key => ({ 
        text: key, 
        count: defectMap[key].count, 
        section: defectMap[key].section,
        lastScore: defectMap[key].lastScore,
        lastDate: defectMap[key].lastDate
      }))
      .sort((a, b) => b.count - a.count);
    
    // Mostrar top 10 ou todos se menos de 10
    return results.slice(0, 10);
  })();
  // ============================================================
  // FIM DO HEATMAP CORRIGIDO
  // ============================================================

  const handleApprove = () => { 
    onUpdate({ ...inspection, status: "reviewed" }); 
    addAuditLog(currentUser, "Inspeção Aprovada", "review", `Aprovou a inspeção de ${inspection.location_name}`); 
  };

  const handleReject = () => {
    if (!rejectNote.trim()) return alert("Por favor, adicione uma nota de correção geral.");
    const updatedItems = inspection.items.map(i => 
      i.id === qcItem ? { ...i, qc_comment: qcText } : i
    );
    onUpdate({ 
      ...inspection, 
      status: "needs_corrections", 
      notes: inspection.notes + `\n\n[NECESSITA CORREÇÃO]: ${rejectNote}`, 
      items: updatedItems 
    });
    addAuditLog(currentUser, "Inspeção Rejeitada", "review", `Rejeitou a inspeção de ${inspection.location_name}. Motivo: ${rejectNote}`);
    setShowRejectBox(false); 
    setRejectNote(""); 
    setQcItem(null);
  };

  // Funções de exportação (PDF e Word)
  const handleDownloadPDF = async () => {
    try {
      const doc = new jsPDF();
      const ai = generateAISummary(inspection.items, inspection.location_name);
      
      // Header
      doc.setFillColor(30, 42, 58); 
      doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255); 
      doc.setFontSize(20); 
      doc.setFont("helvetica", "bold");
      doc.text("Relatório de Inspeção", 105, 15, { align: "center" });
      doc.setFontSize(10); 
      doc.setFont("helvetica", "normal");
      doc.text("NEMCHEM - Field Inspection Management System", 105, 22, { align: "center" });

      // Info Box
      doc.setFillColor(248, 247, 244); 
      doc.roundedRect(14, 35, 182, 30, 3, 3, 'F');
      doc.setTextColor(50, 50, 50); 
      doc.setFontSize(10);
      doc.text(`Cliente: ${inspection.location_name}`, 18, 43);
      doc.text(`Data: ${new Date(inspection.date).toLocaleDateString("pt-PT")}`, 18, 49);
      doc.text(`Inspetor: ${inspection.inspector_name || "N/A"}`, 18, 55);
      doc.text(`Score Total: ${inspection.score_pct || 0}%`, 120, 43);
      doc.text(`Estado: ${(inspection.status || "N/A").toUpperCase()}`, 120, 49);

      let y = 72;
      doc.setFontSize(13); 
      doc.setTextColor(30, 42, 58); 
      doc.setFont("helvetica", "bold");
      doc.text("Executive Summary & AI Recommendations", 14, y); 
      y += 6;
      doc.setFontSize(10); 
      doc.setTextColor(80, 80, 80); 
      doc.setFont("helvetica", "normal");
      const splitSummary = doc.splitTextToSize(ai.summary || "Resumo disponível após conclusão da inspeção.", 180);
      doc.text(splitSummary, 14, y); 
      y += splitSummary.length * 5 + 4;
      
      if (ai.recommendations && ai.recommendations.length > 0) {
        ai.recommendations.forEach(rec => {
          if (y > 270) { doc.addPage(); y = 20; }
          const cleanRec = rec.replace(/\*\*/g, '');
          const splitRec = doc.splitTextToSize(cleanRec, 180);
          doc.text(splitRec, 14, y); 
          y += splitRec.length * 5 + 2;
        });
      }
      y += 6;

      // Sections with Photos
      for (const section of TEMPLATE_SECTIONS) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFillColor(30, 42, 58); 
        doc.roundedRect(14, y, 182, 7, 2, 2, 'F');
        doc.setTextColor(255, 255, 255); 
        doc.setFontSize(11); 
        doc.setFont("helvetica", "bold");
        doc.text(section.name || section.title || "Seção", 18, y + 5); 
        y += 10;

        const secData = inspection.sections?.find(s => s.id === section.id);
        if (secData?.observation) {
          doc.setFontSize(9); 
          doc.setTextColor(80, 80, 80); 
          doc.setFont("helvetica", "italic");
          const splitObs = doc.splitTextToSize(`Obs: ${secData.observation}`, 180);
          doc.text(splitObs, 18, y); 
          y += splitObs.length * 5 + 3;
        }

        const sItems = inspection.items?.filter(i => i.section_id === section.id) || [];
        doc.setFontSize(10);
        for (const item of sItems) {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.setTextColor(40, 40, 40); 
          doc.setFont("helvetica", "normal");
          const itemText = doc.splitTextToSize(item.label || item.text || "Item", 155);
          doc.text(itemText, 18, y);
          if (item.score !== null) {
            const colors = ["230,45,45", "153,60,29", "186,117,23", "59,109,17", "15,110,86"];
            doc.setFillColor(...colors[item.score - 1].split(',').map(Number));
            doc.roundedRect(175, y - 4, 12, 6, 1, 1, 'F');
            doc.setTextColor(255, 255, 255); 
            doc.setFontSize(9); 
            doc.setFont("helvetica", "bold");
            doc.text(item.score.toString(), 181, y, { align: "center" });
          }
          y += itemText.length * 5 + 4;
        }
        y += 6;
      }

      // Signatures
      if (y > 250) { doc.addPage(); y = 20; }
      if (inspection.inspector_sig) { 
        try { 
          doc.addImage(inspection.inspector_sig, 'PNG', 20, y, 40, 15); 
          doc.text("Inspector", 20, y + 20); 
        } catch(e) {} 
      }
      if (inspection.client_sig) { 
        try { 
          doc.addImage(inspection.client_sig, 'PNG', 120, y, 40, 15); 
          doc.text("Client", 120, y + 20); 
        } catch(e) {} 
      }

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) { 
        doc.setPage(i); 
        doc.setFontSize(8); 
        doc.setTextColor(150, 150, 150); 
        doc.text("NEMCHEM © 2024 - Documento gerado pelo FIMS", 105, 290, { align: "center" }); 
      }
      doc.save(`Relatorio-${inspection.location_name || "Inspecao"}.pdf`);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Erro ao gerar PDF. Tente novamente.");
    }
  };

  const handleDownloadWord = () => {
    try {
      const ai = generateAISummary(inspection.items, inspection.location_name);
      let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11pt; color: #333; }
        h1 { background-color: #1E2A3A; color: white; padding: 10px; font-size: 18pt; margin-bottom: 20px; text-align: center; }
        h2 { color: #1E2A3A; border-bottom: 1px solid #ccc; padding-bottom: 4px; font-size: 14pt; margin-top: 24px; }
        .meta { margin-bottom: 20px; background: #f8f7f4; padding: 10px; }
        .meta div { margin-bottom: 4px; }
        .item { margin-bottom: 8px; padding-left: 10px; border-left: 3px solid #eee; }
        .score { font-weight: bold; padding: 2px 6px; border-radius: 4px; color: white; font-size: 9pt; }
        .obs { font-style: italic; color: #555; margin-bottom: 10px; background: #f9f9f9; padding: 8px; }
        .cmt { color: #666; font-size: 10pt; margin-left: 15px; }
        .qc { color: #A32D2D; font-size: 10pt; margin-left: 15px; font-weight: bold; }
        .ai-box { background: #E6F1FB; padding: 10px; margin-bottom: 20px; border-left: 4px solid #378ADD; }
      </style>
      </head><body>`;
      
      html += `<h1>Relatório de Inspeção</h1><div class="meta">
        <div><strong>Cliente:</strong> ${inspection.location_name || "N/A"}</div>
        <div><strong>Data:</strong> ${new Date(inspection.date).toLocaleDateString("pt-PT")}</div>
        <div><strong>Inspetor:</strong> ${inspection.inspector_name || "N/A"}</div>
        <div><strong>Score Total:</strong> ${inspection.score_pct || 0}%</div>
      </div>`;
      
      html += `<div class="ai-box"><strong>🤖 AI Executive Summary:</strong><br/>${ai.summary || "Resumo disponível após conclusão da inspeção."}<br/><br/><strong>Recommendations:</strong><ul>${(ai.recommendations || []).map(r => `<li>${r.replace(/\*\*/g, '')}</li>`).join('')}</ul></div>`;

      TEMPLATE_SECTIONS.forEach(section => {
        const secData = inspection.sections?.find(s => s.id === section.id);
        html += `<h2>${section.name || section.title || "Seção"}</h2>`;
        if (secData?.observation) html += `<div class="obs"><strong>Observation:</strong> ${secData.observation}</div>`;

        const sItems = inspection.items?.filter(i => i.section_id === section.id) || [];
        sItems.forEach(item => {
          const colors = ["#A32D2D", "#993C1D", "#BA7517", "#3B6D11", "#0F6E56"];
          const scoreBg = item.score !== null ? colors[item.score - 1] : "#888";
          const scoreTxt = item.score !== null ? item.score : "N/A";
          html += `<div class="item"><strong>${item.label || item.text || "Item"}</strong> <span class="score" style="background:${scoreBg}">${scoreTxt}/5</span>`;
          if (item.comment) html += `<div class="cmt">→ ${item.comment}</div>`;
          if (item.qc_comment) html += `<div class="qc">⚠ QC: ${item.qc_comment}</div>`;
          html += `</div>`;
        });
      });

      // Signatures
      html += `<div style="margin-top: 40px; display: flex; justify-content: space-between;">`;
      if (inspection.inspector_sig) html += `<div><img src="${inspection.inspector_sig}" style="width: 150px; height: 50px;" /><br/><strong>Inspector Signature</strong></div>`;
      if (inspection.client_sig) html += `<div><img src="${inspection.client_sig}" style="width: 150px; height: 50px;" /><br/><strong>Client Signature</strong></div>`;
      html += `</div>`;

      html += `</body></html>`;
      
      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Relatorio-${inspection.location_name || "Inspecao"}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao gerar Word:", error);
      alert("Erro ao gerar Word. Tente novamente.");
    }
  };

  // Se não houver dados, mostrar loading
  if (!inspection) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ 
          width: 30, 
          height: 30, 
          border: "3px solid #E5E7EB", 
          borderTopColor: "#3B82F6", 
          borderRadius: "50%", 
          animation: "spin 0.8s linear infinite",
          margin: "0 auto 12px"
        }} />
        <p>Carregando detalhes da inspeção...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>
            ← Voltar
          </button>
          <div className="page-title">{inspection.location_name || "Inspeção"}</div>
          <div className="page-sub">
            Inspeção - {inspection.date || "Data não definida"} - {inspection.inspector_name || "Não atribuído"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <ScoreRing pct={inspection.score_pct} size={56} />
          <StatusBadge status={inspection.status} />
        </div>
      </div>

      {/* Export Buttons */}
      <div className="card" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>📄 Exportar Relatório Oficial</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-danger btn-sm" onClick={handleDownloadPDF}>
            <Icon name="download" size={13} /> PDF
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleDownloadWord}>
            <Icon name="file" size={13} /> Word
          </button>
          {inspection.status === "reviewed" && (
            <button className="btn btn-secondary btn-sm" onClick={() => onUpdate({ ...inspection, status: "sent_to_client" })}>
              <Icon name="send" size={13} /> Enviar ao Cliente
            </button>
          )}
        </div>
      </div>

      {/* QC Actions */}
      {canReview && inspection.status === "submitted" && (
        <div className="card" style={{ marginBottom: 16, background: "#F8F7F4", border: "1px solid #EF9F27" }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>🔍 Controlo de Qualidade (QC)</div>
          {!showRejectBox ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-success btn-sm" onClick={handleApprove}>
                <Icon name="check" size={13} /> Aprovar Inspeção
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setShowRejectBox(true)}>
                <Icon name="x" size={13} /> Rejeitar
              </button>
            </div>
          ) : (
            <div>
              <textarea 
                className="form-textarea" 
                placeholder="Motivo da rejeição (obrigatório)..." 
                value={rejectNote} 
                onChange={e => setRejectNote(e.target.value)} 
                style={{ marginBottom: 10, minHeight: 80 }} 
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-danger btn-sm" onClick={handleReject}>Confirmar Rejeição</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowRejectBox(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {inspection.status === "needs_corrections" && (
        <div className="alert-bar alert-critical">
          <Icon name="alert" size={14} />
          <div>Esta inspeção foi rejeitada e precisa de correções. Verifique os itens marcados.</div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ 
        display: "flex", 
        gap: 4, 
        marginBottom: 16,
        borderBottom: "1px solid #E5E7EB",
        flexWrap: "wrap"
      }}>
        {[
          { id: "resumo", label: "📋 Resumo" },
          { id: "detalhes", label: "📝 Detalhes" },
          { id: "evidencias", label: "📸 Evidências" },
          { id: "heatmap", label: "🔥 Heatmap" }
        ].map(t => (
          <div 
            key={t.id} 
            className={`tab ${activeTab === t.id ? "active" : ""}`} 
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "8px 16px",
              cursor: "pointer",
              borderRadius: "6px 6px 0 0",
              background: activeTab === t.id ? "#1E2A3A" : "transparent",
              color: activeTab === t.id ? "white" : "#6B7280",
              fontWeight: activeTab === t.id ? 600 : 400,
              fontSize: 13,
              transition: "all 0.2s ease"
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      {/* Tab: Resumo */}
      {activeTab === "resumo" && (
        <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#1E2A3A" }}>
              📊 Category Health Scores
            </div>
            {sectionScores.length > 0 ? (
              sectionScores.map(s => {
                const health = s.health || { health: 0, color: "#888", risk: "N/A" };
                return (
                  <div key={s.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: "#444" }}>{s.name || s.title || "Seção"}</span>
                      <span style={{ fontWeight: 500, color: health.color }}>
                        {s.avg !== null ? `${s.avg}%` : "N/A"} 
                        {s.avg !== null && ` (${health.risk})`}
                      </span>
                    </div>
                    <div className="progress-bar" style={{ height: 6, background: "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
                      <div className="progress-fill" style={{ 
                        width: `${s.avg !== null ? Math.min(s.avg, 100) : 0}%`, 
                        background: health.color || "#888",
                        height: "100%",
                        transition: "width 0.3s ease"
                      }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ color: "#888", fontSize: 13, textAlign: "center", padding: 20 }}>
                Nenhuma categoria disponível
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#1E2A3A" }}>
              ℹ️ Informações
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {[
                ["Local", inspection.location_name || "N/A"],
                ["Inspetor", inspection.inspector_name || "Não atribuído"],
                ["Data", inspection.date || "N/A"],
                ["Score Total", inspection.score_pct ? `${inspection.score_pct}%` : "—"],
                ["GPS", inspection.gps_coords ? 
                  <a 
                    href={`https://maps.google.com/?q=${inspection.gps_coords}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{color: "#378ADD", textDecoration: "none"}}
                  >
                    📍 Ver Mapa →
                  </a> : 
                  <span style={{ color: "#888", fontSize: 12 }}>
                    Não disponível
                    <span style={{ display: "block", fontSize: 10, color: "#9CA3AF" }}>
                      (Ative o GPS na próxima inspeção)
                    </span>
                  </span>
                ]
              ].map(([k, v]) => (
                <div key={k} style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  padding: "6px 0", 
                  borderBottom: "0.5px solid rgba(0,0,0,0.06)",
                  fontSize: 13,
                  flexWrap: "wrap",
                  gap: 4
                }}>
                  <span style={{ color: "#888" }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            {inspection.notes && (
              <div style={{ marginTop: 12, padding: 10, background: "#F8F7F4", borderRadius: 6, fontSize: 12, color: "#444" }}>
                <strong>Notas:</strong> {inspection.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Detalhes */}
      {activeTab === "detalhes" && (
        <div>
          {TEMPLATE_SECTIONS.length > 0 ? (
            TEMPLATE_SECTIONS.map(section => {
              const sItems = inspection.items?.filter(i => i.section_id === section.id) || [];
              if (sItems.length === 0) return null;
              const secData = inspection.sections?.find(s => s.id === section.id);
              
              return (
                <div key={section.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    marginBottom: 10, 
                    color: "#1E2A3A",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 4
                  }}>
                    <span>{section.name || section.title || "Seção"}</span>
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#888" }}>
                      {sItems.filter(i => i.score !== null).length}/{sItems.length} avaliados
                    </span>
                  </div>
                  
                  {secData?.observation && (
                    <div style={{ background: "#F8F7F4", padding: 8, borderRadius: 6, marginBottom: 10, fontSize: 12 }}>
                      <strong>Obs.:</strong> {secData.observation}
                    </div>
                  )}
                  
                  {sItems.map(item => (
                    <div key={item.id} style={{ 
                      padding: "8px 0", 
                      borderBottom: "0.5px solid rgba(0,0,0,0.05)",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                      gap: 8
                    }}>
                      <div style={{ flex: 1, fontSize: 13, color: "#444", minWidth: 200 }}>
                        {item.label || item.text || "Item"}
                      </div>
                      {item.score !== null ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ 
                            width: 28, 
                            height: 28, 
                            borderRadius: 6, 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center", 
                            fontSize: 12, 
                            fontWeight: 600, 
                            color: "#fff", 
                            background: ["#A32D2D", "#993C1D", "#BA7517", "#3B6D11", "#0F6E56"][item.score - 1] 
                          }}>
                            {item.score}
                          </div>
                          <span style={{ fontSize: 11, color: "#888" }}>
                            {["Mau", "Deficiente", "Média", "Bom", "Excelente"][item.score - 1]}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "#B4B2A9" }}>N/A</span>
                      )}
                      
                      {item.comment && (
                        <div style={{ width: '100%', fontSize: 12, color: '#666', background: '#F8F7F4', padding: '6px 10px', borderRadius: 6, marginTop: 4 }}>
                          📝 {item.comment}
                        </div>
                      )}
                      {item.qc_comment && (
                        <div style={{ width: '100%', fontSize: 12, color: '#A32D2D', background: '#FCEBEB', padding: '6px 10px', borderRadius: 6, marginTop: 4, borderLeft: "3px solid #A32D2D" }}>
                          ⚠️ Correção: {item.qc_comment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })
          ) : (
            <div className="card">
              <div style={{ textAlign: "center", padding: 30, color: "#888" }}>
                Nenhum detalhe disponível para esta inspeção.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Evidências */}
      {activeTab === "evidencias" && (
        <div>
          {loading ? (
            <div className="card" style={{ textAlign: "center", padding: 40, color: "#888" }}>
              <div style={{ 
                width: 30, 
                height: 30, 
                border: "3px solid #E5E7EB", 
                borderTopColor: "#3B82F6", 
                borderRadius: "50%", 
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 12px"
              }} />
              <p>Carregando fotos...</p>
            </div>
          ) : Object.keys(photosByItem).length === 0 ? (
            <div className="card">
              <div style={{ fontSize: 13, color: "#888", textAlign: "center", padding: 40 }}>
                <Icon name="camera" size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <p>Nenhuma evidência fotográfica disponível.</p>
              </div>
            </div>
          ) : (
            TEMPLATE_SECTIONS.map(section => {
              const secPhotos = photosByItem[section.id] || [];
              const sItems = inspection.items?.filter(i => i.section_id === section.id) || [];
              const itemPhotos = sItems.flatMap(i => photosByItem[i.id] || []);
              const allPhotos = [...secPhotos, ...itemPhotos];
              
              if (allPhotos.length === 0) return null;
              
              return (
                <div key={section.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#1E2A3A" }}>
                    {section.name || section.title || "Seção"} ({allPhotos.length} fotos)
                  </div>
                  <div className="photo-grid" style={{ 
                    display: "grid", 
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", 
                    gap: 8 
                  }}>
                    {allPhotos.map((p, idx) => (
                      <div 
                        key={p.id || idx} 
                        className="photo-thumb" 
                        style={{ 
                          aspectRatio: "1/1",
                          borderRadius: 6,
                          overflow: "hidden",
                          border: "1px solid #E5E7EB",
                          cursor: "pointer",
                          position: "relative"
                        }}
                        onClick={() => setLightboxUrl(p.url)}
                      >
                        <img 
                          src={p.url} 
                          alt={p.filename || `Evidência ${idx + 1}`} 
                          style={{ 
                            width: "100%", 
                            height: "100%", 
                            objectFit: "cover",
                            transition: "transform 0.2s ease"
                          }}
                        />
                        <div style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(0,0,0,0.6)",
                          color: "white",
                          fontSize: 10,
                          padding: "2px 6px",
                          textAlign: "center"
                        }}>
                          Foto {idx + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* Tab: Heatmap - CORRIGIDO */}
      {/* ============================================================ */}
      {activeTab === "heatmap" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, margin: 0, color: "#1E2A3A" }}>
              🔥 Defeitos Recorrentes
            </h3>
            <span style={{ fontSize: 11, color: "#888" }}>
              {allInspections?.filter(i => i.location_id === inspection.location_id && i.score_pct !== null).length || 0} inspeções analisadas
            </span>
          </div>
          
          <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
            Itens que receberam score <strong>1 ou 2</strong> (Mau/Deficiente) nas inspeções deste cliente.
            {defectHeatmap.length > 0 && ` ${defectHeatmap.length} defeitos identificados.`}
          </p>
          
          {defectHeatmap.length === 0 ? (
            <div style={{ 
              textAlign: "center", 
              padding: "40px 20px", 
              color: "#888",
              background: "#F8F7F4",
              borderRadius: 8
            }}>
              <Icon name="check-circle" size={40} style={{ color: "#0F6E56", marginBottom: 12 }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: "#0F6E56", margin: 0 }}>
                ✅ Nenhum defeito recorrente encontrado
              </p>
              <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                {allInspections?.filter(i => i.location_id === inspection.location_id && i.score_pct !== null).length > 1 
                  ? "Este cliente não tem problemas críticos recorrentes." 
                  : "É necessário pelo menos 2 inspeções para identificar padrões."}
              </p>
            </div>
          ) : (
            <>
              {defectHeatmap.map((defect, i) => {
                const severity = defect.count >= 4 ? "Crítico" : defect.count >= 2 ? "Alto" : "Médio";
                const color = defect.count >= 4 ? "#A32D2D" : defect.count >= 2 ? "#EF9F27" : "#FAC775";
                const pct = Math.min((defect.count / 5) * 100, 100);
                const sectionName = TEMPLATE_SECTIONS.find(s => s.id === defect.section)?.name || "Geral";
                const severityIcon = defect.count >= 4 ? "🔴" : defect.count >= 2 ? "🟠" : "🟡";
                
                return (
                  <div 
                    key={i} 
                    style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center", 
                      padding: "10px 12px", 
                      borderBottom: i < defectHeatmap.length - 1 ? "1px solid #F3F4F6" : "none",
                      flexWrap: "wrap",
                      gap: 8,
                      background: i % 2 === 0 ? "white" : "#FAFAFA",
                      borderRadius: 4,
                      marginBottom: 2
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ 
                        fontSize: 13, 
                        fontWeight: 500, 
                        color: "#1E2A3A",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}>
                        <span>{severityIcon}</span>
                        <span>{defect.text}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                        {sectionName} • Último score: {defect.lastScore || 1}/5
                        {defect.lastDate && defect.lastDate !== "N/A" && ` • ${new Date(defect.lastDate).toLocaleDateString("pt-PT")}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ 
                        fontSize: 16, 
                        fontWeight: 700, 
                        color: color,
                        minWidth: 35,
                        textAlign: "center"
                      }}>
                        {defect.count}x
                      </span>
                      <span style={{ 
                        fontSize: 10, 
                        padding: "2px 10px", 
                        borderRadius: 10, 
                        background: color + "20",
                        color: color,
                        fontWeight: 600
                      }}>
                        {severity}
                      </span>
                      <div style={{ width: 70, height: 6, background: "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ 
                          width: `${pct}%`, 
                          height: "100%", 
                          background: color,
                          transition: "width 0.5s ease",
                          borderRadius: 3
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Legenda */}
              <div style={{ 
                marginTop: 16, 
                display: "flex", 
                gap: 16, 
                justifyContent: "center", 
                flexWrap: "wrap",
                padding: "8px 0",
                borderTop: "1px solid #E5E7EB",
                paddingTop: 16
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: "#A32D2D" }} />
                  <span style={{ fontSize: 11, color: "#666" }}>Crítico (≥4x)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: "#EF9F27" }} />
                  <span style={{ fontSize: 11, color: "#666" }}>Alto (2-3x)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: "#FAC775" }} />
                  <span style={{ fontSize: 11, color: "#666" }}>Médio (1x)</span>
                </div>
              </div>
              
              {/* Recomendação */}
              {defectHeatmap.some(d => d.count >= 3) && (
                <div style={{ 
                  marginTop: 12, 
                  padding: "10px 14px", 
                  background: "#FEF2F2", 
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#991B1B",
                  border: "1px solid #FCA5A5",
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}>
                  <Icon name="alert" size={16} />
                  <span>
                    <strong>Recomendação:</strong> Os itens com alta frequência de falhas (&gt;3x) devem ser priorizados para ações corretivas e treinamento da equipa.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* ============================================================ */}
      {/* FIM DO HEATMAP CORRIGIDO */}
      {/* ============================================================ */}

      {/* Lightbox */}
      {lightboxUrl && (
        <div 
          className="photo-lightbox-overlay" 
          onClick={() => setLightboxUrl(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "pointer"
          }}
        >
          <img 
            src={lightboxUrl} 
            alt="Evidência" 
            style={{ 
              maxWidth: "90%", 
              maxHeight: "90%", 
              objectFit: "contain",
              borderRadius: 4
            }} 
          />
          <button 
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              background: "none",
              border: "none",
              color: "white",
              fontSize: 30,
              cursor: "pointer"
            }}
          >
            ✕
          </button>
        </div>
      )}

      <style>{`
        .tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 16px;
          border-bottom: 1px solid #E5E7EB;
          flex-wrap: wrap;
        }
        .tab {
          padding: 8px 16px;
          cursor: pointer;
          border-radius: 6px 6px 0 0;
          background: transparent;
          color: #6B7280;
          font-size: 13px;
          transition: all 0.2s ease;
        }
        .tab:hover {
          background: #F3F4F6;
        }
        .tab.active {
          background: #1E2A3A;
          color: white;
          font-weight: 600;
        }
        .card {
          background: white;
          border-radius: 10px;
          padding: 16px;
          border: 1px solid #E5E7EB;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-sm {
          padding: 4px 12px;
          font-size: 12px;
        }
        .btn-primary { background: #1E2A3A; color: white; }
        .btn-primary:hover { background: #2D3A4A; }
        .btn-success { background: #0F6E56; color: white; }
        .btn-success:hover { background: #0B5A46; }
        .btn-danger { background: #A32D2D; color: white; }
        .btn-danger:hover { background: #8A2525; }
        .btn-secondary { background: #F3F4F6; color: #374151; }
        .btn-secondary:hover { background: #E5E7EB; }
        .alert-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-radius: 8px;
          margin-bottom: 12px;
          font-size: 13px;
        }
        .alert-critical { background: #FEF2F2; color: #991B1B; border: 1px solid #FCA5A5; }
        .alert-info { background: #EFF6FF; color: #1E40AF; border: 1px solid #93C5FD; }
        .photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 8px;
        }
        .photo-thumb {
          aspect-ratio: 1/1;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid #E5E7EB;
          cursor: pointer;
          position: relative;
        }
        .photo-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.2s ease;
        }
        .photo-thumb img:hover {
          transform: scale(1.05);
        }
        .two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 768px) {
          .two-col {
            grid-template-columns: 1fr;
          }
          .photo-grid {
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          }
          .page-header {
            flex-direction: column;
            align-items: flex-start;
          }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
