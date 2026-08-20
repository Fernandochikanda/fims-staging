// /src/lib/helpers.js
import { SEED_LOCATIONS } from "../data/constants";
import { getTemplate } from "../data/clientTemplates";

export function genId() { return Date.now() + Math.random().toString(36).slice(2); }

// UPDATED LOGIC: Notes and 3 photos are ONLY mandatory if score is 1, 2, or 3.
export function isItemComplete(item, photoCountForItem) {
  if (item.score === null || item.score === undefined) return false;
  
  if (item.score <= 3) {
    if (!item.comment || !item.comment.trim()) return false;
    if ((photoCountForItem || 0) < 3) return false;
  }
  
  return true;
}

export function scoreLabel(pct) {
  if (pct >= 90) return { label: "Excelente", color: "#0F6E56" };
  if (pct >= 75) return { label: "Acima da Média", color: "#3B6D11" };
  if (pct >= 60) return { label: "Média", color: "#BA7517" };
  if (pct >= 40) return { label: "Deficiente", color: "#993C1D" };
  return { label: "Mau", color: "#A32D2D" };
}

export function getRiskLevel(score) {
  if (score === 1) return { label: "Critical", color: "#A32D2D" };
  if (score === 2) return { label: "High Risk", color: "#993C1D" };
  if (score === 3) return { label: "Medium Risk", color: "#BA7517" };
  if (score === 4) return { label: "Acceptable", color: "#3B6D11" };
  if (score === 5) return { label: "Excellent", color: "#0F6E56" };
  return { label: "N/A", color: "#888" };
}

export function getCategoryHealth(items) {
  const answered = items.filter(i => i.score !== null);
  if (!answered.length) return { avg: 0, health: 0, risk: "N/A", color: "#888" };
  const total = answered.reduce((s, i) => s + Number(i.score), 0);
  const avg = total / answered.length;
  const health = Math.round((avg / 5) * 100);
  const risk = avg <= 2 ? "High Risk" : avg <= 3 ? "Medium Risk" : avg <= 4 ? "Acceptable" : "Excellent";
  const color = avg <= 2 ? "#A32D2D" : avg <= 3 ? "#BA7517" : avg <= 4 ? "#3B6D11" : "#0F6E56";
  return { avg: avg.toFixed(1), health, risk, color };
}

export function calcScore(items) {
  const answered = items.filter(i => i.score !== null && i.score !== undefined);
  if (!answered.length) return null;
  const total = answered.reduce((s, i) => s + Number(i.score), 0);
  const maxPossible = answered.length * 5;
  return Math.round((total / maxPossible) * 100);
}

export function generateAISummary(items, locationName) {
  const lowScores = items.filter(i => i.score !== null && i.score <= 2);
  let summary = `The inspection at ${locationName} was conducted. `;
  let recommendations = [];

  if (lowScores.length === 0) {
    summary += "Overall facility hygiene and maintenance are excellent. All areas meet the required SLA standards. No immediate corrective actions are required.";
  } else {
    summary += `${lowScores.length} critical issue(s) were identified requiring immediate attention. `;
    lowScores.forEach(item => {
      recommendations.push(`- **${item.text || item.label}**: Scored ${item.score}/5. ${item.comment || "No observation provided."} Corrective action required within 48 hours.`);
    });
  }
  return { summary, recommendations };
}

export function genSeedInspections() {
  const inspections = [];
  const statuses = ["submitted", "reviewed", "closed"];
  const locations = SEED_LOCATIONS;
  const inspectors = [
    { id: 4, name: "João Tembe" },
    { id: 5, name: "Maria Nhantumbo" },
    { id: 6, name: "Carlos Mondlane" },
    { id: 7, name: "Rita Macuácua" }
  ];

  for (let i = 0; i < 60; i++) {
    const loc = locations[Math.floor(Math.random() * locations.length)];
    const insp = inspectors[Math.floor(Math.random() * inspectors.length)];
    const daysAgo = Math.floor(Math.random() * 180);
    const date = new Date(); 
    date.setDate(date.getDate() - daysAgo);
    
    // CORRIGIDO: Usar getTemplate diretamente
    const template = getTemplate(loc.name);
    const templateSections = template.sections || [];
    
    const items = templateSections.flatMap(s => 
      (s.items || []).map(item => ({
        ...item, 
        section_id: s.id,
        score: Math.floor(Math.random() * 3) + 3, 
        comment: "Tudo conforme os padrões exigidos.", 
        photos: []
      }))
    );
    const sections = templateSections.map(s => ({ 
      id: s.id, 
      observation: "Operação padrão executada.", 
      photos: [] 
    }));
    
    const pct = calcScore(items);
    
    inspections.push({
      id: genId() + i,
      location_id: loc.id, 
      location_name: loc.name,
      inspector_id: insp.id, 
      inspector_name: insp.name,
      supervisor_id: 3, 
      supervisor_name: "Ana Sitoe",
      status: statuses[i % statuses.length],
      score_pct: pct,
      date: date.toISOString().split("T")[0],
      items, 
      sections,
      notes: "Inspeção de rotina realizada sem problemas.",
      alert_level: pct < 60 ? "critical" : pct < 75 ? "warning" : "ok",
      type: "inspection", 
      accepted: true
    });
  }

  // CORRIGIDO: Usar getTemplate diretamente
  const pendingLoc = locations.find(l => l.name === "Baker Hughes");
  const pendingTemplate = getTemplate(pendingLoc?.name || "Baker Hughes");
  const pending = {
    id: "pending-1", 
    location_id: 1, 
    location_name: "Baker Hughes",
    inspector_id: 4, 
    inspector_name: "João Tembe",
    supervisor_id: 3, 
    supervisor_name: "Ana Sitoe",
    status: "pending", 
    score_pct: null, 
    date: new Date().toISOString().split("T")[0],
    items: (pendingTemplate.sections || []).flatMap(s => 
      (s.items || []).map(item => ({ 
        ...item, 
        section_id: s.id, 
        score: null, 
        comment: "", 
        photos: [] 
      }))
    ),
    sections: (pendingTemplate.sections || []).map(s => ({ 
      id: s.id, 
      observation: "", 
      photos: [] 
    })),
    notes: "", 
    alert_level: "ok", 
    type: "inspection", 
    accepted: true
  };
  
  // CORRIGIDO: Usar getTemplate diretamente
  const inprogLoc = locations.find(l => l.name === "FCDO");
  const inprogTemplate = getTemplate(inprogLoc?.name || "FCDO");
  const inprog = {
    id: "inprog-1", 
    location_id: 14, 
    location_name: "FCDO",
    inspector_id: 5, 
    inspector_name: "Maria Nhantumbo",
    supervisor_id: 3, 
    supervisor_name: "Ana Sitoe",
    status: "in_progress", 
    score_pct: null, 
    date: new Date().toISOString().split("T")[0],
    items: (inprogTemplate.sections || []).flatMap(s => 
      (s.items || []).map(item => ({ 
        ...item, 
        section_id: s.id, 
        score: null, 
        comment: "", 
        photos: [] 
      }))
    ),
    sections: (inprogTemplate.sections || []).map(s => ({ 
      id: s.id, 
      observation: "", 
      photos: [] 
    })),
    notes: "", 
    alert_level: "ok", 
    type: "inspection", 
    accepted: true
  };
  
  return [pending, inprog, ...inspections];
}

export const SLA_TARGET = 85;

export function getMonthlyTrend(inspections) {
  const months = [];
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({ key: d.toISOString().substring(0, 7), label: d.toLocaleDateString("pt-PT", { month: "short" }) });
  }
  return months.map(m => {
    const monthInsps = inspections.filter(i => i.date && i.date.startsWith(m.key) && i.score_pct !== null);
    const avg = monthInsps.length ? Math.round(monthInsps.reduce((s, i) => s + i.score_pct, 0) / monthInsps.length) : 0;
    const alerts = monthInsps.filter(i => i.alert_level === "critical").length;
    return { name: m.label, Score: avg, Alertas: alerts };
  });
}

export function getClientRisk(inspections, locations) {
  return locations.map(loc => {
    const locInsps = inspections.filter(i => i.location_id === loc.id && i.score_pct !== null).sort((a,b) => new Date(b.date) - new Date(a.date));
    const avg = locInsps.length ? Math.round(locInsps.reduce((s,i) => s + i.score_pct, 0) / locInsps.length) : null;
    let churnRisk = false;
    if (locInsps.length >= 3) {
      if (locInsps[0].score_pct < locInsps[1].score_pct && locInsps[1].score_pct < locInsps[2].score_pct) churnRisk = true;
    }
    const belowSla = avg !== null && avg < SLA_TARGET;
    return { ...loc, avg, count: locInsps.length, churnRisk, belowSla, lastScore: locInsps[0]?.score_pct };
  }).filter(l => l.avg !== null && (l.belowSla || l.churnRisk));
}

export function getTopBottomPerformers(inspections, locations) {
  const stats = locations.map(loc => {
    const li = inspections.filter(i => i.location_id === loc.id && i.score_pct !== null);
    const avg = li.length ? Math.round(li.reduce((s,i) => s+i.score_pct, 0) / li.length) : 0;
    return { name: loc.name, avg };
  }).filter(l => l.avg > 0);
  return { top: [...stats].sort((a,b) => b.avg - a.avg).slice(0, 3), bottom: [...stats].sort((a,b) => a.avg - b.avg).slice(0, 3) };
}
