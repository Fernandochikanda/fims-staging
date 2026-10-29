// src/components/CEODashboardView.jsx
// CEO dashboard (NemChem FIMS mockup). No emojis (uses Icon). KPI trend arrows.
// Add-ons: SLA gauge, defect-resolution gauge, Top/Bottom 3 clients, inspector
// leaderboard, churn-risk flags, recent-activity feed, compare-to-last-year toggle,
// clickable client rows (onView).
import { useState, useMemo, useEffect } from "react";
import { jsPDF } from "jspdf";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, Legend } from "recharts";
import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import { SLA_TARGET } from "../lib/helpers";
import StatusBadge from "./StatusBadge";
import ScoreRing from "./ScoreRing";
import defectService from "../services/defectService";
import { useComms } from "../context/CommsContext";
import logoUrl from "../LOGO.png";

const PERIODS = [
  { id: "week", label: "Esta semana", days: 7 },
  { id: "month", label: "Este mês", days: 30 },
  { id: "quarter", label: "Este trimestre", days: 90 },
  { id: "year", label: "Este ano", days: 365 },
  { id: "all", label: "Tudo", days: 99999 },
];
const STATUS_OPTS = [
  { id: "all", label: "Todos os Status" },
  { id: "submitted", label: "Submetida" },
  { id: "reviewed", label: "Aprovada" },
  { id: "closed", label: "Fechada" },
  { id: "pending_acceptance", label: "Pendente" },
  { id: "needs_corrections", label: "Correção" },
];
function clsForScore(s) {
  if (s === null || s === undefined) return { label: "—", color: "#888" };
  if (s >= 85) return { label: "Excelente", color: "#0F6E56" };
  if (s >= 70) return { label: "Boa", color: "#378ADD" };
  if (s >= 50) return { label: "Regular", color: "#BA7517" };
  return { label: "Crítica", color: "#A32D2D" };
}
function scoreBg(s) {
  if (s === null || s === undefined) return "#eee";
  if (s >= 80) return "#0F6E56";
  if (s >= 60) return "#BA7517";
  return "#A32D2D";
}
function inRange(i, from, to) {
  if (!i || i.type === "leave" || !i.date) return false;
  const t = new Date(i.date).getTime();
  return t >= from && t < to;
}
function TrendTag({ trend, unit }) {
  if (trend === null || trend === undefined) return <span style={{ fontSize: 11, color: "#bbb" }}>—</span>;
  const up = trend >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 600, color: up ? "#0F6E56" : "#A32D2D" }}>
      <Icon name="trending" size={12} style={{ transform: up ? "none" : "rotate(180deg)" }} />
      {(up ? "+" : "") + trend + unit}
    </span>
  );
}
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return "há " + m + "min";
  const h = Math.floor(m / 60);
  if (h < 24) return "há " + h + "h";
  const d = Math.floor(h / 24);
  return "há " + d + "d";
}

export default function CEODashboardView({ inspections, locations, auditLogs, currentUser, onView }) {
  const { createAnnouncement } = useComms();
  const [period, setPeriod] = useState("month");
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annText, setAnnText] = useState("");
  const [annTarget, setAnnTarget] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const MONTHS = useMemo(() => {
    const arr = [];
    const t = new Date();
    for (let i = 0; i < 12; i++) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); arr.push({ key: d.toISOString().substring(0, 7), label: d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" }) }); }
    return arr;
  }, []);

  // Defeitos agora vêm do Supabase (async) — carregados em estado + refrescados periodicamente
  const [openDefects, setOpenDefects] = useState([]);
  const [resolvedDefects, setResolvedDefects] = useState([]);
  const [allDefects, setAllDefects] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const all = await defectService.getAll();
        if (!alive) return;
        setAllDefects(all);
        setOpenDefects(all.filter(d => d.status === "open"));
        setResolvedDefects(all.filter(d => d.status === "resolved"));
      } catch (e) {}
    };
    load();
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const periodDays = (PERIODS.find(x => x.id === period) || PERIODS[0]).days;
  const cutoff = useMemo(() => Date.now() - periodDays * 86400000, [periodDays]);
  const prevCutoff = useMemo(() => Date.now() - 2 * periodDays * 86400000, [periodDays]);

  const filtered = useMemo(() => {
    if (selectedMonth) return inspections.filter(i => i.type !== "leave" && i.date && i.date.startsWith(selectedMonth));
    return inspections.filter(i => inRange(i, cutoff, Date.now() + 1));
  }, [inspections, cutoff, selectedMonth]);
  const prevFiltered = useMemo(() => inspections.filter(i => inRange(i, prevCutoff, cutoff)), [inspections, prevCutoff, cutoff]);

  const total = filtered.length;
  const clientsInspected = new Set(filtered.map(i => i.location_id)).size;
  const scored = filtered.filter(i => i.score_pct !== null);
  const avgScore = scored.length ? Math.round(scored.reduce((s, i) => s + i.score_pct, 0) / scored.length) : 0;

  const prevTotal = prevFiltered.length;
  const prevClients = new Set(prevFiltered.map(i => i.location_id)).size;
  const prevScored = prevFiltered.filter(i => i.score_pct !== null);
  const prevAvg = prevScored.length ? Math.round(prevScored.reduce((s, i) => s + i.score_pct, 0) / prevScored.length) : 0;
  const pct = (cur, pv) => (pv ? Math.round((cur - pv) / pv * 100) : null);
  const totalTrend = pct(total, prevTotal);
  const clientsTrend = pct(clientsInspected, prevClients);
  const avgTrend = prevScored.length ? (avgScore - prevAvg) : null;

  const problemsOpen = openDefects.length;
  const problemsOverdue = openDefects.filter(d => { try { return defectService.slaRemaining(d) < 0; } catch (e) { return false; } }).length;
  const problemsResolved = resolvedDefects.length;

  const slaCompliance = scored.length ? Math.round(scored.filter(i => i.score_pct >= SLA_TARGET).length / scored.length * 100) : 0;
  const resolvedInSla = resolvedDefects.filter(d => d.resolved_at && d.opened_at && (new Date(d.resolved_at) - new Date(d.opened_at) <= 48 * 3600 * 1000)).length;
  const defectResolutionRate = resolvedDefects.length ? Math.round(resolvedInSla / resolvedDefects.length * 100) : 0;

  const classification = useMemo(() => {
    const c = { Excelente: 0, Boa: 0, Regular: 0, Crítica: 0 };
    scored.forEach(i => {
      const s = i.score_pct;
      if (s >= 85) c.Excelente++; else if (s >= 70) c.Boa++; else if (s >= 50) c.Regular++; else c.Crítica++;
    });
    return c;
  }, [scored]);
  const donutData = [
    { name: "Excelente", value: classification.Excelente, color: "#0F6E56" },
    { name: "Boa", value: classification.Boa, color: "#378ADD" },
    { name: "Regular", value: classification.Regular, color: "#BA7517" },
    { name: "Crítica", value: classification.Crítica, color: "#A32D2D" },
  ].filter(d => d.value > 0);

  const byClient = useMemo(() => {
    const m = {};
    filtered.forEach(i => { const n = i.location_name || "N/A"; m[n] = (m[n] || 0) + 1; });
    const arr = Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    if (arr.length > 5) {
      const top = arr.slice(0, 5);
      const outros = arr.slice(5).reduce((s, x) => s + x.count, 0);
      top.push({ name: "OUTROS", count: outros });
      return top;
    }
    return arr;
  }, [filtered]);

  const trend = useMemo(() => {
    const months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = d.toISOString().substring(0, 7);
      const label = d.toLocaleDateString("pt-PT", { month: "short" });
      const monthAll = inspections.filter(x => x.date && x.date.startsWith(key));
      const monthScored = monthAll.filter(x => x.score_pct !== null);
      const avg = monthScored.length ? Math.round(monthScored.reduce((s, x) => s + x.score_pct, 0) / monthScored.length) : 0;
      const prevKey = new Date(d.getFullYear() - 1, d.getMonth(), 1).toISOString().substring(0, 7);
      const prevS = inspections.filter(x => x.date && x.date.startsWith(prevKey) && x.score_pct !== null);
      const prevAvg = prevS.length ? Math.round(prevS.reduce((s, x) => s + x.score_pct, 0) / prevS.length) : null;
      months.push({ name: label, Total: monthAll.length, Média: avg, MédiaAnt: prevAvg });
    }
    return months;
  }, [inspections]);

  const byCategory = useMemo(() => {
    const m = {};
    allDefects.forEach(d => { const n = d.section_name || "N/A"; m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [allDefects]);

  const tableRows = useMemo(() => {
    return filtered
      .filter(i => filterClient === "all" || String(i.location_id) === String(filterClient))
      .filter(i => filterStatus === "all" || i.status === filterStatus)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 50);
  }, [filtered, filterClient, filterStatus]);

  const clientSummary = useMemo(() => {
    return locations.map(loc => {
      const li = filtered.filter(i => String(i.location_id) === String(loc.id));
      if (li.length === 0) return null;
      const last = li.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      const li2 = li.filter(i => i.score_pct !== null);
      const avg = li2.length ? Math.round(li2.reduce((s, i) => s + i.score_pct, 0) / li2.length) : null;
      const open = allDefects.filter(d => String(d.location_id) === String(loc.id) && d.status === "open").length;
      return { id: loc.id, name: loc.name, insps: li.length, last: last && last.date, avg, open };
    }).filter(Boolean).sort((a, b) => b.insps - a.insps).slice(0, 6);
  }, [filtered, locations, allDefects]);

  const bestClient = clientSummary.slice().sort((a, b) => (b.avg || 0) - (a.avg || 0))[0];
  const mostProblems = clientSummary.slice().sort((a, b) => b.open - a.open)[0];
  const criticalCount = scored.filter(i => i.score_pct < 50).length;

  const withAvg = clientSummary.filter(c => c.avg !== null);
  const top3 = withAvg.slice().sort((a, b) => b.avg - a.avg).slice(0, 3);
  const bottom3 = withAvg.slice().sort((a, b) => a.avg - b.avg).slice(0, 3);

  const inspectorLeaderboard = useMemo(() => {
    const m = {};
    filtered.forEach(i => {
      if (!i.inspector_name) return;
      if (!m[i.inspector_name]) m[i.inspector_name] = { name: i.inspector_name, count: 0, scored: 0, total: 0 };
      m[i.inspector_name].count++;
      if (i.score_pct !== null) { m[i.inspector_name].scored++; m[i.inspector_name].total += i.score_pct; }
    });
    return Object.values(m).map(x => ({ name: x.name, count: x.count, avg: x.scored ? Math.round(x.total / x.scored) : null }))
      .filter(x => x.avg !== null).sort((a, b) => b.avg - a.avg).slice(0, 5);
  }, [filtered]);

  const churnRisk = clientSummary.filter(c => (c.avg !== null && c.avg < 70) || c.open > 0);
  const recentActivity = (auditLogs || [])
    .filter(l => ["review", "notification", "schedule", "capa_alert", "alert", "approval"].includes(l.type))
    .slice(0, 5);

  const handleClientClick = (locId) => {
    if (!onView) return;
    const latest = filtered.filter(i => String(i.location_id) === String(locId)).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (latest) onView(latest);
  };

  const handleDownloadExcel = async () => {
    let logoImg = "";
    try {
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      logoImg = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {}
    const logoHtml = logoImg ? `<img src="${logoImg}" height="48" style="float:left;margin-right:12px" />` : "";

    const esc = (v) => String(v == null ? "—" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const kpiRows = [
      ["Total de Inspeções", total],
      ["Clientes Inspecionados", clientsInspected],
      ["Classificação Média", avgScore + "%"],
      ["SLA Compliance (target " + SLA_TARGET + "%)", slaCompliance + "%"],
      ["Defect Resolution Rate (48h)", defectResolutionRate + "%"],
      ["Problemas Abertos", problemsOpen],
      ["Problemas em Atraso", problemsOverdue],
      ["Problemas Resolvidos", problemsResolved],
    ].map(([k, v]) => `<tr><td style='font-weight:bold;background:#F8F7F4;padding:6px 10px;border:1px solid #eee'>${esc(k)}</td><td style='padding:6px 10px;border:1px solid #eee;font-weight:bold;color:#1E2A3A'>${esc(v)}</td></tr>`).join("");

    const clsRows = [
      ["Excelente", classification.Excelente, "#0F6E56"],
      ["Boa", classification.Boa, "#378ADD"],
      ["Regular", classification.Regular, "#BA7517"],
      ["Crítica", classification.Crítica, "#A32D2D"],
    ].map(([n, v, c]) => `<tr><td style='padding:6px 10px;border:1px solid #eee;color:${c};font-weight:bold'>${esc(n)}</td><td style='padding:6px 10px;border:1px solid #eee'>${esc(v)}</td></tr>`).join("");

    const top3Rows = top3.map((c, i) => `<tr><td style='padding:6px 10px;border:1px solid #eee'>${i + 1}. ${esc(c.name)}</td><td style='padding:6px 10px;border:1px solid #eee;color:#0F6E56;font-weight:bold'>${esc(c.avg)}%</td></tr>`).join("") || `<tr><td colspan=2 style='padding:10px;color:#888'>Sem dados.</td></tr>`;

    const sheet1 = `<table border=1>
<tr><td colspan=4 style='background:#1E2A3A;color:white;padding:14px;font-size:18pt;font-weight:bold'>${logoHtml} NemChem — FIMS Inspection Dashboard</td></tr>
<tr><td colspan=4 style='background:#185FA5;color:white;padding:6px 10px;font-size:10pt'>Visão Geral e Desempenho dos Clientes — Período: ${esc(pLabel)}</td></tr>
<tr><td colspan=4 style='padding:8px;font-size:13pt;font-weight:bold;color:#1E2A3A'>Global KPIs</td></tr>
 ${kpiRows}
<tr><td colspan=4 style='padding:8px;font-size:13pt;font-weight:bold;color:#1E2A3A'>Classificação das Inspeções</td></tr>
 ${clsRows}
<tr><td colspan=4 style='padding:8px;font-size:13pt;font-weight:bold;color:#0F6E56'>Top 3 Clientes</td></tr>
 ${top3Rows}
</table>`;

    const regHead = ["Nº", "Cliente", "Data", "Inspetor", "Score", "Classificação", "Status"].map((h) => `<td style='background:#1E2A3A;color:white;padding:6px 8px;font-weight:bold'>${esc(h)}</td>`).join("");
    const regRows = tableRows.map((insp, i) => {
      const c = clsForScore(insp.score_pct);
      return `<tr><td style='padding:5px 8px;border:1px solid #eee'>${i + 1}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(insp.location_name)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(insp.date)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(insp.inspector_name)}</td><td style='padding:5px 8px;border:1px solid #eee;font-weight:bold'>${insp.score_pct !== null ? insp.score_pct + "%" : "—"}</td><td style='padding:5px 8px;border:1px solid #eee;color:${c.color};font-weight:bold'>${esc(c.label)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(insp.status)}</td></tr>`;
    }).join("") || `<tr><td colspan=7 style='padding:12px;color:#888'>Sem inspeções no período.</td></tr>`;
    const sheet2 = `<table border=1><tr>${regHead}</tr>${regRows}</table>`;

    const cliHead = ["Cliente", "Inspeções", "Última Inspeção", "Score Médio", "Problemas Abertos"].map((h) => `<td style='background:#1E2A3A;color:white;padding:6px 8px;font-weight:bold'>${esc(h)}</td>`).join("");
    const cliRows = clientSummary.map((c) => `<tr><td style='padding:5px 8px;border:1px solid #eee;font-weight:bold'>${esc(c.name)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(c.insps)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(c.last)}</td><td style='padding:5px 8px;border:1px solid #eee;font-weight:bold'>${c.avg !== null ? c.avg + "%" : "—"}</td><td style='padding:5px 8px;border:1px solid #eee;color:${c.open > 0 ? "#A32D2D" : "#6B7280"};font-weight:bold'>${esc(c.open)}</td></tr>`).join("") || `<tr><td colspan=5 style='padding:12px;color:#888'>Sem dados.</td></tr>`;
    const sheet3 = `<table border=1><tr>${cliHead}</tr>${cliRows}</table>`;

    const probHead = ["Item", "Cliente", "Categoria", "Score", "Aberto em", "Prazo (48h)", "Recorrência", "Estado"].map((h) => `<td style='background:#A32D2D;color:white;padding:6px 8px;font-weight:bold'>${esc(h)}</td>`).join("");
    const probRows = allDefects.map((d) => `<tr><td style='padding:5px 8px;border:1px solid #eee;font-weight:bold'>${esc(d.item_label)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(d.location_name)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(d.section_name)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(d.score)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(d.opened_at)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(d.due_at)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(d.recurrence_count)}</td><td style='padding:5px 8px;border:1px solid #eee;color:${d.status === "open" ? "#A32D2D" : "#0F6E56"};font-weight:bold'>${d.status === "open" ? "Aberto" : "Resolvido"}</td></tr>`).join("") || `<tr><td colspan=8 style='padding:12px;color:#888'>Nenhum defeito registado.</td></tr>`;
    const sheet4 = `<table border=1><tr>${probHead}</tr>${probRows}</table>`;

    const catHead = ["Categoria", "Problemas"].map((h) => `<td style='background:#A32D2D;color:white;padding:6px 8px;font-weight:bold'>${esc(h)}</td>`).join("");
    const catRows = byCategory.map((c) => `<tr><td style='padding:5px 8px;border:1px solid #eee'>${esc(c.name)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(c.count)}</td></tr>`).join("") || `<tr><td colspan=2 style='padding:12px;color:#888'>Sem dados.</td></tr>`;
    const insHead = ["Inspetor", "Inspeções", "Score Médio"].map((h) => `<td style='background:#1E2A3A;color:white;padding:6px 8px;font-weight:bold'>${esc(h)}</td>`).join("");
    const insRows = inspectorLeaderboard.map((ins) => `<tr><td style='padding:5px 8px;border:1px solid #eee;font-weight:bold'>${esc(ins.name)}</td><td style='padding:5px 8px;border:1px solid #eee'>${esc(ins.count)}</td><td style='padding:5px 8px;border:1px solid #eee;font-weight:bold'>${esc(ins.avg)}%</td></tr>`).join("") || `<tr><td colspan=3 style='padding:12px;color:#888'>Sem dados.</td></tr>`;
    const sheet5 = `<table border=1>
<tr><td colspan=2 style='background:#A32D2D;color:white;padding:8px;font-size:13pt;font-weight:bold'>Problemas por Categoria</td></tr>
<tr>${catHead}</tr>${catRows}
<tr><td colspan=2 style='padding:8px'></td></tr>
<tr><td colspan=3 style='background:#1E2A3A;color:white;padding:8px;font-size:13pt;font-weight:bold'>Inspector Leaderboard</td></tr>
<tr>${insHead}</tr>${insRows}
</table>`;

    const html = "<!DOCTYPE html>\n<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:x='urn:schemas-microsoft-com:office:excel' xmlns='http://www.w3.org/TR/REC-html40'>\n<head>\n<meta charset='utf-8'>\n<!--[if gte mso 9]><xml>\n<x:ExcelWorkbook>\n<x:ExcelWorksheets>\n<x:ExcelWorksheet><x:Name>Dashboard</x:Name><x:WorksheetOptions><x:Selected/></x:WorksheetOptions></x:ExcelWorksheet>\n<x:ExcelWorksheet><x:Name>Registro de Inspecoes</x:Name><x:WorksheetOptions/></x:ExcelWorksheet>\n<x:ExcelWorksheet><x:Name>Clientes</x:Name><x:WorksheetOptions/></x:ExcelWorksheet>\n<x:ExcelWorksheet><x:Name>Problemas</x:Name><x:WorksheetOptions/></x:ExcelWorksheet>\n<x:ExcelWorksheet><x:Name>Analytics</x:Name><x:WorksheetOptions/></x:ExcelWorksheet>\n</x:ExcelWorksheets>\n</x:ExcelWorkbook>\n</xml><![endif]-->\n</head>\n<body>\n" + sheet1 + "\n<br clear=all style='page-break-before:always'>\n" + sheet2 + "\n<br clear=all style='page-break-before:always'>\n" + sheet3 + "\n<br clear=all style='page-break-before:always'>\n" + sheet4 + "\n<br clear=all style='page-break-before:always'>\n" + sheet5 + "\n</body>\n</html>";

    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'NemChem-FIMS-Dashboard-' + period + '.xls';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBoardroomPDF = async () => {
    const doc = new jsPDF();
    let logoDataUrl = null;
    try {
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      logoDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {}
    doc.setFillColor(30, 42, 58); doc.rect(0, 0, 210, 30, 'F');
    if (logoDataUrl) {
      try { doc.setFillColor(255, 255, 255); doc.roundedRect(13, 6, 34, 18, 2, 2, 'F'); doc.addImage(logoDataUrl, 'PNG', 15, 8, 30, 14); } catch (e) {}
    }
    doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.setFont("helvetica", "bold");
    doc.text("FIMS - Executive Summary", 55, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("NemChem - Field Inspection Management System", 55, 23);
    doc.setFontSize(10); doc.text("Data: " + new Date().toLocaleDateString("pt-PT"), 55, 28);
    let y = 42;
    doc.setTextColor(50, 50, 50); doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("Global KPIs", 14, y); y += 9;
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    const kpis = [
      "Total de Inspecoes: " + total,
      "Clientes Inspecionados: " + clientsInspected,
      "Classificacao Media: " + avgScore + "%",
      "SLA Compliance (target " + SLA_TARGET + "%): " + slaCompliance + "%",
      "Defect Resolution Rate (48h): " + defectResolutionRate + "%",
      "Problemas Abertos: " + problemsOpen,
      "Problemas em Atraso: " + problemsOverdue,
      "Problemas Resolvidos: " + problemsResolved,
    ];
    kpis.forEach(k => { doc.text(k, 14, y); y += 6; });
    y += 4;
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("Top 3 Clientes", 14, y); y += 8;
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    top3.forEach((c, i) => { doc.text((i + 1) + ". " + c.name + " (" + c.avg + "%)", 14, y); y += 6; });
    y += 4;
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("Bottom 3 Clientes", 14, y); y += 8;
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    bottom3.forEach((c, i) => { doc.text((i + 1) + ". " + c.name + " (" + c.avg + "%)", 14, y); y += 6; });
    y += 4;
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("Risco de Churn", 14, y); y += 8;
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    if (churnRisk.length === 0) { doc.text("Nenhum", 14, y); y += 6; }
    churnRisk.forEach((c) => { if (y > 280) { doc.addPage(); y = 20; } doc.text("- " + c.name + " (avg " + (c.avg !== null ? c.avg + "%" : "N/A") + ", " + c.open + " abertos)", 14, y); y += 6; });
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.text("NEMCHEM © 2026 - Documento gerado pelo Nemchem", 105, 290, { align: "center" }); }
    doc.save("FIMS-Executive-Summary.pdf");
  };

  const handleCreateAnnouncement = () => {
    if (!annTitle.trim() || !annText.trim()) return;
    const targetRole = annTarget === "all" ? null : annTarget;
    createAnnouncement(currentUser.id, annTitle.trim(), annText.trim(), targetRole);
    setAnnTitle(""); setAnnText(""); setAnnTarget("all"); setShowAnnModal(false);
  };

  const kpiCards = [
    { label: "Total de Inspeções", value: total, color: "#1E2A3A", icon: "clipboard", trend: totalTrend, unit: "%" },
    { label: "Clientes Inspecionados", value: clientsInspected, color: "#0F6E56", icon: "users", trend: clientsTrend, unit: "%" },
    { label: "Classificação Média", value: avgScore + "%", color: "#378ADD", icon: "chart", trend: avgTrend, unit: "pp" },
    { label: "Problemas Abertos", value: problemsOpen, color: "#D35400", icon: "alert", trend: null, unit: "" },
    { label: "Problemas em Atraso", value: problemsOverdue, color: "#8E44AD", icon: "bell", trend: null, unit: "" },
    { label: "Problemas Resolvidos", value: problemsResolved, color: "#27AE60", icon: "check", trend: null, unit: "" },
  ];
  const pLabel = (PERIODS.find(p => p.id === period) || PERIODS[0]).label;

  return (
    <div>
      <div style={{ background: "linear-gradient(90deg,#1E2A3A,#185FA5)", color: "white", borderRadius: 10, padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <img src={logoUrl} alt="NemChem" style={{ height: 48, width: "auto", background: "white", borderRadius: 8, padding: 4 }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>NemChem</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Clean Today. Safer Tomorrow.</div>
        </div>
        <div style={{ textAlign: "center", flex: 2, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>FIMS – Relatório de Inspeções</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Visão Geral e Desempenho dos Clientes</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, opacity: 0.85 }}>Período de Inspeção</div>
            <select value={period} onChange={e => setPeriod(e.target.value)} style={{ marginTop: 2, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)", color: "white", fontWeight: 600 }}>
              {PERIODS.map(p => <option key={p.id} value={p.id} style={{ color: "#1E2A3A" }}>{p.label}</option>)}
            </select>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ marginTop: 2, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.12)", color: "white", fontWeight: 600 }}>
              <option value="" style={{ color: "#1E2A3A" }}>Todos os meses</option>
              {MONTHS.map(m => <option key={m.key} value={m.key} style={{ color: "#1E2A3A" }}>{m.label}</option>)}
            </select>
          </div>
          <button className="btn btn-sm" onClick={() => setShowAnnModal(true)} title="Comunicar anúncio" style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.4)" }}>
            <Icon name="bell" size={13} /> Comunicar
          </button>
          <button className="btn btn-sm" onClick={handleBoardroomPDF} title="Exportar Boardroom PDF" style={{ background: "#A32D2D", color: "white" }}>
            <Icon name="download" size={13} /> Boardroom PDF
          </button>
          <button className="btn btn-sm" onClick={handleDownloadExcel} title="Exportar Excel (5 abas)" style={{ background: "#0F6E56", color: "white" }}>
            <Icon name="download" size={13} /> Excel (.xls)
          </button>
        </div>
      </div>

      <div className="metric-grid">
        {kpiCards.map((k, i) => (
          <div key={i} className="card" style={{ padding: 14, borderLeft: "4px solid " + k.color, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: k.color }}>
              <Icon name={k.icon} size={14} />
              <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, textTransform: "uppercase" }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#1E2A3A" }}>{k.value}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <TrendTag trend={k.trend} unit={k.unit} />
              {k.trend !== null && k.trend !== undefined && <span style={{ fontSize: 9, color: "#9CA3AF" }}>vs. anterior</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
          <ScoreRing pct={slaCompliance} size={72} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1E2A3A" }}>SLA Compliance</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Target: {SLA_TARGET}% · {scored.length} inspeções avaliadas</div>
          </div>
        </div>
        <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
          <ScoreRing pct={defectResolutionRate} size={72} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1E2A3A" }}>Defect Resolution Rate</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>Resolvidos dentro de 48h · {resolvedDefects.length} resolvidos</div>
          </div>
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "#1E2A3A" }}>Classificação das Inspeções</h3>
          {donutData.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ResponsiveContainer width="55%" height={180}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, fontSize: 12 }}>
                {donutData.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: d.color }} />
                    <span style={{ color: "#444" }}>{d.name}: <b>{d.value}</b></span>
                  </div>
                ))}
                <div style={{ marginTop: 6, fontSize: 11, color: "#888" }}>{total} inspeções no período</div>
              </div>
            </div>
          ) : <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 13 }}>Sem dados no período.</div>}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "#1E2A3A" }}>Inspeções por Cliente</h3>
          {byClient.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byClient} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Inspeções" fill="#378ADD" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 13 }}>Sem dados no período.</div>}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, margin: 0, color: "#1E2A3A" }}>Tendência de Inspeções (6 meses)</h3>
            <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#6B7280" }}>
              <input type="checkbox" checked={compareMode} onChange={e => setCompareMode(e.target.checked)} style={{ cursor: "pointer" }} />
              Comparar (ano anterior)
            </label>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={trend} margin={{ left: -20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="l" dataKey="Total" name="Total" fill="#378ADD" radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="Média" name="Média de Score" stroke="#0F6E56" strokeWidth={2} />
              {compareMode && <Line yAxisId="r" type="monotone" dataKey="MédiaAnt" name="Média (ano anterior)" stroke="#9CA3AF" strokeDasharray="4 4" connectNulls />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "#A32D2D" }}>Problemas por Categoria</h3>
          {byCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byCategory} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" name="Problemas" fill="#A32D2D" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 13 }}>Sem defeitos registados.</div>}
        </div>
      </div>

      <div className="three-col" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, marginBottom: 8, color: "#0F6E56" }}>Top 3 Clientes</h3>
          {top3.length === 0 && <div style={{ fontSize: 12, color: "#888" }}>Sem dados.</div>}
          {top3.map((c, i) => (
            <div key={c.id} onClick={() => handleClientClick(c.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f3f3f3", cursor: onView ? "pointer" : "default" }}>
              <span style={{ fontSize: 12 }}><Icon name="star" size={12} style={{ color: "#0F6E56", marginRight: 4 }} />{i + 1}. {c.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0F6E56" }}>{c.avg}%</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, marginBottom: 8, color: "#A32D2D" }}>Bottom 3 Clientes</h3>
          {bottom3.length === 0 && <div style={{ fontSize: 12, color: "#888" }}>Sem dados.</div>}
          {bottom3.map((c, i) => (
            <div key={c.id} onClick={() => handleClientClick(c.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f3f3f3", cursor: onView ? "pointer" : "default" }}>
              <span style={{ fontSize: 12 }}><Icon name="alert" size={12} style={{ color: "#A32D2D", marginRight: 4 }} />{i + 1}. {c.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#A32D2D" }}>{c.avg}%</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, marginBottom: 8, color: "#1E2A3A" }}>Inspector Leaderboard</h3>
          {inspectorLeaderboard.length === 0 && <div style={{ fontSize: 12, color: "#888" }}>Sem dados.</div>}
          {inspectorLeaderboard.map((ins, i) => (
            <div key={ins.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f3f3f3" }}>
              <span style={{ fontSize: 12 }}>{i + 1}. {ins.name} <span style={{ color: "#9CA3AF" }}>({ins.count})</span></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: clsForScore(ins.avg).color }}>{ins.avg}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, marginBottom: 8, color: "#A32D2D" }}>Risco de Churn</h3>
          {churnRisk.length === 0 && <div style={{ fontSize: 12, color: "#888" }}>Nenhum cliente em risco.</div>}
          {churnRisk.map(c => (
            <div key={c.id} onClick={() => handleClientClick(c.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f3f3f3", cursor: onView ? "pointer" : "default" }}>
              <span style={{ fontSize: 12 }}><Icon name="alert" size={12} style={{ color: "#A32D2D", marginRight: 4 }} />{c.name}</span>
              <span style={{ fontSize: 11, color: "#6B7280" }}>avg {c.avg !== null ? c.avg + "%" : "N/A"} · {c.open} abertos</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ fontSize: 13, marginBottom: 8, color: "#1E2A3A" }}>Atividade Recente</h3>
          {recentActivity.length === 0 && <div style={{ fontSize: 12, color: "#888" }}>Sem atividade recente.</div>}
          {recentActivity.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid #f3f3f3" }}>
              <Icon name="audit" size={12} style={{ color: "#378ADD", marginTop: 1, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12 }}>{l.action || l.details || l.note || l.type}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>{(l.user && (l.user.name || l.user)) || "Sistema"} · {timeAgo(l.timestamp || l.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ceo-split">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ fontSize: 14, margin: 0, color: "#1E2A3A", flex: 1 }}>Registro de Inspeções</h3>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="form-select" style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}>
              <option value="all">Todos os Clientes</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-select" style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}>
              {STATUS_OPTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: "#F8F7F4", zIndex: 1 }}>
                <tr>
                  {["Nº", "Cliente", "Data", "Inspetor", "Score", "Classificação", "Status"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee", color: "#6B7280", fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#888" }}>Sem inspeções neste filtro/período.</td></tr>
                )}
                {tableRows.map((insp, idx) => {
                  const c = clsForScore(insp.score_pct);
                  return (
                    <tr key={insp.id} onClick={() => onView && onView(insp)} style={{ borderBottom: "1px solid #f3f3f3", cursor: onView ? "pointer" : "default" }}>
                      <td style={{ padding: "6px", color: "#9CA3AF" }}>{String(idx + 1).padStart(3, "0")}</td>
                      <td style={{ padding: "6px", fontWeight: 500 }}>{insp.location_name || "—"}</td>
                      <td style={{ padding: "6px", color: "#6B7280" }}>{insp.date || "—"}</td>
                      <td style={{ padding: "6px", color: "#6B7280" }}>{insp.inspector_name || "—"}</td>
                      <td style={{ padding: "6px" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, color: "white", fontWeight: 700, background: scoreBg(insp.score_pct), minWidth: 36, textAlign: "center" }}>{insp.score_pct !== null ? insp.score_pct + "%" : "—"}</span>
                      </td>
                      <td style={{ padding: "6px", color: c.color, fontWeight: 600 }}>{c.label}</td>
                      <td style={{ padding: "6px" }}>{<StatusBadge status={insp.status} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: 14, margin: 0, color: "#1E2A3A" }}>Resumo por Cliente</h3>
            </div>
            <div style={{ maxHeight: 200, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead style={{ position: "sticky", top: 0, background: "#F8F7F4" }}>
                  <tr>{["Cliente", "Inspec.", "Média", "Abertos"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px", borderBottom: "1px solid #eee", color: "#6B7280", fontSize: 10 }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {clientSummary.length === 0 && <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: "#888" }}>Sem dados.</td></tr>}
                  {clientSummary.map(c => (
                    <tr key={c.id} onClick={() => handleClientClick(c.id)} style={{ borderBottom: "1px solid #f3f3f3", cursor: onView ? "pointer" : "default" }}>
                      <td style={{ padding: "6px", fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: "6px" }}>{c.insps}</td>
                      <td style={{ padding: "6px", color: (c.avg || 0) >= 80 ? "#0F6E56" : (c.avg || 0) >= 60 ? "#BA7517" : "#A32D2D", fontWeight: 600 }}>{c.avg !== null ? c.avg + "%" : "—"}</td>
                      <td style={{ padding: "6px", color: c.open > 0 ? "#A32D2D" : "#6B7280", fontWeight: c.open > 0 ? 700 : 400 }}>{c.open}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <h3 style={{ fontSize: 14, marginBottom: 10, color: "#1E2A3A" }}>Principais Destaques</h3>
            <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
              {bestClient && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Icon name="star" size={14} style={{ color: "#0F6E56", flexShrink: 0, marginTop: 1 }} />
                  <span><b>Melhor cliente:</b> {bestClient.name} ({bestClient.avg !== null ? bestClient.avg + "%" : "—"} de score médio)</span>
                </div>
              )}
              {mostProblems && mostProblems.open > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Icon name="alert" size={14} style={{ color: "#BA7517", flexShrink: 0, marginTop: 1 }} />
                  <span><b>Maior nº de problemas:</b> {mostProblems.name} ({mostProblems.open} abertos)</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Icon name="alert" size={14} style={{ color: "#A32D2D", flexShrink: 0, marginTop: 1 }} />
                <span><b>{criticalCount}</b> inspeção(ões) com classificação crítica</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Icon name="bell" size={14} style={{ color: "#8E44AD", flexShrink: 0, marginTop: 1 }} />
                <span><b>{problemsOverdue}</b> problema(s) em atraso (requerem atenção)</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Icon name="chart" size={14} style={{ color: "#378ADD", flexShrink: 0, marginTop: 1 }} />
                <span>Período: <b>{pLabel}</b> · {total} inspeções</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAnnModal && (
        <div className="modal-overlay" onClick={() => setShowAnnModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div style={{ fontSize: 15, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="bell" size={14} /> Novo Anúncio
              </div>
              <button className="icon-btn" onClick={() => setShowAnnModal(false)}><Icon name="x" size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Título</label>
                <input className="form-input" value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="Título do anúncio" />
              </div>
              <div className="form-group">
                <label className="form-label">Mensagem</label>
                <textarea className="form-textarea" value={annText} onChange={e => setAnnText(e.target.value)} placeholder="Texto do anúncio..." style={{ minHeight: 70 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Destinatários</label>
                <select className="form-select" value={annTarget} onChange={e => setAnnTarget(e.target.value)}>
                  <option value="all">Todos</option>
                  <option value={ROLES.CEO}>CEO</option>
                  <option value={ROLES.SUPERVISOR}>Supervisores</option>
                  <option value={ROLES.INSPECTOR}>Inspetores</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAnnModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateAnnouncement} disabled={!annTitle.trim() || !annText.trim()}>Publicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
