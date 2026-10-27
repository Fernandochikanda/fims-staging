// tests/defectLogic.test.mjs
// ============================================================================
// Testes unitários do núcleo puro de defeitos FIMS (remediação 2026-10-27).
// Cobre: DEF-001 (idempotência), DEF-002 (identidade estável), ESC-004
// (prazo 48h UTC), recorrência e resolução.
// Executar: npm test
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDefectChanges, defectKey, computeDueAt } from '../src/lib/defectLogic.js';

const LOC = 'loc-1';
const SECTION = 'pl';

function mkInspection({ id, items, date, sections }) {
  return {
    id: id || 'insp_' + Math.random().toString(36).slice(2, 8),
    location_id: LOC,
    location_name: 'Baker Hughes',
    date: date || '2026-10-20T10:00:00.000Z',
    sections: sections || [{ id: SECTION, title: 'Limpezas' }],
    items: items || [],
  };
}

const badItem = (id, label, score = 2) => ({ id, section_id: SECTION, label, text: label, score });
const goodItem = (id, label, score = 5) => ({ id, section_id: SECTION, label, text: label, score });

test('DEF-002: identidade usa o id estável do item, não o texto mutável', () => {
  const k1 = defectKey(LOC, SECTION, { id: 'pl_1', label: 'Uniformes' });
  const k2 = defectKey(LOC, SECTION, { id: 'pl_1', label: 'Uniformes limpos e engomados (renomeado)' });
  assert.equal(k1, k2, 'renomear o label NÃO pode mudar a identidade do defeito');
  assert.match(k1, /iid:pl_1$/, 'chave deve derivar do id do template');
});

test('DEF-002: itens sem id mantêm fallback por label', () => {
  const k = defectKey(LOC, SECTION, { label: 'Xyz' });
  assert.match(k, /lbl:xyz$/);
});

test('ESC-004: prazo = data da inspeção + 48h, em ISO UTC', () => {
  const due = computeDueAt('2026-10-20T10:00:00.000Z');
  assert.equal(due, '2026-10-22T10:00:00.000Z');
  assert.match(due, /\.000Z$/, 'deve terminar em ISO UTC');
});

test('ESC-004: data inválida não gera NaN', () => {
  const due = computeDueAt('data-invalida');
  assert.equal(isNaN(new Date(due).getTime()), false);
});

test('DEF-001: 1ª submissão com score<3 abre defeito com SLA 48h', () => {
  const insp = mkInspection({ items: [badItem('pl_1', 'Uniformes')] });
  const ch = computeDefectChanges([], insp);
  assert.equal(ch.newDefects.length, 1);
  assert.equal(ch.all[0].status, 'open');
  assert.equal(ch.all[0].recurrence_count, 1);
  assert.equal(ch.all[0].due_at, '2026-10-22T10:00:00.000Z');
});

test('DEF-001: reprocessar a MESMA inspeção não duplica nem infla recorrência', () => {
  const insp = mkInspection({ items: [badItem('pl_1', 'Uniformes')] });
  const first = computeDefectChanges([], insp);
  const second = computeDefectChanges(first.all, insp);
  assert.equal(second.newDefects.length, 0, 'nenhum novo defeito na 2ª passagem');
  assert.equal(second.recurringDefects.length, 0, 'nenhuma recorrência na 2ª passagem');
  assert.equal(second.touched.length, 0, 'nada a persistir na 2ª passagem');
  assert.equal(second.all[0].recurrence_count, 1, 'recorrência permanece 1');
  assert.equal(second.all.length, 1, 'apenas 1 defeito');
});

test('DEF-001: 3 execuções concorrentes em memória produzem 1 defeito', () => {
  const insp = mkInspection({ items: [badItem('pl_1', 'Uniformes')] });
  let state = [];
  for (let i = 0; i < 3; i++) {
    state = computeDefectChanges(state, insp).all;
  }
  assert.equal(state.length, 1);
  assert.equal(state[0].recurrence_count, 1);
});

test('DEF-001: inspeção DIFERENTE no mesmo item = recorrência legítima', () => {
  const i1 = mkInspection({ id: 'insp_A', items: [badItem('pl_1', 'Uniformes')] });
  const i2 = mkInspection({ id: 'insp_B', items: [badItem('pl_1', 'Uniformes')] });
  const first = computeDefectChanges([], i1);
  const second = computeDefectChanges(first.all, i2);
  assert.equal(second.recurringDefects.length, 1);
  assert.equal(second.all[0].recurrence_count, 2);
  assert.equal(second.all[0].last_seen_inspection_id, 'insp_B');
});

test('resolução: score>=3 numa inspeção posterior fecha o defeito', () => {
  const i1 = mkInspection({ id: 'insp_A', items: [badItem('pl_1', 'Uniformes')] });
  const i2 = mkInspection({ id: 'insp_B', items: [goodItem('pl_1', 'Uniformes')] });
  const first = computeDefectChanges([], i1);
  const second = computeDefectChanges(first.all, i2);
  assert.equal(second.resolvedDefects.length, 1);
  assert.equal(second.all[0].status, 'resolved');
  // reprocessar a resolução: nada muda
  const third = computeDefectChanges(second.all, i2);
  assert.equal(third.resolvedDefects.length, 0);
  assert.equal(third.touched.length, 0);
});

test('re-escalação: recorrência após o prazo volta a tornar o defeito elegível', () => {
  const past = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const existing = [{
    id: 'def_1',
    key: defectKey(LOC, SECTION, { id: 'pl_1', label: 'Uniformes' }),
    location_id: LOC, section_id: SECTION, item_label: 'Uniformes',
    opened_at: past, due_at: past, status: 'open', recurrence_count: 1,
    last_seen_inspection_id: 'insp_OLD', escalated: true, escalation_count: 1,
    last_escalated_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
  }];
  const ch = computeDefectChanges(existing, mkInspection({ id: 'insp_NEW', items: [badItem('pl_1', 'Uniformes')] }));
  assert.equal(ch.recurringDefects.length, 1);
  assert.equal(ch.all[0].escalated, false, 'deve rearmar a elegibilidade (servidor decide)');
  assert.equal(ch.all[0].escalation_count, 1, 'o cliente NÃO incrementa escalation_count');
});

test('matching legado: defeito antigo (chave lbl:) é encontrado por label', () => {
  const legacy = [{
    id: 'def_legacy',
    key: 'loc-1::pl::uniformes', // formato antigo (label puro)
    location_id: LOC, section_id: SECTION, item_label: 'Uniformes',
    status: 'open', recurrence_count: 4, last_seen_inspection_id: 'insp_OLD',
    due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  }];
  const ch = computeDefectChanges(legacy, mkInspection({ id: 'insp_NEW', items: [badItem('pl_1', 'Uniformes')] }));
  assert.equal(ch.newDefects.length, 0, 'não cria duplicado do defeito legado');
  assert.equal(ch.recurringDefects.length, 1, 'incrementa o defeito legado');
  assert.equal(ch.all[0].recurrence_count, 5);
});

test('itens sem score são ignorados', () => {
  const ch = computeDefectChanges([], mkInspection({ items: [{ id: 'pl_1', section_id: SECTION, label: 'A', score: null }] }));
  assert.equal(ch.touched.length, 0);
  assert.equal(ch.all.length, 0);
});

test('labels mutáveis não fragmentam a identidade quando o item tem id', () => {
  const i1 = mkInspection({ id: 'insp_A', items: [badItem('pl_1', 'Nome antigo do item')] });
  const i2 = mkInspection({ id: 'insp_B', items: [badItem('pl_1', 'Nome NOVO do item (renomeado no template)')] });
  const first = computeDefectChanges([], i1);
  const second = computeDefectChanges(first.all, i2);
  assert.equal(second.newDefects.length, 0, 'renomear o item NÃO pode criar novo defeito');
  assert.equal(second.recurringDefects.length, 1);
  assert.equal(second.all[0].recurrence_count, 2);
  assert.equal(second.all[0].item_label, 'Nome antigo do item', 'label original preservado');
});
