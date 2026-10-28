// /src/lib/excelReport.js
// ============================================================================
// DESIGN PROFISSIONAL DOS RELATÓRIOS EXCEL (mensal e diário) — NemChem FIMS.
//
// Âmbito: APENAS a apresentação dos ficheiros .xlsx exportados pelo Centro de
// Relatórios. Não altera dados, filtros, regras de negócio, nem os fluxos
// PDF/Word existentes.
//
// Biblioteca: ExcelJS (dependência adicionada, justificada no §10 do pedido:
// a SheetJS Community não suporta estilos, cores, bordas, imagens, merges,
// filtros nem configuração de impressão). O import é dinâmico — o bundle
// principal da aplicação não aumenta; o chunk do ExcelJS só é carregado
// quando o utilizador exporta para Excel.
//
// Regras de negócio respeitadas (sem duplicação):
//  - Defeito = item com score < 3   (src/lib/defectLogic.js — computeDefectChanges)
//  - Concluída = status submitted|reviewed (mesma métrica do MonthlyReport web)
//  - Nível crítico = alert_level 'critical' (score < 60% — regra existente)
//  - Severidade 1/2/3 = Crítica/Alta/Média (mesma regra do PDF)
//  - Score médio por área via getCategoryHealth (src/lib/helpers.js)
//  - Classificação de score via scoreLabel (src/lib/helpers.js)
// ============================================================================

import { scoreLabel, getCategoryHealth } from "./helpers.js";

// ---------------------------------------------------------------------------
// Identidade visual NemChem (paleta institucional)
// ---------------------------------------------------------------------------
export const NEM = {
  dark:   "FF073B67", // azul institucional escuro
  main:   "FF0878B9", // azul principal
  light:  "FFEAF4FB", // azul claro (fundos)
  green:  "FF239653", // concluídas
  orange: "FFF4A51C", // pendentes
  red:    "FFD93636", // atrasadas / críticas
  purple: "FF7650A8", // defeitos
  white:  "FFFFFFFF",
  border: "FFDCE5EC", // bordas discretas
  text:   "FF1E2A3A", // texto principal (cor corporativa existente)
  grey:   "FF6B7A8C", // texto secundário
  zebra:  "FFF6FAFD", // linhas alternadas
};

const FONT = "Calibri";

let _ExcelJS = null;
async function ensureExcelJS() {
  if (!_ExcelJS) {
    const m = await import("exceljs");
    _ExcelJS = m.default || m;
  }
  return _ExcelJS;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
const thinBorder = { style: "thin", color: { argb: NEM.border } };
const BOX = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

/** Normaliza qualquer cor ('#RRGGBB' ou 'RRGGBB') para ARGB de 8 dígitos */
function argb(c) {
  if (!c) return NEM.dark;
  let s = String(c).replace("#", "").toUpperCase();
  if (s.length === 6) s = "FF" + s;
  return s;
}

function fmtPct(part, whole, digits = 0) {
  if (!whole) return null;
  return Number(((part / whole) * 100).toFixed(digits));
}

/** '2026-10-27' → Date local (meia-noite), sem desvios de fuso */
export function parseYMD(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtDateTime(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`;
}

const MESES_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
function mesAnoPT(ym) { // '2026-10' → 'outubro de 2026'
  const [y, m] = ym.split("-");
  return `${MESES_PT[Number(m) - 1] || m} de ${y}`;
}

export const STATE_LABELS = {
  pending_acceptance: "Pendente de aceitação",
  unassigned: "Não atribuída",
  in_progress: "Em curso",
  submitted: "Submetida",
  reviewed: "Revista",
};

function stateColor(status) {
  if (status === "submitted" || status === "reviewed") return NEM.green;
  if (status === "in_progress" || status === "pending_acceptance") return NEM.orange;
  return NEM.grey;
}

/** Nome da área/section: inspection.sections (fonte autoritativa da própria
 *  inspecção, igual a defectLogic.sectionNameOf); fallback genérico */
function resolveSectionName(inspection, sectionId) {
  if (Array.isArray(inspection?.sections)) {
    const s = inspection.sections.find(x => String(x.id) === String(sectionId));
    if (s) return s.title || s.name || sectionId;
  }
  return `Área ${sectionId ?? "?"}`;
}

/** Observações de uma inspeção: itens com defeito primeiro, depois restantes */
function inspectionNotes(insp, nameOfSection, maxLen = 600) {
  const items = (insp.items || []).filter(it => it.comment && String(it.comment).trim());
  if (!items.length) return "";
  const defect = items.filter(it => it.score !== null && it.score !== undefined && Number(it.score) < 3);
  const other = items.filter(it => !(it.score !== null && it.score !== undefined && Number(it.score) < 3));
  const lines = [...defect, ...other].map(it =>
    `• [${nameOfSection(insp, it.section_id)}] ${it.label || it.text || "Item"} (score ${it.score ?? "—"}): ${String(it.comment).trim()}`);
  const joined = lines.join("\n");
  return joined.length > maxLen ? joined.slice(0, maxLen - 1) + "…" : joined;
}

// ---------------------------------------------------------------------------
// Agregações (apenas a partir dos dados reais exportados — nada inventado)
// ---------------------------------------------------------------------------
export function buildStats(inspections, nameOfSection) {
  const total = inspections.length;
  const itemsAll = inspections.flatMap(i => i.items || []);
  const itemsScored = itemsAll.filter(it => it.score !== null && it.score !== undefined);
  const defects = itemsScored.filter(it => Number(it.score) < 3);
  const avgScore = total ? Math.round(inspections.reduce((s, i) => s + (Number(i.score_pct) || 0), 0) / total) : 0;
  const critical = inspections.filter(i => i.alert_level === "critical").length;
  const completed = inspections.filter(i => i.status === "submitted" || i.status === "reviewed").length;

  const byStatus = {};
  inspections.forEach(i => { const k = i.status || "submitted"; byStatus[k] = (byStatus[k] || 0) + 1; });

  const byDay = {};
  inspections.forEach(i => {
    const d = (i.date || "").slice(0, 10);
    if (!d) return;
    byDay[d] = byDay[d] || { date: d, count: 0, defects: 0, scoreSum: 0 };
    byDay[d].count++;
    byDay[d].scoreSum += Number(i.score_pct) || 0;
    (i.items || []).forEach(it => { if (it.score !== null && it.score !== undefined && Number(it.score) < 3) byDay[d].defects++; });
  });

  const bySection = {};
  inspections.forEach(i => (i.items || []).forEach(it => {
    if (it.score === null || it.score === undefined) return;
    const sid = String(it.section_id ?? "geral");
    bySection[sid] = bySection[sid] || { id: sid, name: nameOfSection(i, sid), scores: [], defects: 0, items: 0 };
    bySection[sid].items++;
    bySection[sid].scores.push(Number(it.score));
    if (Number(it.score) < 3) bySection[sid].defects++;
  }));

  const sections = Object.values(bySection).map(s => {
    const health = getCategoryHealth(s.scores.map(v => ({ score: v })));
    return { ...s, avgPct: health.health, avgScore: (s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1) };
  });

  const locations = [...new Set(inspections.map(i => i.location_name || (i.location_id != null ? `Local ${i.location_id}` : "N/A")))];

  return {
    total, itemsAll, itemsScored, defects, defectCount: defects.length,
    avgScore, critical, completed, byStatus, byDay: Object.values(byDay).sort((a, b) => a.date < b.date ? -1 : 1),
    sections: sections.sort((a, b) => b.defects - a.defects || b.items - a.items),
    locations,
  };
}

// ---------------------------------------------------------------------------
// Blocos visuais reutilizáveis
// ---------------------------------------------------------------------------
function setCell(ws, r, c, opts = {}) {
  const cell = ws.getRow(r).getCell(c);
  if ("v" in opts) cell.value = opts.v;
  if ("f" in opts) cell.value = { formula: opts.f };
  if (opts.numFmt) cell.numFmt = opts.numFmt;
  if (opts.font) cell.font = opts.font;
  if (opts.fill) cell.fill = opts.fill;
  if (opts.align) cell.alignment = opts.align;
  if (opts.border) cell.border = opts.border;
  return cell;
}

const fTitle  = { name: FONT, size: 16, bold: true, color: { argb: NEM.dark } };
const fSys    = { name: FONT, size: 9, bold: true, color: { argb: NEM.main } };
const fMeta   = { name: FONT, size: 10, color: { argb: NEM.text } };
const fMeta2  = { name: FONT, size: 9, color: { argb: NEM.grey } };
const fSec    = { name: FONT, size: 12, bold: true, color: { argb: NEM.dark } };
const fHead   = { name: FONT, size: 10, bold: true, color: { argb: NEM.white } };
const fBody   = { name: FONT, size: 10, color: { argb: NEM.text } };
const fBold   = { name: FONT, size: 10, bold: true, color: { argb: NEM.text } };
const fGrey   = { name: FONT, size: 9, color: { argb: NEM.grey } };

function addBanner(ws, wb, { title, meta1, meta2, meta3, logo, lastCol }) {
  ws.getRow(1).height = 6;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 26;
  ws.getRow(4).height = 16;
  ws.getRow(5).height = 14;

  // Logotipo oficial (quando disponível) — âncora fixa, não imprime sobre dados
  if (logo && (logo.base64 || logo.buffer)) {
    try {
      const img = logo.base64
        ? { base64: logo.base64, extension: logo.extension || "jpeg" }
        : { buffer: logo.buffer, extension: logo.extension || "png" };
      const imgId = wb.addImage(img);
      ws.addImage(imgId, { tl: { col: 1, row: 1 }, ext: { width: logo.width || 150, height: logo.height || 56 }, editAs: "oneCell" });
    } catch (e) { /* logo opcional */ }
  }

  const from = 3; // coluna C
  setCell(ws, 2, from, { v: "NEMCHEM · FIMS — SISTEMA DE INSPECÇÕES", font: fSys });
  setCell(ws, 3, from, { v: title, font: fTitle });
  setCell(ws, 4, from, { v: meta1, font: fMeta });
  setCell(ws, 5, from, { v: meta2, font: fMeta2 });
  if (meta3) setCell(ws, 6, from, { v: meta3, font: fMeta2 });
  for (let r = 2; r <= (meta3 ? 6 : 5); r++) ws.mergeCells(r, from, r, lastCol);

  // Divisória azul institucional
  const divRow = meta3 ? 8 : 7;
  ws.getRow(divRow).height = 3;
  for (let c = 1; c <= lastCol; c++) setCell(ws, divRow, c, { fill: { type: "pattern", pattern: "solid", fgColor: { argb: NEM.main } } });
  return divRow + 2; // primeira linha livre
}

function addSectionTitle(ws, row, lastCol, text) {
  ws.getRow(row).height = 20;
  setCell(ws, row, 2, { v: text, font: fSec });
  ws.mergeCells(row, 2, row, lastCol);
  for (let c = 2; c <= lastCol; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.border = { bottom: { style: "medium", color: { argb: NEM.main } } };
  }
  return row + 1;
}

/**
 * Cartões KPI: [{label, value, sub, color}] — 2 colunas por cartão.
 * devolve a linha seguinte.
 */
function addKpiCards(ws, row, kpis, lastCol) {
  const valueRow = row, labelRow = row + 1;
  ws.getRow(valueRow).height = 30;
  ws.getRow(labelRow).height = 18;
  const perCard = 2;
  kpis.forEach((k, idx) => {
    const c1 = 2 + idx * perCard, c2 = c1 + 1;
    if (c2 > lastCol) return;
    const fill = { type: "pattern", pattern: "solid", fgColor: { argb: NEM.light } };
    [c1, c2].forEach(c => {
      setCell(ws, valueRow, c, { fill, border: BOX });
      setCell(ws, labelRow, c, { fill, border: BOX });
    });
    setCell(ws, valueRow, c1, {
      v: k.value, fill, border: BOX, align: { horizontal: "center", vertical: "middle" },
      font: { name: FONT, size: 18, bold: true, color: { argb: argb(k.color || NEM.dark) } },
    });
    ws.mergeCells(valueRow, c1, valueRow, c2);
    setCell(ws, labelRow, c1, {
      v: k.sub ? `${k.label}  ·  ${k.sub}` : k.label, fill, border: BOX,
      align: { horizontal: "center", vertical: "middle", wrapText: true }, font: fGrey,
    });
    ws.mergeCells(labelRow, c1, labelRow, c2);
  });
  return labelRow + 2;
}

/**
 * Tabela genérica: cols=[{header, width?}], rows=[[{v,numFmt,font,fill,color,bar?}]]
 * mergeFirst=n primeiras colunas fundidas (para nomes longos). devolve última linha.
 */
function addTable(ws, row, cols, rows, { mergeFirst = 0, mergeLast = false, lastCol, zebra = true, autoFilter = false, freezeAt = null, headerFill = NEM.dark } = {}) {
  const nCols = cols.length;
  const headRow = row;
  ws.getRow(headRow).height = 22;
  let c = 2;
  cols.forEach((col, i) => {
    let span = i === 0 ? (mergeFirst || 1) : 1;
    if (mergeLast && i === cols.length - 1) span = Math.max(1, lastCol - c + 1);
    setCell(ws, headRow, c, { v: col.header, font: fHead, fill: { type: "pattern", pattern: "solid", fgColor: { argb: headerFill } }, align: { horizontal: "center", vertical: "middle", wrapText: true }, border: BOX });
    if (span > 1) { for (let k = 1; k < span; k++) setCell(ws, headRow, c + k, { fill: { type: "pattern", pattern: "solid", fgColor: { argb: headerFill } }, border: BOX }); ws.mergeCells(headRow, c, headRow, c + span - 1); }
    c += span;
  });
  // preencher fundo do header até lastCol (estética contínua)
  for (let k = c; k <= lastCol; k++) setCell(ws, headRow, k, { fill: { type: "pattern", pattern: "solid", fgColor: { argb: headerFill } }, border: BOX });

  let r = headRow + 1;
  rows.forEach((data, ri) => {
    const zFill = zebra && ri % 2 === 1 ? { type: "pattern", pattern: "solid", fgColor: { argb: NEM.zebra } } : null;
    let c2 = 2;
    cols.forEach((col, i) => {
      let span = i === 0 ? (mergeFirst || 1) : 1;
      if (mergeLast && i === cols.length - 1) span = Math.max(1, lastCol - c2 + 1);
      const val = data[i];
      const o = { font: fBody, border: BOX, align: { vertical: "middle", horizontal: col.align || (i === 0 ? "left" : "center"), wrapText: !!val?.wrap } };
      if (zFill) o.fill = zFill;
      if (val && typeof val === "object" && "bar" in val) {
        const n = Math.max(0, Number(val.bar) || 0);
        o.v = n > 0 ? "\u2588".repeat(n) : "";
        o.font = { name: FONT, size: 11, bold: true, color: { argb: val.color || NEM.main } };
        o.align = { horizontal: "left", vertical: "middle" };
      } else if (val && typeof val === "object" && "v" in val) {
        o.v = val.v;
        if ("numFmt" in val) o.numFmt = val.numFmt;
        if (val.font) o.font = { ...val.font, color: { argb: argb(val.font.color) } };
        else if (val.color) o.font = { name: FONT, size: 10, bold: !!val.bold, color: { argb: argb(val.color) } };
      } else if (val != null && typeof val !== "object") {
        o.v = val;
      }
      setCell(ws, r, c2, o);
      if (span > 1) {
        for (let k = 1; k < span; k++) setCell(ws, r, c2 + k, { border: BOX, fill: zFill || undefined });
        ws.mergeCells(r, c2, r, c2 + span - 1);
      }
      c2 += span;
    });
    for (let k = c2; k <= lastCol; k++) setCell(ws, r, k, { border: BOX, fill: zFill || undefined });
    r++;
  });

  if (autoFilter) ws.autoFilter = { from: { row: headRow, column: 2 }, to: { row: r - 1, column: Math.min(lastCol, 2 + cols.reduce((s, col, i) => s + (i === 0 ? (mergeFirst || 1) : 1), 0) - 1) } };
  if (freezeAt) ws.views = [{ state: "frozen", ySplit: freezeAt, topLeftCell: `A${freezeAt + 1}`, showGridLines: false }];
  return r;
}

// ---------------------------------------------------------------------------
// Configuração de impressão (A4, ajuste à largura, rodapé com paginação)
// ---------------------------------------------------------------------------
function applyPrintSetup(ws, { landscape = true, scale = 90 } = {}) {
  // Escala EXPLÍCITA (fitToPage/fitToWidth é mal interpretado pelo LibreOffice —
  // comprime tudo para ~10%). Valores calibrados para A4 paisagem.
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: landscape ? "landscape" : "portrait",
    scale,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    horizontalCentered: false,
  };
  ws.headerFooter = {
    oddHeader: `&L&8&K073B67NemChem — FIMS&C&8&K073B67${ws.name}&R&8&K6B7A8CGerado pelo FIMS`,
    oddFooter: `&L&8&K6B7A8CConfidencial — uso interno NemChem&C&8&K6B7A8CPágina &P de &N`,
  };
}

// ---------------------------------------------------------------------------
// RELATÓRIO MENSAL — livro com 2 folhas: "Resumo Mensal" + "Inspecções"
// ---------------------------------------------------------------------------
export async function buildMonthlyWorkbook({ client, inspections, dateStr, logo, now = new Date() }) {
  const ExcelJS = await ensureExcelJS();
  const nameOfSection = (insp, sid) => resolveSectionName(insp, sid);
  const st = buildStats(inspections, nameOfSection);
  const wb = new ExcelJS.Workbook();
  wb.creator = "FIMS — NemChem";
  wb.created = now;

  // ----------------------------- Folha 1: Resumo -----------------------------
  const ws = wb.addWorksheet("Resumo Mensal", { views: [{ showGridLines: false }] });
  const LAST = 11; // A..K
  ws.columns = [{ width: 2.3 }, ...Array.from({ length: 10 }, () => ({ width: 14 }))];

  let row = addBanner(ws, wb, {
    title: "RELATÓRIO MENSAL DE INSPECÇÕES",
    meta1: `Cliente: ${client?.name || "—"}${client?.address ? `  ·  Localização: ${client.address}` : ""}`,
    meta2: `Período: Mês de ${mesAnoPT(dateStr)}  ·  Âmbito: Inspecções submetidas no período`,
    meta3: `Ficheiro gerado em ${fmtDateTime(now)} pelo FIMS`,
    logo, lastCol: LAST,
  });

  // --- Indicadores principais (KPI cards)
  row = addSectionTitle(ws, row, LAST, "INDICADORES PRINCIPAIS");
  const sl = scoreLabel(st.avgScore);
  row = addKpiCards(ws, row, [
    { label: "Total de Inspecções", value: st.total, color: NEM.main },
    { label: "Score Médio", value: `${st.avgScore}%`, sub: sl.label, color: sl.color },
    { label: "Inspecções Críticas", value: st.critical, sub: st.total ? `${fmtPct(st.critical, st.total)}%` : null, color: NEM.red },
    { label: "Defeitos Registados", value: st.defectCount, sub: st.itemsScored.length ? `${fmtPct(st.defectCount, st.itemsScored.length, 1)}% dos itens` : null, color: NEM.purple },
    { label: "Itens Avaliados", value: st.itemsScored.length, sub: `de ${st.itemsAll.length} itens`, color: NEM.dark },
  ], LAST);
  row += 1;

  // --- Inspecções por estado
  row = addSectionTitle(ws, row, LAST, "INSPECÇÕES POR ESTADO");
  const statusRows = Object.entries(st.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => {
      const label = STATE_LABELS[s] || s;
      const color = stateColor(s);
      const maxN = Math.max(...Object.values(st.byStatus));
      return [
        { v: label, color, bold: true },
        { v: n },
        { v: fmtPct(n, st.total) / 100, numFmt: "0%" },
        { bar: Math.round((n / maxN) * 24), color, }, { }, { }, { }, { }, { },
      ];
    });
  row = addTable(ws, row,
    [{ header: "Estado" }, { header: "Qtd." }, { header: "%" }].concat(Array.from({ length: 6 }, () => ({ header: "" }))),
    statusRows, { mergeFirst: 2, lastCol: LAST });
  row += 1;

  // --- Desempenho por área
  if (st.sections.length) {
    row = addSectionTitle(ws, row, LAST, "DESEMPENHO POR ÁREA (CATEGORIA)");
    const maxDef = Math.max(1, ...st.sections.map(s => s.defects));
    const areaRows = st.sections.map(s => ([
      { v: s.name },
      { v: s.items },
      { v: s.defects, color: s.defects ? NEM.purple : NEM.text },
      { v: s.avgPct / 100, numFmt: "0%", font: { name: FONT, size: 10, bold: true, color: scoreLabel(s.avgPct).color } },
      { bar: Math.round((s.defects / maxDef) * 24), color: NEM.purple }, { }, { }, { }, { },
    ]));
    row = addTable(ws, row,
      [{ header: "Área" }, { header: "Itens avaliados" }, { header: "Defeitos" }, { header: "Score médio" }].concat(Array.from({ length: 5 }, () => ({ header: "" }))),
      areaRows, { mergeFirst: 2, lastCol: LAST });
    row += 1;
  }

  // --- Resumo por dia
  if (st.byDay.length) {
    row = addSectionTitle(ws, row, LAST, "INSPECÇÕES POR DIA");
    const maxC = Math.max(1, ...st.byDay.map(d => d.count));
    const dayRows = st.byDay.map(d => ([
      { v: parseYMD(d.date), numFmt: "dd/mm/yyyy" },
      { v: d.count },
      { v: Math.round(d.scoreSum / d.count) / 100, numFmt: "0%" },
      { v: d.defects, color: d.defects ? NEM.purple : NEM.text },
      { bar: Math.round((d.count / maxC) * 24), color: NEM.main }, { }, { }, { }, { }, { },
    ]));
    row = addTable(ws, row,
      [{ header: "Data", align: "center" }, { header: "Inspecções" }, { header: "Score médio" }, { header: "Defeitos" }].concat(Array.from({ length: 6 }, () => ({ header: "" }))),
      dayRows, { mergeFirst: 1, lastCol: LAST });
    row += 1;
  }

  // --- Principais categorias de defeitos (§5.5)
  const defectSections = st.sections.filter(s => s.defects > 0);
  row = addSectionTitle(ws, row, LAST, "PRINCIPAIS CATEGORIAS DE DEFEITOS");
  if (defectSections.length) {
    const catRows = defectSections.map(s => ([
      { v: s.name },
      { v: s.defects },
      { v: st.defectCount ? fmtPct(s.defects, st.defectCount) / 100 : null, numFmt: "0%" },
      { bar: Math.round((s.defects / defectSections[0].defects) * 24), color: NEM.purple }, { }, { }, { }, { }, { },
    ]));
    row = addTable(ws, row,
      [{ header: "Categoria do defeito (área)" }, { header: "Qtd." }, { header: "% do total" }].concat(Array.from({ length: 6 }, () => ({ header: "" }))),
      catRows, { mergeFirst: 2, lastCol: LAST });
  } else {
    setCell(ws, row, 2, { v: "Não foram registados defeitos (itens com score < 3) no período.", font: fGrey });
    ws.mergeCells(row, 2, row, LAST);
    row += 1;
  }
  row += 1;

  // --- Resumo executivo (§5.7) — apenas conclusões suportadas pelos dados
  row = addSectionTitle(ws, row, LAST, "RESUMO EXECUTIVO DO PERÍODO");
  const bullets = [];
  bullets.push(`Foram realizadas ${st.total} inspecção(ões) no período, com ${st.itemsScored.length} itens avaliados (${st.itemsAll.length} no total).`);
  bullets.push(`Taxa de conclusão dos itens: ${st.itemsAll.length ? fmtPct(st.itemsScored.length, st.itemsAll.length) : 0}% — score médio de ${st.avgScore}% (${sl.label}).`);
  if (st.defectCount > 0) {
    const top = defectSections[0];
    bullets.push(`Foram registados ${st.defectCount} defeitos; a área com maior incidência é "${top.name}" (${top.defects} defeitos, ${fmtPct(top.defects, st.defectCount)}% do total).`);
    const dayTop = [...st.byDay].sort((a, b) => b.defects - a.defects)[0];
    if (dayTop && dayTop.defects > 0) bullets.push(`O dia com mais defeitos foi ${parseYMD(dayTop.date)?.toLocaleDateString("pt-PT") || dayTop.date} (${dayTop.defects} defeitos).`);
  } else {
    bullets.push("Não foram registados defeitos (itens com score < 3) no período analisado.");
  }
  if (st.critical > 0) bullets.push(`${st.critical} inspecção(ões) com nível crítico (score < 60%) merecem acompanhamento prioritário.`);
  const busiest = [...st.byDay].sort((a, b) => b.count - a.count)[0];
  if (busiest) bullets.push(`Dia com maior actividade: ${parseYMD(busiest.date)?.toLocaleDateString("pt-PT") || busiest.date} (${busiest.count} inspecção(ões)).`);

  bullets.forEach(b => {
    setCell(ws, row, 2, { v: "•  " + b, font: fMeta, align: { wrapText: true, vertical: "middle" }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: NEM.light } }, border: BOX });
    ws.mergeCells(row, 2, row, LAST);
    for (let c = 3; c <= LAST; c++) setCell(ws, row, c, { fill: { type: "pattern", pattern: "solid", fgColor: { argb: NEM.light } }, border: BOX });
    ws.getRow(row).height = 18;
    row += 1;
  });

  applyPrintSetup(ws, { landscape: true, scale: 90 });

  // ----------------------------- Folha 2: Detalhe -----------------------------
  const ws2 = wb.addWorksheet("Inspecções", { views: [{ showGridLines: false }] });
  ws2.columns = [
    { width: 2.3 }, { width: 12 }, { width: 22 }, { width: 22 }, { width: 20 },
    { width: 18 }, { width: 10 }, { width: 9 }, { width: 10 }, { width: 64 },
  ];
  ws2.getRow(1).height = 24;
  setCell(ws2, 1, 1, {
    v: `DETALHE DAS INSPECÇÕES — ${mesAnoPT(dateStr)} · ${client?.name || ""}`,
    font: { name: FONT, size: 12, bold: true, color: { argb: NEM.white } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: NEM.dark } },
    align: { vertical: "middle", horizontal: "left", indent: 1 },
  });
  ws2.mergeCells(1, 1, 1, 10);

  const detailRows = [...inspections]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(i => {
      const st2 = buildStats([i], nameOfSection);
      return [
        { v: parseYMD(i.date), numFmt: "dd/mm/yyyy" },
        { v: i.location_name || client?.name || "—" },
        { v: client?.name || "—" },
        { v: i.inspector_name || "—" },
        { v: STATE_LABELS[i.status] || i.status || "—", color: stateColor(i.status) },
        { v: (Number(i.score_pct) || 0) / 100, numFmt: "0%", font: { name: FONT, size: 10, bold: true, color: { argb: scoreLabel(Number(i.score_pct) || 0).color } } },
        { v: (i.items || []).filter(it => it.score !== null && it.score !== undefined).length },
        { v: st2.defectCount, color: st2.defectCount ? NEM.purple : NEM.text },
        { v: inspectionNotes(i, nameOfSection) || "—", wrap: true },
      ];
    });

  const headRow2 = 2;
  addTable(ws2, headRow2,
    [{ header: "Data" }, { header: "Localização" }, { header: "Cliente" }, { header: "Inspector" }, { header: "Estado" }, { header: "Score (%)" }, { header: "Itens" }, { header: "Defeitos" }, { header: "Observações", align: "left" }],
    detailRows, { lastCol: 10, autoFilter: true, freezeAt: 2 });

  applyPrintSetup(ws2, { landscape: true, scale: 72 });

  return wb;
}

// ---------------------------------------------------------------------------
// RELATÓRIO DIÁRIO — folha única operacional "Relatório Diário"
// ---------------------------------------------------------------------------
export async function buildDailyWorkbook({ client, inspections, dateStr, logo, now = new Date() }) {
  const ExcelJS = await ensureExcelJS();
  const nameOfSection = (insp, sid) => resolveSectionName(insp, sid);
  const st = buildStats(inspections, nameOfSection);
  const wb = new ExcelJS.Workbook();
  wb.creator = "FIMS — NemChem";
  wb.created = now;

  const ws = wb.addWorksheet("Relatório Diário", { views: [{ showGridLines: false }] });
  const LAST = 11;
  ws.columns = [{ width: 2.3 }, ...Array.from({ length: 10 }, () => ({ width: 14 }))];

  const refDate = parseYMD(dateStr) || parseYMD(inspections[0]?.date) || now;
  let row = addBanner(ws, wb, {
    title: "RELATÓRIO DIÁRIO DE INSPECÇÕES",
    meta1: `Data de referência: ${refDate.toLocaleDateString("pt-PT")}  ·  Cliente: ${client?.name || "—"}${client?.address ? `  ·  ${client.address}` : ""}`,
    meta2: `Âmbito: Inspecções submetidas na data seleccionada (${inspections.length} registo(s))`,
    meta3: `Ficheiro gerado em ${fmtDateTime(now)} pelo FIMS`,
    logo, lastCol: LAST,
  });

  // --- KPIs do dia (§6.2)
  row = addSectionTitle(ws, row, LAST, "INDICADORES DO DIA");
  const sl = scoreLabel(st.avgScore);
  row = addKpiCards(ws, row, [
    { label: "Inspecções do Dia", value: st.total, color: NEM.main },
    { label: "Concluídas", value: st.completed, sub: st.total ? `${fmtPct(st.completed, st.total)}%` : null, color: NEM.green },
    { label: "Score Médio", value: `${st.avgScore}%`, sub: sl.label, color: sl.color },
    { label: "Defeitos no Dia", value: st.defectCount, sub: st.itemsScored.length ? `${fmtPct(st.defectCount, st.itemsScored.length, 1)}% dos itens` : null, color: NEM.purple },
    { label: "Itens Avaliados", value: st.itemsScored.length, sub: `de ${st.itemsAll.length} itens`, color: NEM.dark },
  ], LAST);
  row += 1;

  // --- Estado das inspecções (§6.4) — cores: verde/laranja/vermelho
  row = addSectionTitle(ws, row, LAST, "ESTADO DAS INSPECÇÕES");
  const statusRows = Object.entries(st.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => {
      const maxN = Math.max(...Object.values(st.byStatus));
      return [
        { v: STATE_LABELS[s] || s, color: stateColor(s), bold: true },
        { v: n },
        { v: fmtPct(n, st.total) / 100, numFmt: "0%" },
        { bar: Math.round((n / maxN) * 24), color: stateColor(s) }, { }, { }, { }, { }, { },
      ];
    });
  row = addTable(ws, row,
    [{ header: "Estado" }, { header: "Qtd." }, { header: "%" }].concat(Array.from({ length: 6 }, () => ({ header: "" }))),
    statusRows, { mergeFirst: 2, lastCol: LAST });
  if (st.critical > 0) {
    setCell(ws, row, 2, { v: `⚠  ${st.critical} inspecção(ões) com nível crítico (score < 60%) — regra de alerta existente do FIMS.`, font: { name: FONT, size: 10, bold: true, color: { argb: NEM.red } } });
    ws.mergeCells(row, 2, row, LAST);
    row += 1;
  }
  row += 1;

  // --- Desempenho por área (§6.3: os registos não têm hora fiável →
  //     alternativa calculável: distribuição por área, conforme previsto)
  if (st.sections.length) {
    row = addSectionTitle(ws, row, LAST, "ACTIVIDADE POR ÁREA (os registos não incluem hora — distribuição por área)");
    const maxDef = Math.max(1, ...st.sections.map(s => s.defects));
    const areaRows = st.sections.map(s => ([
      { v: s.name },
      { v: s.items },
      { v: s.defects, color: s.defects ? NEM.purple : NEM.text },
      { v: s.avgPct / 100, numFmt: "0%", font: { name: FONT, size: 10, bold: true, color: scoreLabel(s.avgPct).color } },
      { bar: Math.round((s.defects / maxDef) * 24), color: NEM.purple }, { }, { }, { }, { },
    ]));
    row = addTable(ws, row,
      [{ header: "Área" }, { header: "Itens avaliados" }, { header: "Defeitos" }, { header: "Score médio" }].concat(Array.from({ length: 5 }, () => ({ header: "" }))),
      areaRows, { mergeFirst: 2, lastCol: LAST });
    row += 1;
  }

  // --- Tabela principal das inspecções do dia (§6.5)
  row = addSectionTitle(ws, row, LAST, "INSPECÇÕES DO DIA");
  const mainRows = [...inspections]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(i => {
      const st2 = buildStats([i], nameOfSection);
      return [
        { v: i.location_name || client?.name || "—" },
        { v: client?.name || "—" },
        { v: i.inspector_name || "—" },
        { v: STATE_LABELS[i.status] || i.status || "—", color: stateColor(i.status) },
        { v: (Number(i.score_pct) || 0) / 100, numFmt: "0%", font: { name: FONT, size: 10, bold: true, color: { argb: scoreLabel(Number(i.score_pct) || 0).color } } },
        { v: (i.items || []).filter(it => it.score !== null && it.score !== undefined).length },
        { v: st2.defectCount, color: st2.defectCount ? NEM.purple : NEM.text },
        { v: inspectionNotes(i, nameOfSection) || "—", wrap: true }, { }, { },
      ];
    });
  row = addTable(ws, row,
    [{ header: "Localização" }, { header: "Cliente" }, { header: "Inspector" }, { header: "Estado" }, { header: "Score (%)" }, { header: "Itens" }, { header: "Defeitos" }, { header: "Observações", align: "left" }],
    mainRows, { mergeFirst: 1, mergeLast: true, lastCol: LAST, autoFilter: true });
  row += 1;

  // --- Resultados críticos do dia (§6.6) — regra igual ao PDF (score ≤ 3)
  row = addSectionTitle(ws, row, LAST, "RESULTADOS CRÍTICOS (SCORE ≤ 3)");
  const findings = [];
  inspections.forEach(i => (i.items || []).forEach(it => {
    if (it.score !== null && it.score !== undefined && Number(it.score) <= 3) {
      findings.push({ insp: i, item: it });
    }
  }));
  if (findings.length) {
    const sevColor = { 1: NEM.red, 2: NEM.orange, 3: "FFBA7517" };
    const sevLabel = s => (s === 1 ? "Crítica" : s === 2 ? "Alta" : "Média");
    const findRows = findings.map(f => ([
      { v: nameOfSection(f.insp, f.item.section_id) },
      { v: f.item.label || f.item.text || "Item", align: "left" },
      { v: `${f.item.score}/5`, color: sevColor[Number(f.item.score)] || NEM.text, bold: true },
      { v: sevLabel(Number(f.item.score)), color: sevColor[Number(f.item.score)] || NEM.text },
      { v: (f.item.comment || "—"), wrap: true, align: "left" }, { }, { }, { }, { }, { },
    ]));
    row = addTable(ws, row,
      [{ header: "Área" }, { header: "Item", align: "left" }, { header: "Score" }, { header: "Severidade" }, { header: "Observação", align: "left" }],
      findRows, { mergeFirst: 1, mergeLast: true, lastCol: LAST });
  } else {
    setCell(ws, row, 2, { v: "✓ Nenhum resultado crítico no dia — todas as áreas pontuaram 4 ou 5.", font: { name: FONT, size: 10, bold: true, color: { argb: NEM.green } } });
    ws.mergeCells(row, 2, row, LAST);
    row += 1;
  }
  row += 1;

  // --- Resumo de ocorrências (§6.6) — apenas o que os dados suportam
  row = addSectionTitle(ws, row, LAST, "RESUMO DE OCORRÊNCIAS");
  const occ = [];
  const notCompleted = inspections.filter(i => !(i.status === "submitted" || i.status === "reviewed")).length;
  if (notCompleted > 0) occ.push(`${notCompleted} inspecção(ões) permanecem sem conclusão (estado ≠ submetida/revista).`);
  if (st.defectCount > 0) {
    const top = st.sections.filter(s => s.defects > 0)[0];
    occ.push(`Registados ${st.defectCount} defeitos no dia; área mais afectada: "${top.name}" (${top.defects}).`);
    occ.push(`Itens com severidade Crítica/Alta (score ≤ 2): ${st.defects.filter(it => Number(it.score) <= 2).length}.`);
  } else {
    occ.push("Dia sem defeitos registados (nenhum item com score < 3).");
  }
  if (st.critical > 0) occ.push(`${st.critical} inspecção(ões) com nível crítico global (score < 60%).`);
  const withNotes = inspections.filter(i => inspectionNotes(i, nameOfSection)).length;
  if (withNotes > 0) occ.push(`${withNotes} inspecção(ões) com observações registadas — ver coluna "Observações" e secção de resultados críticos.`);

  occ.forEach(b => {
    setCell(ws, row, 2, { v: "•  " + b, font: fMeta, align: { wrapText: true, vertical: "middle" }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: NEM.light } }, border: BOX });
    ws.mergeCells(row, 2, row, LAST);
    for (let c = 3; c <= LAST; c++) setCell(ws, row, c, { fill: { type: "pattern", pattern: "solid", fgColor: { argb: NEM.light } }, border: BOX });
    ws.getRow(row).height = 18;
    row += 1;
  });

  applyPrintSetup(ws, { landscape: true, scale: 90 });
  return wb;
}

// ---------------------------------------------------------------------------
// API de alto nível (browser): construir + descarregar o ficheiro
// ---------------------------------------------------------------------------
function safeName(s) { return String(s || "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "Cliente"; }

export async function generateMonthlyExcel({ client, inspections, dateStr, logo }) {
  const wb = await buildMonthlyWorkbook({ client, inspections, dateStr, logo, now: new Date() });
  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(buf, `Nemchem_Mensal_${safeName(client?.name)}_${String(dateStr).replace(/-/g, "")}.xlsx`);
}

export async function generateDailyExcel({ client, inspections, dateStr, logo }) {
  const wb = await buildDailyWorkbook({ client, inspections, dateStr, logo, now: new Date() });
  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(buf, `Nemchem_Diario_${safeName(client?.name)}_${String(dateStr).replace(/-/g, "")}.xlsx`);
}

function triggerDownload(buf, filename) {
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
