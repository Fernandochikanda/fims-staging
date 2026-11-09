// tests/inspectionStates.test.mjs
// ============================================================================
// Testes unitários do módulo de estados de inspecção FIMS (W1+W2).
// Cobre: matriz de transições, guards de role/ownership, self-review block,
// delete protection, reopen paths.
// Executar: npm test  (ou: node --test tests/inspectionStates.test.mjs)
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSPECTION_STATUS,
  STATE_LABELS,
  canTransition,
  validateTransition,
  canDelete,
  labelOf,
  isValidStatus,
  getAllowedNextStatuses,
} from '../src/lib/inspectionStates.js';

// ─── Fixtures ───────────────────────────────────────────────────
const ADMIN = { id: 'usr_1', role: 'admin' };
const CEO   = { id: 'usr_2', role: 'ceo' };
const SUP   = { id: 'usr_3', role: 'supervisor' };
const INSP  = { id: 'usr_4', role: 'inspector' };
const OTHER = { id: 'usr_5', role: 'inspector' };

const mk = (status, inspectorId = 'usr_4') => ({
  id: 'insp_1', status, inspector_id: inspectorId, location_name: 'Test Site',
});

// ─── Enum & labels ──────────────────────────────────────────────

test('INSPECTION_STATUS: 11 statuses defined', () => {
  const statuses = Object.values(INSPECTION_STATUS);
  assert.equal(statuses.length, 11);
  assert.ok(statuses.includes('pending'));
  assert.ok(statuses.includes('submitted'));
  assert.ok(statuses.includes('reviewed'));
});

test('STATE_LABELS: every status has a label', () => {
  for (const s of Object.values(INSPECTION_STATUS)) {
    assert.ok(STATE_LABELS[s], `missing label for ${s}`);
    assert.ok(STATE_LABELS[s].label, `missing label text for ${s}`);
    assert.ok(STATE_LABELS[s].cls, `missing CSS class for ${s}`);
  }
});

test('isValidStatus: recognizes known statuses', () => {
  assert.ok(isValidStatus('pending'));
  assert.ok(isValidStatus('submitted'));
  assert.ok(!isValidStatus('unknown'));
  assert.ok(!isValidStatus(null));
});

test('labelOf: returns human-readable label', () => {
  assert.equal(labelOf('pending'), 'Pendente');
  assert.equal(labelOf('submitted'), 'Submetida');
  assert.equal(labelOf('unknown_status'), 'unknown_status');
});

// ─── canTransition (raw matrix) ─────────────────────────────────

test('canTransition: same status is always allowed (no-op)', () => {
  assert.ok(canTransition('pending', 'pending'));
  assert.ok(canTransition('submitted', 'submitted'));
});

test('canTransition: legal transitions', () => {
  assert.ok(canTransition('pending', 'in_progress'));
  assert.ok(canTransition('in_progress', 'submitted'));
  assert.ok(canTransition('submitted', 'reviewed'));
  assert.ok(canTransition('submitted', 'needs_correcoes' === 'needs_corrections' ? 'needs_corrections' : 'reviewed'));
});

test('canTransition: illegal transitions blocked', () => {
  assert.ok(!canTransition('pending', 'reviewed'));
  assert.ok(!canTransition('submitted', 'in_progress'));
  assert.ok(!canTransition('reviewed', 'in_progress'));
  assert.ok(!canTransition('deleted', 'pending'));
});

test('canTransition: admin-only delete targets exist in matrix', () => {
  // submitted/reviewed/closed can transition to deleted (role check enforces admin)
  assert.ok(canTransition('submitted', 'deleted'));
  assert.ok(canTransition('reviewed', 'deleted'));
  assert.ok(canTransition('closed', 'deleted'));
});

test('canTransition: closed reopen path exists', () => {
  assert.ok(canTransition('closed', 'reviewed'));
  assert.ok(canTransition('closed', 'needs_corrections'));
});

// ─── validateTransition: submit guard (Critical Fix) ────────────

test('submit: inspector can submit own in_progress', () => {
  const r = validateTransition(mk('in_progress'), 'submitted', INSP);
  assert.ok(r.ok, `expected ok, got: ${JSON.stringify(r)}`);
});

test('submit: cannot submit from pending (not started)', () => {
  const r = validateTransition(mk('pending'), 'submitted', INSP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'ILLEGAL_TRANSITION');
});

test('submit: other inspector cannot submit', () => {
  const r = validateTransition(mk('in_progress'), 'submitted', OTHER);
  assert.ok(!r.ok);
  assert.equal(r.code, 'NOT_ASSIGNED');
});

test('submit: supervisor override allowed', () => {
  const r = validateTransition(mk('in_progress'), 'submitted', SUP);
  assert.ok(r.ok);
});

// ─── validateTransition: self-review block ──────────────────────

test('review: self-review blocked', () => {
  const r = validateTransition(mk('submitted', 'usr_3'), 'reviewed', SUP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'SELF_REVIEW');
});

test('review: supervisor can review others', () => {
  const r = validateTransition(mk('submitted', 'usr_4'), 'reviewed', SUP);
  assert.ok(r.ok);
});

test('review: inspector cannot approve', () => {
  const r = validateTransition(mk('submitted'), 'reviewed', INSP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'NOT_AUTHORIZED');
});

test('review: cannot approve non-submitted inspection', () => {
  const r = validateTransition(mk('in_progress'), 'reviewed', SUP);
  assert.ok(!r.ok);
});

// ─── validateTransition: needs_corrections ─────────────────────

test('needs_corrections: supervisor can return submitted', () => {
  const r = validateTransition(mk('submitted'), 'needs_corrections', SUP);
  assert.ok(r.ok);
});

test('needs_corrections: supervisor can reopen reviewed', () => {
  const r = validateTransition(mk('reviewed'), 'needs_corrections', SUP);
  assert.ok(r.ok);
});

test('needs_corrections: inspector cannot return', () => {
  const r = validateTransition(mk('submitted'), 'needs_corrections', INSP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'NOT_AUTHORIZED');
});

// ─── validateTransition: accept/decline ────────────────────────

test('accept: assigned inspector can accept', () => {
  const r = validateTransition(mk('pending_acceptance'), 'pending', INSP);
  assert.ok(r.ok);
});

test('accept: other inspector cannot accept', () => {
  const r = validateTransition(mk('pending_acceptance'), 'pending', OTHER);
  assert.ok(!r.ok);
  assert.equal(r.code, 'NOT_ASSIGNED');
});

test('decline: assigned inspector can decline', () => {
  const r = validateTransition(mk('pending_acceptance'), 'rejected', INSP);
  assert.ok(r.ok);
});

test('accept: cannot accept from non-pending_acceptance state', () => {
  const r = validateTransition(mk('submitted'), 'pending', INSP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'ILLEGAL_TRANSITION');
});

// ─── validateTransition: start guard ───────────────────────────

test('start: can start from pending', () => {
  assert.ok(validateTransition(mk('pending'), 'in_progress', INSP).ok);
});

test('start: can start from needs_corrections', () => {
  assert.ok(validateTransition(mk('needs_corrections'), 'in_progress', INSP).ok);
});

test('start: cannot start from submitted', () => {
  assert.ok(!validateTransition(mk('submitted'), 'in_progress', INSP).ok);
});

test('start: cannot start from reviewed', () => {
  assert.ok(!validateTransition(mk('reviewed'), 'in_progress', INSP).ok);
});

test('start: cannot start from closed', () => {
  assert.ok(!validateTransition(mk('closed'), 'in_progress', INSP).ok);
});

// ─── validateTransition: delete guards ─────────────────────────

test('delete: admin can delete submitted', () => {
  assert.ok(validateTransition(mk('submitted'), 'deleted', ADMIN).ok);
});

test('delete: admin can delete reviewed', () => {
  assert.ok(validateTransition(mk('reviewed'), 'deleted', ADMIN).ok);
});

test('delete: admin can delete closed', () => {
  assert.ok(validateTransition(mk('closed'), 'deleted', ADMIN).ok);
});

test('delete: inspector cannot delete submitted', () => {
  const r = validateTransition(mk('submitted'), 'deleted', INSP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'PROTECTED');
});

test('delete: supervisor cannot delete submitted', () => {
  const r = validateTransition(mk('submitted'), 'deleted', SUP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'PROTECTED');
});

test('delete: inspector can delete own pending', () => {
  assert.ok(validateTransition(mk('pending'), 'deleted', INSP).ok);
});

test('delete: inspector can delete own in_progress', () => {
  assert.ok(validateTransition(mk('in_progress'), 'deleted', INSP).ok);
});

test('delete: other inspector cannot delete your pending', () => {
  const r = validateTransition(mk('pending', 'usr_4'), 'deleted', OTHER);
  assert.ok(!r.ok);
  assert.equal(r.code, 'NOT_OWNED');
});

test('canDelete: convenience wrapper matches validateTransition', () => {
  assert.equal(canDelete(mk('submitted'), ADMIN).ok, true);
  assert.equal(canDelete(mk('submitted'), INSP).ok, false);
  assert.equal(canDelete(mk('pending'), INSP).ok, true);
});

// ─── validateTransition: closed reopen ─────────────────────────

test('reopen: admin can reopen closed → reviewed', () => {
  assert.ok(validateTransition(mk('closed'), 'reviewed', ADMIN).ok);
});

test('reopen: admin can reopen closed → needs_corrections', () => {
  assert.ok(validateTransition(mk('closed'), 'needs_corrections', ADMIN).ok);
});

test('reopen: supervisor can reopen closed → needs_corrections', () => {
  assert.ok(validateTransition(mk('closed'), 'needs_corrections', SUP).ok);
});

test('reopen: inspector cannot reopen closed', () => {
  assert.ok(!validateTransition(mk('closed'), 'needs_corrections', INSP).ok);
});

// ─── validateTransition: edge cases ────────────────────────────

test('edge: null inspection', () => {
  const r = validateTransition(null, 'submitted', INSP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'NO_TARGET');
});

test('edge: null currentUser', () => {
  const r = validateTransition(mk('in_progress'), 'submitted', null);
  assert.ok(!r.ok);
  assert.equal(r.code, 'NO_USER');
});

test('edge: invalid target status', () => {
  const r = validateTransition(mk('in_progress'), 'unknown_status', INSP);
  assert.ok(!r.ok);
  assert.equal(r.code, 'INVALID_STATUS');
});

// ─── getAllowedNextStatuses ─────────────────────────────────────

test('getAllowedNextStatuses: inspector sees start for pending', () => {
  const allowed = getAllowedNextStatuses(mk('pending'), INSP);
  assert.ok(allowed.includes('in_progress'));
  assert.ok(allowed.includes('deleted'));
  assert.ok(!allowed.includes('reviewed'));
});

test('getAllowedNextStatuses: supervisor sees approve for submitted', () => {
  const allowed = getAllowedNextStatuses(mk('submitted', 'usr_4'), SUP);
  assert.ok(allowed.includes('reviewed'));
  assert.ok(allowed.includes('needs_corrections'));
});

test('getAllowedNextStatuses: empty for null input', () => {
  assert.deepEqual(getAllowedNextStatuses(null, INSP), []);
  assert.deepEqual(getAllowedNextStatuses(mk('pending'), null), []);
});
