// /src/pages/ReportCenter.jsx
import { useState } from "react";
import { jsPDF } from "jspdf";
import { Icon } from "../lib/icons";
import { calcScore, getCategoryHealth } from "../lib/helpers";
import { getClientTemplate } from "../data/constants";
import { photoStore } from "../lib/photoStore";

export default function ReportCenter({ inspections, locations, users }) {
  const [reportType, setReportType] = useState("daily");
  const [clientId, setClientId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split("T")[0]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Helper to load all photos for an inspection
  const loadInspectionPhotos = async (inspId) => {
    try {
      return await photoStore.listByInspection(inspId);
    } catch (e) {
      return {};
    }
  };

  // Helper to convert Image URL to Base64 for PDF/Word
  const getBase64 = (url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  // Helper para obter o nome da seção
  const getSectionName = (sectionId) => {
    const template = getClientTemplate('');
    const section = template.sections?.find(s => s.id === sectionId);
    return section?.title || section?.name || sectionId || "N/A";
  };

  const handleGenerate = async (format) => {
    if (!clientId) {
      alert("Por favor, selecione um cliente.");
      return;
    }
    
    setGenerating(true);
    setProgress(0);
    
    try {
      const client = locations.find(l => l.id === Number(clientId));
      let clientInsps = inspections.filter(i => i.location_id === Number(clientId) && i.score_pct !== null);

      if (reportType === "daily") {
        clientInsps = clientInsps.filter(i => i.date === dailyDate);
        if (clientInsps.length === 0) {
          setGenerating(false);
          alert("Nenhuma inspeção submetida encontrada para esta data.");
          return;
        }
      } else {
        clientInsps = clientInsps.filter(i => i.date.startsWith(month));
        if (clientInsps.length === 0) {
          setGenerating(false);
          alert("Nenhuma inspeção submetida encontrada para este mês.");
          return;
        }
      }

      setProgress(20);

      // Load all photos for these inspections
      const inspData = [];
      let loaded = 0;
      for (const insp of clientInsps) {
        const photos = await loadInspectionPhotos(insp.id);
        inspData.push({ ...insp, photosByItem: photos });
        loaded++;
        setProgress(20 + Math.round((loaded / clientInsps.length) * 50));
      }

      setProgress(70);

      if (format === "pdf") {
        const doc = new jsPDF('p', 'mm', 'a4');
        await generatePDF(doc, client, inspData, reportType === "daily" ? dailyDate : month, reportType);
        const dateStr = reportType === "daily" ? dailyDate : month;
        doc.save(`Nemchem_${reportType === "daily" ? "Diario" : "Mensal"}_${client.name}_${dateStr}.pdf`);
      } else {
        await generateWord(client, inspData, reportType === "daily" ? dailyDate : month, reportType);
      }

      setProgress(100);
      
    } catch (error) {
      console.error("Erro ao gerar relatório:", error);
      alert(`Erro ao gerar relatório: ${error.message}`);
    } finally {
      setTimeout(() => {
        setGenerating(false);
        setProgress(0);
      }, 1000);
    }
  };

  const generatePDF = async (doc, client, inspData, dateStr, type) => {
    let y = 40;

    // --- CORPORATE HEADER ---
    doc.setFillColor(30, 42, 58);
    doc.rect(0, 0, 210, 38, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("NEMCHEM", 14, 22);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Avª Joaquim Chissano nº2305, Matola – Moçambique", 14, 30);
    doc.text("Tel: 21 74 94 26 / 84 300 7940 | supervisao@nemchem.co.mz", 14, 36);
    
    // --- TITLE ---
    y = 52;
    doc.setTextColor(30, 42, 58);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    const title = type === "daily" ? "RELATÓRIO DIÁRIO DE INSPEÇÃO" : "RELATÓRIO MENSAL DE ATIVIDADES";
    doc.text(title, 105, y, { align: "center" });
    y += 8;
    
    // Linha decorativa
    doc.setDrawColor(30, 42, 58);
    doc.setLineWidth(0.5);
    doc.line(50, y, 160, y);
    y += 10;

    // --- META INFO ---
    const insp = inspData[0];
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    
    const metaData = [
      [`Cliente:`, client.name],
      [`Endereço:`, client.address],
      [`Atenção:`, insp?.client_mgr_name || "N/A"],
      [`Data do Relatório:`, new Date().toLocaleDateString("pt-PT")],
      [`Período:`, type === "daily" ? dateStr : `Mês de ${new Date(dateStr + "-01").toLocaleDateString("pt-PT", { month: 'long', year: 'numeric' })}`]
    ];
    
    metaData.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, 55, y);
      y += 6;
    });
    y += 8;

    // --- EXECUTIVE SUMMARY ---
    doc.setFillColor(248, 247, 244);
    doc.roundedRect(14, y, 182, 22, 3, 3, 'F');
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    
    const summaryText = type === "daily" 
      ? "📋 Durante a inspeção de hoje, foram avaliadas todas as áreas conforme o plano de qualidade. Os resultados críticos estão detalhados abaixo, com as respetivas evidências fotográficas e observações."
      : "📊 Durante o período em análise, todas as inspeções e atividades de limpeza agendadas foram realizadas conforme o programa de manutenção acordado. A qualidade geral do serviço permaneceu satisfatória, com operações de rotina concluídas com sucesso.";
    
    const splitSummary = doc.splitTextToSize(summaryText, 175);
    doc.text(splitSummary, 16, y + 7);
    y += splitSummary.length * 5 + 15;

    if (type === "daily") {
      // --- DAILY REPORT ---
      
      // 1. Resumo do Dia
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 42, 58);
      doc.text("1. Resumo do Dia", 14, y);
      y += 6;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      const totalItems = inspData.reduce((s, i) => s + (i.items || []).length, 0);
      const completedItems = inspData.reduce((s, i) => s + (i.items || []).filter(it => it.score !== null).length, 0);
      const avgScore = Math.round(inspData.reduce((s, i) => s + (i.score_pct || 0), 0) / inspData.length);
      
      doc.text(`• Total de itens avaliados: ${totalItems}`, 14, y);
      y += 5;
      doc.text(`• Itens com pontuação: ${completedItems} (${Math.round(completedItems/totalItems*100)}%)`, 14, y);
      y += 5;
      doc.text(`• Score médio do dia: ${avgScore}%`, 14, y);
      y += 5;
      doc.text(`• Inspeções realizadas: ${inspData.length}`, 14, y);
      y += 10;

      // 2. Resultados Críticos
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(163, 45, 45);
      doc.text("2. Resultados Críticos (Score ≤ 3)", 14, y);
      y += 8;
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      let findingsCount = 0;
      for (const insp of inspData) {
        for (const item of (insp.items || [])) {
          if (item.score !== null && item.score <= 3) {
            findingsCount++;
            if (y > 250) { doc.addPage(); y = 20; }
            
            const secName = getSectionName(item.section_id);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 42, 58);
            doc.text(`${secName}: ${item.label || item.text}`, 14, y);
            y += 6;
            
            doc.setFont("helvetica", "normal");
            doc.setTextColor(50, 50, 50);
            const severity = item.score === 1 ? "Crítica" : item.score === 2 ? "Alta" : "Média";
            const scoreColor = item.score === 1 ? "#A32D2D" : item.score === 2 ? "#EF9F27" : "#FAC775";
            doc.setTextColor(163, 45, 45);
            doc.text(`Score: ${item.score}/5  |  Severidade: ${severity}`, 14, y);
            y += 5;
            
            doc.setTextColor(50, 50, 50);
            const obs = doc.splitTextToSize(`Observação: ${item.comment || "N/A"}`, 170);
            doc.text(obs, 14, y);
            y += obs.length * 5 + 4;
            
            // Photos
            const photos = insp.photosByItem?.[item.id] || [];
            if (photos.length > 0) {
              let imgX = 14;
              for (let i = 0; i < Math.min(photos.length, 4); i++) {
                if (imgX > 160) { imgX = 14; y += 38; }
                if (y > 250) { doc.addPage(); y = 20; }
                try {
                  const base64 = await getBase64(photos[i].url);
                  if (base64) doc.addImage(base64, 'JPEG', imgX, y, 42, 32);
                  imgX += 46;
                } catch(e) {}
              }
              y += 38;
            }
            y += 4;
          }
        }
      }
      
      if (findingsCount === 0) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 110, 86);
        doc.text("✅ Nenhum resultado crítico encontrado. Todas as áreas pontuaram 4 ou 5.", 14, y);
        y += 10;
      }

    } else {
      // --- MONTHLY REPORT ---
      
      // 1. KPIs
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 42, 58);
      doc.text("1. Resumo de Desempenho Mensal", 14, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      
      const totalInsps = inspData.length;
      const avgScore = Math.round(inspData.reduce((s, i) => s + (i.score_pct || 0), 0) / totalInsps);
      const criticals = inspData.reduce((s, i) => s + (i.items || []).filter(it => it.score !== null && it.score <= 2).length, 0);
      const totalItems = inspData.reduce((s, i) => s + (i.items || []).length, 0);
      
      const kpis = [
        ["Total Inspeções", totalInsps],
        ["Score Médio", `${avgScore}%`],
        ["Problemas Críticos", criticals],
        ["Itens Avaliados", totalItems]
      ];
      
      let kpiX = 14;
      kpis.forEach(([label, val]) => {
        doc.setFillColor(30, 42, 58);
        doc.roundedRect(kpiX, y, 42, 22, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(label, kpiX + 21, y + 9, { align: "center" });
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(String(val), kpiX + 21, y + 18, { align: "center" });
        kpiX += 46;
      });
      
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
      y += 30;

      // 2. Daily Log
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 42, 58);
      doc.text("2. Registo de Atividades", 14, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      for (const insp of inspData.sort((a, b) => new Date(a.date) - new Date(b.date))) {
        if (y > 240) { doc.addPage(); y = 20; }
        
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 42, 58);
        const dateFormatted = new Date(insp.date).toLocaleDateString("pt-PT", { weekday: 'long', day: 'numeric', month: 'long' });
        doc.text(`📅 ${dateFormatted}`, 14, y);
        y += 6;
        
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "normal");
        
        // Contar itens por status
        const total = (insp.items || []).length;
        const scored = (insp.items || []).filter(it => it.score !== null).length;
        const critical = (insp.items || []).filter(it => it.score !== null && it.score <= 2).length;
        
        const actText = doc.splitTextToSize(
          `Score: ${insp.score_pct || 0}%  |  Itens: ${scored}/${total}  |  Críticos: ${critical}`,
          180
        );
        doc.text(actText, 14, y);
        y += actText.length * 5 + 4;

        // Photos for this day
        const allPhotos = Object.values(insp.photosByItem || {}).flat();
        if (allPhotos.length > 0) {
          let imgX = 14;
          let rowY = y;
          for (let i = 0; i < Math.min(allPhotos.length, 12); i++) {
            if (imgX > 160) { imgX = 14; rowY += 38; }
            if (rowY > 250) { doc.addPage(); y = 20; rowY = y; imgX = 14; }
            try {
              const base64 = await getBase64(allPhotos[i].url);
              if (base64) {
                doc.addImage(base64, 'JPEG', imgX, rowY, 42, 32);
                imgX += 46;
              }
            } catch(e) {}
          }
          y = rowY + 40;
        } else {
          y += 4;
        }
        y += 4;
      }
    }

    // --- SIGNATURES ---
    if (y > 240) { doc.addPage(); y = 20; }
    y += 10;
    
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    
    // Linhas de assinatura
    doc.line(20, y, 85, y);
    doc.line(125, y, 190, y);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.text("Assinatura do Inspetor", 20, y + 5);
    doc.text("Assinatura do Cliente", 125, y + 5);
    
    // Nomes
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(inspData[0]?.inspector_name || "", 20, y + 12);
    doc.text(inspData[0]?.client_mgr_name || "", 125, y + 12);
    
    // Assinaturas digitais
    if (inspData[0]?.inspector_sig) {
      try { 
        doc.addImage(inspData[0].inspector_sig, 'PNG', 20, y-18, 50, 18); 
      } catch(e) {}
    }
    if (inspData[0]?.client_sig) {
      try { 
        doc.addImage(inspData[0].client_sig, 'PNG', 125, y-18, 50, 18); 
      } catch(e) {}
    }

    // --- FOOTER ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setFont("helvetica", "normal");
      doc.text("NEMCHEM © 2026 - Documento gerado pelo FIMS", 105, 290, { align: "center" });
      doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: "right" });
    }
  };

  const generateWord = async (client, inspData, dateStr, type) => {
    const insp = inspData[0];
    const isDaily = type === "daily";
    
    let html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' 
      xmlns:w='urn:schemas-microsoft-com:office:word' 
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Relatório ${isDaily ? 'Diário' : 'Mensal'}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>
    body { 
      font-family: 'Arial', 'Helvetica', sans-serif; 
      font-size: 11pt; 
      color: #333333;
      margin: 40px;
      line-height: 1.5;
    }
    .header { 
      background-color: #1E2A3A; 
      color: white; 
      padding: 20px 25px; 
      margin-bottom: 25px;
    }
    .header h1 { 
      font-size: 22pt; 
      margin: 0;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .header p { 
      font-size: 9pt; 
      margin: 5px 0 0 0;
      opacity: 0.8;
    }
    .title { 
      text-align: center; 
      font-size: 14pt; 
      font-weight: bold; 
      margin: 30px 0 20px 0; 
      text-transform: uppercase;
      color: #1E2A3A;
      letter-spacing: 2px;
      border-bottom: 2px solid #1E2A3A;
      padding-bottom: 12px;
    }
    .meta { 
      margin-bottom: 25px;
      background: #F8F7F4;
      padding: 15px 20px;
      border-left: 4px solid #1E2A3A;
    }
    .meta div { 
      margin-bottom: 3px;
      font-size: 10pt;
    }
    .meta strong {
      color: #1E2A3A;
    }
    .summary { 
      background: #F8F7F4; 
      padding: 15px 20px; 
      margin-bottom: 25px; 
      font-style: italic; 
      border-left: 4px solid #1E2A3A;
      font-size: 10pt;
      color: #333;
    }
    h2 { 
      color: #1E2A3A; 
      border-bottom: 2px solid #E5E7EB; 
      padding-bottom: 8px; 
      font-size: 13pt; 
      margin-top: 30px;
      margin-bottom: 16px;
    }
    .finding { 
      margin-bottom: 20px; 
      padding: 15px 18px; 
      border: 1px solid #E5E7EB; 
      background: #FFFFFF;
      border-radius: 4px;
    }
    .finding h3 { 
      margin: 0 0 8px 0; 
      font-size: 11pt; 
      color: #A32D2D;
    }
    .score-badge {
      display: inline-block;
      padding: 2px 14px;
      border-radius: 12px;
      font-weight: bold;
      font-size: 10pt;
      color: white;
    }
    .score-critical { background: #A32D2D; }
    .score-high { background: #EF9F27; }
    .score-medium { background: #FAC775; color: #333; }
    .score-ok { background: #0F6E56; }
    .kpi-grid { 
      display: table; 
      width: 100%; 
      margin: 20px 0; 
      border-collapse: collapse;
    }
    .kpi-card { 
      display: table-cell; 
      width: 25%; 
      background: #1E2A3A; 
      color: white; 
      padding: 15px 10px; 
      text-align: center; 
      border: 2px solid white;
    }
    .kpi-val { 
      font-size: 20pt; 
      font-weight: bold; 
      display: block;
    }
    .kpi-lbl { 
      font-size: 9pt; 
      display: block;
      opacity: 0.8;
    }
    .daily-log { 
      margin-bottom: 25px;
      padding: 15px 18px;
      background: #FAFAFA;
      border-left: 3px solid #1E2A3A;
    }
    .daily-log h3 { 
      margin: 0 0 8px 0; 
      color: #1E2A3A;
      font-size: 11pt;
    }
    .photo-grid { 
      display: table; 
      width: 100%; 
      margin: 10px 0;
      border-collapse: collapse;
    }
    .photo-cell { 
      display: table-cell; 
      width: 33.33%; 
      padding: 5px;
      text-align: center;
      vertical-align: middle;
    }
    .photo-cell img { 
      width: 100%; 
      max-height: 150px; 
      object-fit: cover;
      border: 1px solid #E5E7EB;
      border-radius: 4px;
    }
    .signatures { 
      margin-top: 50px; 
      display: table; 
      width: 100%;
      border-collapse: collapse;
    }
    .sig-cell { 
      display: table-cell; 
      width: 50%; 
      text-align: center; 
      padding-top: 20px; 
      border-top: 2px solid #333;
      padding: 20px 10px 0 10px;
    }
    .sig-cell img {
      max-width: 150px;
      max-height: 50px;
      object-fit: contain;
    }
    .sig-cell strong {
      display: block;
      margin-top: 8px;
      font-size: 10pt;
      color: #1E2A3A;
    }
    .sig-cell .sig-name {
      font-size: 10pt;
      color: #888;
      margin-top: 4px;
    }
    .footer { 
      margin-top: 40px; 
      text-align: center; 
      font-size: 9pt; 
      color: #888; 
      border-top: 1px solid #E5E7EB; 
      padding-top: 15px;
    }
    .page-break { page-break-before: always; }
    .text-muted { color: #888; font-size: 10pt; }
    .mt-2 { margin-top: 12px; }
  </style>
</head>
<body>`;

    // HEADER
    html += `<div class="header">
      <h1>NEMCHEM</h1>
      <p>Avª Joaquim Chissano nº2305, Matola – Moçambique<br/>
      Tel: 21 74 94 26 / 84 300 7940 | supervisao@nemchem.co.mz</p>
    </div>`;

    // TITLE
    html += `<div class="title">${isDaily ? 'Relatório Diário de Inspeção' : 'Relatório Mensal de Atividades'}</div>`;

    // META
    html += `<div class="meta">
      <div><strong>Cliente:</strong> ${client.name}</div>
      <div><strong>Endereço:</strong> ${client.address}</div>
      <div><strong>Atenção:</strong> ${insp?.client_mgr_name || "N/A"}</div>
      <div><strong>Data do Relatório:</strong> ${new Date().toLocaleDateString("pt-PT")}</div>
      <div><strong>Período:</strong> ${isDaily ? dateStr : `Mês de ${new Date(dateStr + "-01").toLocaleDateString("pt-PT", { month: 'long', year: 'numeric' })}`}</div>
    </div>`;

    // SUMMARY
    const summaryText = isDaily 
      ? "📋 Durante a inspeção de hoje, foram avaliadas todas as áreas conforme o plano de qualidade. Os resultados críticos estão detalhados abaixo, com as respetivas evidências fotográficas e observações."
      : "📊 Durante o período em análise, todas as inspeções e atividades de limpeza agendadas foram realizadas conforme o programa de manutenção acordado. A qualidade geral do serviço permaneceu satisfatória, com operações de rotina concluídas com sucesso.";
    html += `<div class="summary">${summaryText}</div>`;

    if (isDaily) {
      // DAILY REPORT
      const totalItems = inspData.reduce((s, i) => s + (i.items || []).length, 0);
      const completedItems = inspData.reduce((s, i) => s + (i.items || []).filter(it => it.score !== null).length, 0);
      const avgScore = Math.round(inspData.reduce((s, i) => s + (i.score_pct || 0), 0) / inspData.length);
      
      html += `<h2>1. Resumo do Dia</h2>
        <div style="padding: 0 5px;">
          <div>• Total de itens avaliados: <strong>${totalItems}</strong></div>
          <div>• Itens com pontuação: <strong>${completedItems}</strong> (${Math.round(completedItems/totalItems*100)}%)</div>
          <div>• Score médio do dia: <strong>${avgScore}%</strong></div>
          <div>• Inspeções realizadas: <strong>${inspData.length}</strong></div>
        </div>
      `;

      html += `<h2 style="color: #A32D2D;">2. Resultados Críticos (Score ≤ 3)</h2>`;
      
      let findings = 0;
      for (const insp of inspData) {
        for (const item of (insp.items || [])) {
          if (item.score !== null && item.score <= 3) {
            findings++;
            const secName = getSectionName(item.section_id);
            const severity = item.score === 1 ? "Crítica" : item.score === 2 ? "Alta" : "Média";
            const scoreClass = item.score === 1 ? "score-critical" : item.score === 2 ? "score-high" : "score-medium";
            
            html += `<div class="finding">
              <h3>${secName}: ${item.label || item.text}</h3>
              <div>
                <span class="score-badge ${scoreClass}">Score: ${item.score}/5</span>
                <span style="margin-left: 12px; color: #888;">Severidade: ${severity}</span>
              </div>
              <div style="margin-top: 8px;"><strong>Observação:</strong> ${item.comment || "N/A"}</div>
            `;
            
            const photos = insp.photosByItem?.[item.id] || [];
            if (photos.length > 0) {
              html += `<div class="photo-grid">`;
              for (let i = 0; i < Math.min(photos.length, 4); i++) {
                const base64 = await getBase64(photos[i].url);
                if (base64) html += `<div class="photo-cell"><img src="${base64}" /></div>`;
              }
              html += `</div>`;
            }
            html += `</div>`;
          }
        }
      }
      
      if (findings === 0) {
        html += `<div style="padding: 15px; background: #ECFDF5; border-radius: 4px; color: #065F46; border: 1px solid #10B981;">
          ✅ Nenhum resultado crítico encontrado. Todas as áreas pontuaram 4 ou 5.
        </div>`;
      }

    } else {
      // MONTHLY REPORT
      const totalInsps = inspData.length;
      const avgScore = Math.round(inspData.reduce((s, i) => s + (i.score_pct || 0), 0) / totalInsps);
      const criticals = inspData.reduce((s, i) => s + (i.items || []).filter(it => it.score !== null && it.score <= 2).length, 0);
      const totalItems = inspData.reduce((s, i) => s + (i.items || []).length, 0);
      
      html += `<h2>1. Resumo de Desempenho Mensal</h2>
        <div class="kpi-grid">
          <div class="kpi-card"><span class="kpi-val">${totalInsps}</span><span class="kpi-lbl">Inspeções</span></div>
          <div class="kpi-card"><span class="kpi-val">${avgScore}%</span><span class="kpi-lbl">Score Médio</span></div>
          <div class="kpi-card"><span class="kpi-val">${criticals}</span><span class="kpi-lbl">Críticos</span></div>
          <div class="kpi-card"><span class="kpi-val">${totalItems}</span><span class="kpi-lbl">Itens Avaliados</span></div>
        </div>
      `;

      html += `<h2>2. Registo de Atividades</h2>`;
      for (const insp of inspData.sort((a, b) => new Date(a.date) - new Date(b.date))) {
        const total = (insp.items || []).length;
        const scored = (insp.items || []).filter(it => it.score !== null).length;
        const critical = (insp.items || []).filter(it => it.score !== null && it.score <= 2).length;
        const dateFormatted = new Date(insp.date).toLocaleDateString("pt-PT", { weekday: 'long', day: 'numeric', month: 'long' });
        
        html += `<div class="daily-log">
          <h3>📅 ${dateFormatted}</h3>
          <div>Score: <strong>${insp.score_pct || 0}%</strong></div>
          <div>Itens avaliados: <strong>${scored}/${total}</strong></div>
          <div>Problemas críticos: <strong>${critical}</strong></div>
        `;
        
        const allPhotos = Object.values(insp.photosByItem || {}).flat();
        if (allPhotos.length > 0) {
          html += `<div class="photo-grid">`;
          for (let i = 0; i < Math.min(allPhotos.length, 12); i++) {
            const base64 = await getBase64(allPhotos[i].url);
            if (base64) html += `<div class="photo-cell"><img src="${base64}" /></div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
    }

    // SIGNATURES
    html += `<div class="signatures">
      <div class="sig-cell">
        ${inspData[0]?.inspector_sig ? `<img src="${inspData[0].inspector_sig}" />` : ""}
        <strong>Inspetor</strong>
        <div class="sig-name">${inspData[0]?.inspector_name || ""}</div>
      </div>
      <div class="sig-cell">
        ${inspData[0]?.client_sig ? `<img src="${inspData[0].client_sig}" />` : ""}
        <strong>Cliente</strong>
        <div class="sig-name">${inspData[0]?.client_mgr_name || ""}</div>
      </div>
    </div>`;

    // FOOTER
    html += `<div class="footer">NEMCHEM © 2026 - Documento gerado pelo FIMS</div>`;
    html += `</body></html>`;
    
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStrClean = (isDaily ? dailyDate : month).replace(/-/g, '');
    link.download = `Nemchem_${isDaily ? "Diario" : "Mensal"}_${client.name}_${dateStrClean}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📄 Centro de Relatórios</div>
          <div className="page-sub">Gere relatórios profissionais em PDF e Word com fotos e assinaturas</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">Tipo de Relatório</label>
            <select 
              className="form-select" 
              value={reportType} 
              onChange={e => setReportType(e.target.value)}
            >
              <option value="daily">📅 Diário (Falhas Críticas)</option>
              <option value="monthly">📊 Mensal (Completo)</option>
            </select>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              {reportType === "daily" 
                ? "Mostra apenas itens com score ≤ 3 (críticos) + resumo do dia" 
                : "Relatório completo com KPIs, atividades diárias e todas as fotos"}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Cliente</label>
            <select 
              className="form-select" 
              value={clientId} 
              onChange={e => setClientId(e.target.value)}
            >
              <option value="">Selecionar cliente...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        {reportType === "daily" ? (
          <div className="form-group">
            <label className="form-label">📅 Data da Inspeção</label>
            <input 
              className="form-input" 
              type="date" 
              value={dailyDate} 
              onChange={e => setDailyDate(e.target.value)} 
            />
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">📆 Mês</label>
            <input 
              className="form-input" 
              type="month" 
              value={month} 
              onChange={e => setMonth(e.target.value)} 
            />
          </div>
        )}

        {generating && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="spinner"></div>
              <span style={{ fontSize: 13, color: "#4B5563" }}>
                {progress < 30 ? "Carregando dados..." : 
                 progress < 70 ? "Processando fotos..." : 
                 progress < 100 ? "Gerando documento..." : "Finalizando..."}
              </span>
              <span style={{ fontSize: 12, color: "#888" }}>{progress}%</span>
            </div>
            <div className="progress-bar" style={{ marginTop: 8 }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <button 
            className="btn btn-danger" 
            onClick={() => handleGenerate("pdf")} 
            disabled={generating || !clientId}
          >
            <Icon name="file" size={14} /> 
            {generating ? "Gerando..." : "PDF"}
          </button>
          <button 
            className="btn btn-primary" 
            onClick={() => handleGenerate("word")} 
            disabled={generating || !clientId}
          >
            <Icon name="file" size={14} /> 
            {generating ? "Gerando..." : "Word"}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>📋 Sobre os Relatórios</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "#F8F7F4", padding: 12, borderRadius: 6 }}>
            <h4 style={{ fontSize: 13, marginBottom: 6, color: "#1E2A3A" }}>📅 Relatório Diário</h4>
            <ul style={{ fontSize: 12, color: "#666", marginLeft: 16, lineHeight: 1.8 }}>
              <li>Resumo do dia (total de itens, score médio)</li>
              <li>Foca em problemas críticos (score ≤ 3)</li>
              <li>Cada falha com foto e observação</li>
              <li>Ideal para inspeções rápidas</li>
            </ul>
          </div>
          <div style={{ background: "#F8F7F4", padding: 12, borderRadius: 6 }}>
            <h4 style={{ fontSize: 13, marginBottom: 6, color: "#1E2A3A" }}>📊 Relatório Mensal</h4>
            <ul style={{ fontSize: 12, color: "#666", marginLeft: 16, lineHeight: 1.8 }}>
              <li>KPIs: total inspeções, score médio, críticos</li>
              <li>Registo de atividades dia a dia</li>
              <li>Todas as fotos agrupadas por data</li>
              <li>Documento completo para arquivo</li>
            </ul>
          </div>
        </div>
        <div style={{ 
          marginTop: 12, 
          padding: 10, 
          background: "#F8F7F4", 
          borderRadius: 6,
          fontSize: 12,
          color: "#888"
        }}>
          <strong>📌 Nota:</strong> Ambos os formatos incluem cabeçalho corporativo, assinaturas digitais e rodapé com numeração de páginas.
        </div>
      </div>

      <style>{`
        .progress-bar {
          width: 100%;
          height: 6px;
          background: #E5E7EB;
          border-radius: 3px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: #3B82F6;
          transition: width 0.3s ease;
          border-radius: 3px;
        }
        .spinner {
          width: 20px;
          height: 20px;
          border: 3px solid #E5E7EB;
          border-top-color: #3B82F6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-primary {
          background: #1E2A3A;
          color: white;
        }
        .btn-primary:hover:not(:disabled) {
          background: #2D3A4A;
        }
        .btn-danger {
          background: #A32D2D;
          color: white;
        }
        .btn-danger:hover:not(:disabled) {
          background: #8A2525;
        }
        .form-group {
          margin-bottom: 12px;
        }
        .form-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #1E2A3A;
          margin-bottom: 4px;
        }
        .form-select, .form-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 13px;
          background: white;
        }
        .form-select:focus, .form-input:focus {
          outline: none;
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .card {
          background: white;
          border-radius: 10px;
          padding: 20px;
          border: 1px solid #E5E7EB;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
        }
        .page-title {
          font-size: 20px;
          font-weight: 600;
          color: #1E2A3A;
        }
        .page-sub {
          font-size: 13px;
          color: #888;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
