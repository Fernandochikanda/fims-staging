// /src/lib/reportGenerator.js
import { jsPDF } from "jspdf";
import { photoStore } from "./photoStore";
import { getClientTemplate } from "../data/constants";

// Helper para converter imagem para Base64
export const getBase64 = (url) => {
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

// Helper para carregar todas as fotos de uma inspeção
export const loadInspectionPhotos = async (inspId) => {
  try {
    return await photoStore.listByInspection(inspId);
  } catch (e) {
    return {};
  }
};

// Função para obter o nome da seção pelo ID
export const getSectionName = (sectionId) => {
  const template = getClientTemplate('');
  const section = template.sections?.find(s => s.id === sectionId);
  return section?.title || section?.name || sectionId || "N/A";
};

// Gera o cabeçalho do documento
export const generateHeader = (doc, isPDF = true) => {
  if (isPDF) {
    // Cabeçalho PDF
    doc.setFillColor(30, 42, 58);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("NEMCHEM", 14, 20);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Avª Joaquim Chissano nº2305, Matola – Moçambique", 14, 28);
    doc.text("Tel: 21 74 94 26 / 84 300 7940 | supervisao@nemchem.co.mz", 14, 34);
    doc.setTextColor(50, 50, 50);
    return 50;
  } else {
    // HTML para Word
    return `
      <div style="background-color: #1E2A3A; color: white; padding: 20px; margin-bottom: 20px;">
        <h1 style="font-size: 24pt; margin: 0;">NEMCHEM</h1>
        <p style="font-size: 9pt; margin: 5px 0 0 0;">
          Avª Joaquim Chissano nº2305, Matola – Moçambique<br/>
          Tel: 21 74 94 26 / 84 300 7940 | supervisao@nemchem.co.mz
        </p>
      </div>
    `;
  }
};

// Gera o rodapé do documento
export const generateFooter = (doc, isPDF = true, pageCount = 1) => {
  if (isPDF) {
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("NEMCHEM © 2024 - Documento gerado pelo FIMS", 105, 290, { align: "center" });
      doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: "right" });
    }
  } else {
    return `
      <div style="margin-top: 40px; text-align: center; font-size: 9pt; color: #888; border-top: 1px solid #eee; padding-top: 10px;">
        NEMCHEM © 2024 - Documento gerado pelo FIMS
      </div>
    `;
  }
};

// Gera as assinaturas
export const generateSignatures = (inspectorName, clientName, inspectorSig, clientSig, isPDF = true) => {
  if (isPDF) {
    // Retorna posição Y onde as assinaturas foram desenhadas
    return (doc, y) => {
      if (y > 250) { doc.addPage(); y = 20; }
      y += 10;
      doc.setDrawColor(200, 200, 200);
      doc.line(20, y, 80, y);
      doc.line(120, y, 180, y);
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text("Inspetor", 20, y + 5);
      doc.text("Cliente", 120, y + 5);
      
      if (inspectorSig) {
        try { doc.addImage(inspectorSig, 'PNG', 20, y-15, 40, 15); } catch(e) {}
      }
      if (clientSig) {
        try { doc.addImage(clientSig, 'PNG', 120, y-15, 40, 15); } catch(e) {}
      }
      
      if (inspectorName) doc.text(inspectorName, 20, y + 12);
      if (clientName) doc.text(clientName, 120, y + 12);
      
      return y + 20;
    };
  } else {
    return `
      <div style="margin-top: 40px; display: table; width: 100%;">
        <div style="display: table-cell; width: 50%; text-align: center; padding-top: 20px; border-top: 1px solid #333;">
          ${inspectorSig ? `<img src="${inspectorSig}" style="width: 150px; height: 50px; object-fit: contain;" /><br/>` : ""}
          <strong>Inspetor</strong><br/>${inspectorName || ""}
        </div>
        <div style="display: table-cell; width: 50%; text-align: center; padding-top: 20px; border-top: 1px solid #333;">
          ${clientSig ? `<img src="${clientSig}" style="width: 150px; height: 50px; object-fit: contain;" /><br/>` : ""}
          <strong>Cliente</strong><br/>${clientName || ""}
        </div>
      </div>
    `;
  }
};

// Gera seção de KPIs
export const generateKPIs = (inspData, isPDF = true) => {
  const totalInsps = inspData.length;
  const avgScore = totalInsps > 0 ? Math.round(inspData.reduce((s, i) => s + (i.score_pct || 0), 0) / totalInsps) : 0;
  const criticals = inspData.reduce((s, i) => s + (i.items || []).filter(it => it.score !== null && it.score <= 2).length, 0);
  const locations = new Set(inspData.map(i => i.location_id)).size;

  if (isPDF) {
    return (doc, y) => {
      const kpis = [
        ["Total Inspeções", totalInsps],
        ["Score Médio", `${avgScore}%`],
        ["Problemas Críticos", criticals],
        ["Locais", locations]
      ];
      
      let kpiX = 14;
      kpis.forEach(([label, val]) => {
        doc.setFillColor(30, 42, 58);
        doc.roundedRect(kpiX, y, 42, 22, 2, 2, 'F');
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
      return y + 30;
    };
  } else {
    return `
      <div style="display: table; width: 100%; margin: 20px 0;">
        <div style="display: table-cell; width: 25%; background: #1E2A3A; color: white; padding: 15px; text-align: center; border: 2px solid #fff;">
          <span style="font-size: 18pt; font-weight: bold; display: block;">${totalInsps}</span>
          <span style="font-size: 9pt; display: block;">Inspeções</span>
        </div>
        <div style="display: table-cell; width: 25%; background: #1E2A3A; color: white; padding: 15px; text-align: center; border: 2px solid #fff;">
          <span style="font-size: 18pt; font-weight: bold; display: block;">${avgScore}%</span>
          <span style="font-size: 9pt; display: block;">Score Médio</span>
        </div>
        <div style="display: table-cell; width: 25%; background: #1E2A3A; color: white; padding: 15px; text-align: center; border: 2px solid #fff;">
          <span style="font-size: 18pt; font-weight: bold; display: block;">${criticals}</span>
          <span style="font-size: 9pt; display: block;">Críticos</span>
        </div>
        <div style="display: table-cell; width: 25%; background: #1E2A3A; color: white; padding: 15px; text-align: center; border: 2px solid #fff;">
          <span style="font-size: 18pt; font-weight: bold; display: block;">${locations}</span>
          <span style="font-size: 9pt; display: block;">Locais</span>
        </div>
      </div>
    `;
  }
};

// Gera relatório diário em PDF
export const generateDailyPDF = async (doc, client, inspData, dateStr) => {
  let y = generateHeader(doc, true);
  
  // Título
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 50, 50);
  doc.text("RELATÓRIO DIÁRIO DE INSPEÇÃO", 105, y, { align: "center" });
  y += 10;

  // Meta Info
  const insp = inspData[0];
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const metaData = [
    `Cliente: ${client.name}`,
    `Endereço: ${client.address}`,
    `Atenção: ${insp?.client_mgr_name || "N/A"}`,
    `Data: ${new Date().toLocaleDateString("pt-PT")}`,
    `Assunto: Relatório referente a ${dateStr}`
  ];
  metaData.forEach(line => {
    doc.text(line, 14, y);
    y += 6;
  });
  y += 4;

  // Executive Summary
  doc.setFillColor(248, 247, 244);
  doc.roundedRect(14, y, 182, 25, 3, 3, 'F');
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  const summaryText = "Durante a inspeção de hoje, a maioria das áreas inspecionadas cumpriu os padrões exigidos. No entanto, foram identificados alguns itens com pontuações que exigem ação corretiva. As observações abaixo resumem os resultados que exigem atenção do cliente.";
  const splitSummary = doc.splitTextToSize(summaryText, 175);
  doc.text(splitSummary, 16, y + 7);
  y += splitSummary.length * 5 + 15;

  // Critical Findings
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(163, 45, 45);
  doc.text("1. Resultados Críticos (Score ≤ 3)", 14, y);
  y += 8;
  doc.setTextColor(50, 50, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  let findingsCount = 0;
  for (const insp of inspData) {
    for (const item of insp.items || []) {
      if (item.score !== null && item.score <= 3) {
        findingsCount++;
        if (y > 250) { doc.addPage(); y = 20; }
        
        const secName = getSectionName(item.section_id);
        doc.setFont("helvetica", "bold");
        doc.text(`${secName}: ${item.label || item.text}`, 14, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.text(`Score: ${item.score}/5`, 14, y);
        const severity = item.score === 1 ? "Crítica" : item.score === 2 ? "Alta" : "Média";
        doc.text(`Severidade: ${severity}`, 60, y);
        y += 5;
        const obs = doc.splitTextToSize(`Observação: ${item.comment || "N/A"}`, 180);
        doc.text(obs, 14, y);
        y += obs.length * 5 + 4;
        
        // Photos
        const photos = insp.photosByItem?.[item.id] || [];
        if (photos.length > 0) {
          let imgX = 14;
          for (let i = 0; i < Math.min(photos.length, 3); i++) {
            if (imgX > 160) { imgX = 14; y += 35; }
            if (y > 250) { doc.addPage(); y = 20; }
            try {
              const base64 = await getBase64(photos[i].url);
              if (base64) doc.addImage(base64, 'JPEG', imgX, y, 45, 35);
              imgX += 48;
            } catch(e) {}
          }
          y += 40;
        }
        y += 4;
      }
    }
  }
  
  if (findingsCount === 0) {
    doc.text("✅ Nenhum resultado crítico encontrado. Todas as áreas pontuaram 4 ou 5.", 14, y);
    y += 10;
  }

  // Signatures
  const sigFn = generateSignatures(
    insp?.inspector_name || "",
    insp?.client_mgr_name || "",
    insp?.inspector_sig || "",
    insp?.client_sig || ""
  );
  y = sigFn(doc, y);
  
  generateFooter(doc, true, doc.internal.getNumberOfPages());
  return doc;
};

// Gera relatório mensal em PDF
export const generateMonthlyPDF = async (doc, client, inspData, dateStr) => {
  let y = generateHeader(doc, true);
  
  // Título
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 50, 50);
  doc.text("RELATÓRIO MENSAL DE ATIVIDADES", 105, y, { align: "center" });
  y += 10;

  // Meta Info
  const insp = inspData[0];
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const metaData = [
    `Cliente: ${client.name}`,
    `Endereço: ${client.address}`,
    `Atenção: ${insp?.client_mgr_name || "N/A"}`,
    `Data: ${new Date().toLocaleDateString("pt-PT")}`,
    `Assunto: Relatório referente a ${dateStr}`
  ];
  metaData.forEach(line => {
    doc.text(line, 14, y);
    y += 6;
  });
  y += 4;

  // Executive Summary
  doc.setFillColor(248, 247, 244);
  doc.roundedRect(14, y, 182, 25, 3, 3, 'F');
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  const summaryText = "Durante o período em análise, todas as inspeções e atividades de limpeza agendadas foram realizadas conforme o programa de manutenção acordado. A qualidade geral do serviço permaneceu satisfatória, com operações de rotina concluídas com sucesso. Problemas operacionais menores identificados durante as inspeções foram documentados juntamente com recomendações corretivas.";
  const splitSummary = doc.splitTextToSize(summaryText, 175);
  doc.text(splitSummary, 16, y + 7);
  y += splitSummary.length * 5 + 15;

  // KPIs
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 42, 58);
  doc.text("1. Resumo de Desempenho Mensal", 14, y);
  y += 8;
  const kpiFn = generateKPIs(inspData, true);
  y = kpiFn(doc, y);
  y += 4;

  // Daily Activities
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("2. Registo de Atividades e Evidências", 14, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  for (const insp of inspData.sort((a, b) => new Date(a.date) - new Date(b.date))) {
    if (y > 240) { doc.addPage(); y = 20; }
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 42, 58);
    doc.text(`Dia ${new Date(insp.date).toLocaleDateString("pt-PT")}`, 14, y);
    y += 6;
    doc.setTextColor(50, 50, 50);
    doc.setFont("helvetica", "normal");
    
    const actText = doc.splitTextToSize(`Atividades executadas conforme cronograma. Score: ${insp.score_pct || 0}%.`, 180);
    doc.text(actText, 14, y);
    y += actText.length * 5 + 6;

    // All photos for this day
    const allPhotos = Object.values(insp.photosByItem || {}).flat();
    if (allPhotos.length > 0) {
      let imgX = 14;
      let rowY = y;
      for (let i = 0; i < allPhotos.length; i++) {
        if (imgX > 160) { imgX = 14; rowY += 40; }
        if (rowY > 250) { doc.addPage(); y = 20; rowY = y; imgX = 14; }
        try {
          const base64 = await getBase64(allPhotos[i].url);
          if (base64) {
            doc.addImage(base64, 'JPEG', imgX, rowY, 45, 35);
            imgX += 48;
          }
        } catch(e) {}
      }
      y = rowY + 45;
    } else {
      y += 6;
    }
  }

  // Signatures
  const sigFn = generateSignatures(
    insp?.inspector_name || "",
    insp?.client_mgr_name || "",
    insp?.inspector_sig || "",
    insp?.client_sig || ""
  );
  y = sigFn(doc, y);
  
  generateFooter(doc, true, doc.internal.getNumberOfPages());
  return doc;
};

// Gera relatório em Word (HTML)
export const generateWordHTML = async (client, inspData, dateStr, type) => {
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
      font-family: 'Arial', sans-serif; 
      font-size: 11pt; 
      color: #333;
      margin: 40px;
      line-height: 1.6;
    }
    .header { 
      background-color: #1E2A3A; 
      color: white; 
      padding: 20px 25px; 
      margin-bottom: 20px;
      border-radius: 4px;
    }
    .header h1 { 
      font-size: 24pt; 
      margin: 0;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .header p { 
      font-size: 9pt; 
      margin: 5px 0 0 0;
      opacity: 0.9;
    }
    .title { 
      text-align: center; 
      font-size: 14pt; 
      font-weight: bold; 
      margin: 25px 0 20px 0; 
      text-transform: uppercase;
      color: #1E2A3A;
      letter-spacing: 2px;
      border-bottom: 2px solid #1E2A3A;
      padding-bottom: 10px;
    }
    .meta { 
      margin-bottom: 20px;
      background: #F8F7F4;
      padding: 15px 20px;
      border-radius: 4px;
    }
    .meta div { 
      margin-bottom: 3px;
      font-size: 10pt;
    }
    .summary { 
      background: #F8F7F4; 
      padding: 15px 20px; 
      margin-bottom: 25px; 
      font-style: italic; 
      border-left: 4px solid #1E2A3A;
      border-radius: 4px;
      font-size: 10pt;
    }
    h2 { 
      color: #1E2A3A; 
      border-bottom: 2px solid #ccc; 
      padding-bottom: 6px; 
      font-size: 13pt; 
      margin-top: 28px;
      margin-bottom: 16px;
    }
    .finding { 
      margin-bottom: 20px; 
      padding: 15px; 
      border: 1px solid #eee; 
      background: #fff;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .finding h3 { 
      margin: 0 0 8px 0; 
      font-size: 11pt; 
      color: #A32D2D;
    }
    .finding .score-badge {
      display: inline-block;
      padding: 2px 12px;
      border-radius: 12px;
      font-weight: bold;
      font-size: 10pt;
    }
    .score-critical { background: #A32D2D; color: white; }
    .score-high { background: #EF9F27; color: white; }
    .score-medium { background: #FAC775; color: #333; }
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
      padding: 15px; 
      text-align: center; 
      border: 2px solid #fff;
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
      padding: 15px;
      background: #FAFAFA;
      border-radius: 4px;
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
      width: 33%; 
      padding: 5px;
      text-align: center;
    }
    .photo-cell img { 
      width: 100%; 
      max-height: 150px; 
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #eee;
    }
    .signatures { 
      margin-top: 40px; 
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
    }
    .sig-cell .sig-name {
      font-size: 10pt;
      color: #555;
      margin-top: 4px;
    }
    .footer { 
      margin-top: 40px; 
      text-align: center; 
      font-size: 9pt; 
      color: #888; 
      border-top: 1px solid #eee; 
      padding-top: 15px;
    }
    .page-break { page-break-before: always; }
    @media print {
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>`;

  // HEADER
  html += generateHeader(null, false);

  // TITLE
  html += `<div class="title">${isDaily ? 'Relatório Diário de Inspeção' : 'Relatório Mensal de Atividades'}</div>`;

  // META
  html += `<div class="meta">
    <div><strong>Cliente:</strong> ${client.name}</div>
    <div><strong>Endereço:</strong> ${client.address}</div>
    <div><strong>Atenção:</strong> ${insp?.client_mgr_name || "N/A"}</div>
    <div><strong>Data:</strong> ${new Date().toLocaleDateString("pt-PT")}</div>
    <div><strong>Assunto:</strong> Relatório referente a ${dateStr}</div>
  </div>`;

  // SUMMARY
  const summaryText = isDaily 
    ? "Durante a inspeção de hoje, a maioria das áreas inspecionadas cumpriu os padrões exigidos. No entanto, foram identificados alguns itens com pontuações que exigem ação corretiva. As observações abaixo resumem os resultados que exigem atenção do cliente."
    : "Durante o período em análise, todas as inspeções e atividades de limpeza agendadas foram realizadas conforme o programa de manutenção acordado. A qualidade geral do serviço permaneceu satisfatória, com operações de rotina concluídas com sucesso. Problemas operacionais menores identificados durante as inspeções foram documentados juntamente com recomendações corretivas.";
  html += `<div class="summary">${summaryText}</div>`;

  if (isDaily) {
    // DAILY REPORT - Critical Findings Only
    html += `<h2>1. Resultados Críticos (Score ≤ 3)</h2>`;
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
              <span style="margin-left: 10px;">Severidade: ${severity}</span>
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
      html += `<p style="padding: 15px; background: #ECFDF5; border-radius: 4px; color: #065F46;">
        ✅ Nenhum resultado crítico encontrado. Todas as áreas pontuaram 4 ou 5.
      </p>`;
    }
  } else {
    // MONTHLY REPORT
    html += `<h2>1. Resumo de Desempenho Mensal</h2>`;
    html += generateKPIs(inspData, false);

    html += `<h2>2. Registo de Atividades e Evidências</h2>`;
    for (const insp of inspData.sort((a, b) => new Date(a.date) - new Date(b.date))) {
      html += `<div class="daily-log">
        <h3>📅 Dia ${new Date(insp.date).toLocaleDateString("pt-PT")}</h3>
        <p>Atividades executadas conforme cronograma. Score: ${insp.score_pct || 0}%.</p>
      `;
      
      const allPhotos = Object.values(insp.photosByItem || {}).flat();
      if (allPhotos.length > 0) {
        html += `<div class="photo-grid">`;
        for (let i = 0; i < allPhotos.length; i++) {
          const base64 = await getBase64(allPhotos[i].url);
          if (base64) html += `<div class="photo-cell"><img src="${base64}" /></div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
  }

  // SIGNATURES
  html += generateSignatures(
    insp?.inspector_name || "",
    insp?.client_mgr_name || "",
    insp?.inspector_sig || "",
    insp?.client_sig || "",
    false
  );

  // FOOTER
  html += generateFooter(null, false);
  html += `</body></html>`;

  return html;
};
