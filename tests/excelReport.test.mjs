// tests/excelReport.test.mjs
// ============================================================================
// Testes do gerador de relatórios Excel (design profissional).
// Valida: estrutura das folhas, regras de negócio (defeito = score < 3,
// concluída = submitted|reviewed), percentagens e round-trip do ficheiro.
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { buildStats, parseYMD, buildMonthlyWorkbook, buildDailyWorkbook } from "../src/lib/excelReport.js";

const SECTIONS = [
  { id: "sec1", title: "Cozinha" },
  { id: "sec2", title: "Escritórios" },
  { id: "sec3", title: "WCs" },
];

function insp(overrides = {}) {
  return {
    id: "i_" + Math.random().toString(36).slice(2, 7),
    date: "2026-10-05",
    location_id: 1,
    location_name: "Hotel Serene",
    status: "submitted",
    score_pct: 80,
    alert_level: "ok",
    inspector_name: "Hélder Maluane",
    client_mgr_name: "Dr. Silva",
    sections: SECTIONS,
    items: [
      { id: "a1", section_id: "sec1", label: "Chão", score: 2, comment: "Mancha de óleo" },
      { id: "a2", section_id: "sec1", label: "Bancadas", score: 5, comment: null },
      { id: "a3", section_id: "sec2", label: "Mesas", score: 4, comment: null },
      { id: "a4", section_id: "sec3", label: "Sanitas", score: 3, comment: "Falta sabonete" },
    ],
    ...overrides,
  };
}

const nameOf = () => "Área";

test("buildStats: defeito = score < 3 (regra do defectLogic)", () => {
  const st = buildStats([insp()], nameOf);
  assert.equal(st.defectCount, 1); // apenas o item com score 2
  assert.equal(st.itemsAll.length, 4);
  assert.equal(st.itemsScored.length, 4);
});

test("buildStats: concluídas = submitted + reviewed", () => {
  const st = buildStats([
    insp({ status: "submitted" }),
    insp({ status: "reviewed" }),
    insp({ status: "in_progress", score_pct: 70 }),
  ], nameOf);
  assert.equal(st.completed, 2);
  assert.equal(st.total, 3);
});

test("buildStats: score médio e nível crítico (score < 60%)", () => {
  const st = buildStats([insp({ score_pct: 55, alert_level: "critical" }), insp({ score_pct: 85 })], nameOf);
  assert.equal(st.avgScore, 70);
  assert.equal(st.critical, 1);
});

test("buildStats: agregação por dia e por área com nome resolvido", () => {
  const st = buildStats([
    insp({ date: "2026-10-05" }),
    insp({ date: "2026-10-05" }),
    insp({ date: "2026-10-06" }),
  ], (i, sid) => SECTIONS.find(s => s.id === sid)?.title || "Área");
  assert.equal(st.byDay.length, 2);
  assert.equal(st.byDay[0].count, 2);
  const cozinha = st.sections.find(s => s.name === "Cozinha");
  assert.ok(cozinha, "área Cozinha presente");
  assert.equal(cozinha.defects, 3); // 3 inspecções × 1 defeito (item score 2)
});

test("parseYMD: data local sem desvio de fuso", () => {
  const d = parseYMD("2026-10-27");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 27);
  assert.equal(parseYMD("bogus"), null);
});

test("Livro MENSAL: 2 folhas, título institucional, detalhe com filtros", async () => {
  const inspections = [
    insp({ date: "2026-10-03", score_pct: 92, alert_level: "ok" }),
    insp({ date: "2026-10-12", score_pct: 48, alert_level: "critical", status: "reviewed" }),
    insp({ date: "2026-10-20", score_pct: 74, alert_level: "warning" }),
  ];
  const wb = await buildMonthlyWorkbook({
    client: { name: "Hotel Serene", address: "Av. de Moçambique, Maputo" },
    inspections, dateStr: "2026-10",
    logo: null,
    now: new Date(2026, 9, 28, 10, 30),
  });
  assert.deepEqual(wb.worksheets.map(w => w.name), ["Resumo Mensal", "Inspecções"]);

  const resumo = wb.getWorksheet("Resumo Mensal");
  const texts = [];
  resumo.eachRow(row => row.eachCell(cell => { if (typeof cell.value === "string") texts.push(cell.value); }));
  assert.ok(texts.some(t => t.includes("RELATÓRIO MENSAL DE INSPECÇÕES")));
  assert.ok(texts.some(t => t.includes("Hotel Serene")));
  assert.ok(texts.some(t => t.includes("outubro de 2026")));
  assert.ok(texts.some(t => t.includes("RESUMO EXECUTIVO")));

  const det = wb.getWorksheet("Inspecções");
  // 1 linha de título + 1 header + 3 inspecções
  assert.equal(det.rowCount, 2 + 3);
  assert.ok(det.autoFilter, "autofiltro activo na folha de detalhe");
  // cabeçalhos preservados (§5.6 — nenhuma coluna eliminada)
  const headerCells = [];
  det.getRow(2).eachCell(cell => headerCells.push(String(cell.value)));
  ["Data", "Localização", "Cliente", "Inspector", "Estado", "Score (%)", "Itens", "Defeitos", "Observações"]
    .forEach(h => assert.ok(headerCells.includes(h), `cabeçalho ${h} presente`));

  // round-trip: writeBuffer → load
  const ExcelJS = (await import("exceljs")).default;
  const buf = await wb.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 4000, "ficheiro com conteúdo substancial");
  const wb2 = await new ExcelJS.Workbook().xlsx.load(buf);
  assert.deepEqual(wb2.worksheets.map(w => w.name), ["Resumo Mensal", "Inspecções"]);
});

test("Livro DIÁRIO: folha única, data exacta, críticos com severidade", async () => {
  const inspections = [
    insp({ date: "2026-10-27", score_pct: 62, alert_level: "warning" }),
    insp({ date: "2026-10-27", score_pct: 44, alert_level: "critical" }),
  ];
  const wb = await buildDailyWorkbook({
    client: { name: "Grupo Nutchi — Matola", address: "Matola" },
    inspections, dateStr: "2026-10-27",
    logo: null,
    now: new Date(2026, 9, 27, 17, 5),
  });
  assert.deepEqual(wb.worksheets.map(w => w.name), ["Relatório Diário"]);
  const ws = wb.getWorksheet("Relatório Diário");
  const texts = [];
  ws.eachRow(row => row.eachCell(cell => {
    if (typeof cell.value === "string") texts.push(cell.value);
  }));
  assert.ok(texts.some(t => t.includes("RELATÓRIO DIÁRIO DE INSPECÇÕES")));
  assert.ok(texts.some(t => t.includes("27/10/2026")), "data de referência exacta");
  assert.ok(texts.some(t => t.includes("RESULTADOS CRÍTICOS")));
  assert.ok(texts.some(t => t.includes("Crítica") || t.includes("Alta")), "severidades presentes");
  assert.ok(texts.some(t => t.includes("nível crítico (score < 60%)")), "alerta de nível crítico");

  const ExcelJS = (await import("exceljs")).default;
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = await new ExcelJS.Workbook().xlsx.load(buf);
  assert.equal(wb2.getWorksheet("Relatório Diário").rowCount > 10, true);
});
