// src/lib/defectLogic.js
// ============================================================================
// NÚCLEO PURO da lógica de defeitos FIMS — sem dependências (testável com
// node:test; ver tests/defectLogic.test.mjs).
// Extraído do defectService durante a remediação (audit DEF-001/DEF-002/ESC-004)
// para permitir testes unitários reais da idempotência e do cálculo de prazos.
// ============================================================================

/** Identidade estável do defeito (DEF-002): id do template > label mutável */
export function defectKey(locationId, sectionId, item) {
  const label = String((item && (item.label || item.text)) || '').trim().toLowerCase();
  const itemId = item && item.id != null && String(item.id).trim() !== ''
    ? String(item.id).trim().toLowerCase() : null;
  const tail = itemId ? 'iid:' + itemId : 'lbl:' + label;
  return String(locationId) + '::' + String(sectionId) + '::' + tail;
}

/** Prazo 48h em UTC (ESC-004): data da inspeção normalizada para ISO UTC */
export function computeDueAt(fromIso) {
  const base = fromIso ? new Date(fromIso) : new Date();
  const t = isNaN(base.getTime()) ? Date.now() : base.getTime();
  return new Date(t + 48 * 3600 * 1000).toISOString();
}

export function sectionNameOf(inspection, sectionId) {
  const s = (inspection.sections || []).find(x => String(x.id) === String(sectionId));
  return s ? (s.title || s.name || 'Seção') : 'Seção';
}

export function genId() {
  return 'def_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------------------------------------------------------------------------
// NÚCLEO PURO E IDEMPOTENTE
// ---------------------------------------------------------------------------
/**
 * Aplica uma inspeção ao estado de defeitos. NÃO muta `defects`.
 * Regras de idempotência (DEF-001):
 *  - recorrência: só incrementa se last_seen_inspection_id !== inspeção atual
 *  - criação: só cria se não existir defeito aberto da MESMA key aberto POR
 *    ESTA inspeção (opened_inspection_id === inspId)
 *  - resolução: naturalmente idempotente (só atua sobre status 'open')
 * Devolve { newDefects, recurringDefects, resolvedDefects, all, touched }
 */
export function computeDefectChanges(defects, inspection, opts = {}) {
  const now = opts.now || Date.now();
  const locId = inspection.location_id;
  const items = inspection.items || [];
  const inspDate = inspection.date || new Date().toISOString();
  const inspId = inspection.id;

  const all = (defects || []).map(d => ({ ...d }));
  const changes = { newDefects: [], recurringDefects: [], resolvedDefects: [], all, touched: [] };

  for (const item of items) {
    if (item.score === null || item.score === undefined) continue;

    const key = defectKey(locId, item.section_id, item);
    const label = String(item.label || item.text || '').trim().toLowerCase();

    // match: chave nova; fallback legado por label (mesmo local + secção)
    let existingOpen = all.find(d => d.key === key && d.status === 'open');
    if (!existingOpen && label) {
      existingOpen = all.find(d =>
        d.status === 'open' &&
        String(d.location_id) === String(locId) &&
        String(d.section_id) === String(item.section_id) &&
        String(d.item_label || '').trim().toLowerCase() === label);
    }

    if (item.score < 3) {
      if (existingOpen) {
        // IDEMPOTÊNCIA: esta inspeção já registou este defeito aberto
        if (existingOpen.last_seen_inspection_id === inspId) continue;

        existingOpen.recurrence_count = (existingOpen.recurrence_count || 1) + 1;
        existingOpen.last_seen_at = inspDate;
        existingOpen.last_seen_inspection_id = inspId;
        existingOpen.last_score = item.score;
        existingOpen.item_label = existingOpen.item_label || item.label || item.text;
        // Recorrência após prazo → elegível para re-escalação (servidor decide)
        if (existingOpen.due_at && new Date(existingOpen.due_at).getTime() < now) {
          existingOpen.escalated = false;
        }
        changes.recurringDefects.push({ ...existingOpen });
        changes.touched.push(existingOpen);
      } else {
        const d = {
          id: genId(),
          key,
          location_id: locId,
          location_name: inspection.location_name,
          section_id: item.section_id,
          section_name: sectionNameOf(inspection, item.section_id),
          item_label: item.label || item.text,
          score: item.score,
          opened_at: inspDate,
          opened_inspection_id: inspId,
          due_at: computeDueAt(inspDate),
          status: 'open',
          recurrence_count: 1,
          last_seen_at: inspDate,
          last_seen_inspection_id: inspId,
          last_score: item.score,
          escalated: false,
          escalated_at: null,
          escalation_count: 0,
          last_escalated_at: null,
          resolved_at: null,
          resolved_inspection_id: null,
        };
        all.push(d);
        changes.newDefects.push({ ...d });
        changes.touched.push(d);
      }
    } else {
      if (existingOpen) {
        existingOpen.status = 'resolved';
        existingOpen.resolved_at = inspDate;
        existingOpen.resolved_inspection_id = inspId;
        existingOpen.escalated = false;
        changes.resolvedDefects.push({ ...existingOpen });
        changes.touched.push(existingOpen);
      }
    }
  }

  return changes;
}
