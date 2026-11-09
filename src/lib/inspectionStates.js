// /src/lib/inspectionStates.js
// SINGLE SOURCE OF TRUTH for inspection statuses, transitions, and guards.
// Replaces scattered string literals across App.jsx, InspectionForm.jsx,
// InspectionDetail.jsx, helpers.js, StatusBadge.jsx.
//
// Import from here — never hardcode status strings elsewhere.

import { ROLES } from "../data/constants.js";

// ─── STATUS ENUM ───────────────────────────────────────────────
export const INSPECTION_STATUS = Object.freeze({
  UNASSIGNED:         "unassigned",
  PENDING_ACCEPTANCE: "pending_acceptance",
  PENDING:            "pending",
  IN_PROGRESS:        "in_progress",
  SUBMITTED:          "submitted",
  NEEDS_CORRECTIONS:  "needs_corrections",
  REVIEWED:           "reviewed",
  REJECTED:           "rejected",    // task assignment declined
  CLOSED:             "closed",
  DELETED:            "deleted",
  LEAVE:              "leave",       // pseudo-status for leave requests (type: 'leave')
});

// ─── STATE LABELS (consolidated from StatusBadge.jsx) ──────────
// label  = human-readable text (PT)
// cls    = CSS badge class (must match App.css badge-* classes)
// color  = hex color for inline use (charts, chips, etc.)
export const STATE_LABELS = Object.freeze({
  [INSPECTION_STATUS.UNASSIGNED]:         { label: "Por Atribuir",         cls: "badge-pending",    color: "#6B7280" },
  [INSPECTION_STATUS.PENDING_ACCEPTANCE]: { label: "Aguarda Aceitação",    cls: "badge-pending",    color: "#BA7517" },
  [INSPECTION_STATUS.PENDING]:            { label: "Pendente",             cls: "badge-pending",    color: "#BA7517" },
  [INSPECTION_STATUS.IN_PROGRESS]:        { label: "Em Progresso",         cls: "badge-progress",   color: "#378ADD" },
  [INSPECTION_STATUS.SUBMITTED]:          { label: "Submetida",            cls: "badge-submitted",  color: "#534AB7" },
  [INSPECTION_STATUS.NEEDS_CORRECTIONS]:  { label: "Rejeitada (Corrigir)", cls: "badge-critical",   color: "#EF9F27" },
  [INSPECTION_STATUS.REVIEWED]:           { label: "Aprovada",             cls: "badge-reviewed",   color: "#0F6E56" },
  [INSPECTION_STATUS.REJECTED]:           { label: "Recusada",             cls: "badge-critical",   color: "#A32D2D" },
  [INSPECTION_STATUS.CLOSED]:             { label: "Fechada",              cls: "badge-closed",     color: "#888888" },
  [INSPECTION_STATUS.DELETED]:            { label: "Eliminada",            cls: "badge-closed",     color: "#888888" },
  [INSPECTION_STATUS.LEAVE]:              { label: "Folga",                cls: "badge-warning",    color: "#EF9F27" },
});

// ─── TRANSITION MATRIX ─────────────────────────────────────────
// Defines which status can transition to which.
// Key = current status, value = array of allowed next statuses.
// This is the RAW matrix — role/ownership rules are applied on top.
const TRANSITIONS = Object.freeze({
  [INSPECTION_STATUS.UNASSIGNED]: [
    INSPECTION_STATUS.PENDING_ACCEPTANCE, // inspector assigned
    INSPECTION_STATUS.DELETED,            // cancel before assignment
  ],
  [INSPECTION_STATUS.PENDING_ACCEPTANCE]: [
    INSPECTION_STATUS.PENDING,            // inspector accepts
    INSPECTION_STATUS.REJECTED,           // inspector declines
    INSPECTION_STATUS.UNASSIGNED,         // reassign
    INSPECTION_STATUS.DELETED,            // cancel
  ],
  [INSPECTION_STATUS.PENDING]: [
    INSPECTION_STATUS.IN_PROGRESS,        // inspector starts
    INSPECTION_STATUS.PENDING_ACCEPTANCE, // un-accept (rare)
    INSPECTION_STATUS.DELETED,            // cancel
  ],
  [INSPECTION_STATUS.IN_PROGRESS]: [
    INSPECTION_STATUS.SUBMITTED,          // inspector submits
    INSPECTION_STATUS.PENDING,            // pause / cancel start
    INSPECTION_STATUS.DELETED,            // discard draft (with guard)
  ],
  [INSPECTION_STATUS.SUBMITTED]: [
    INSPECTION_STATUS.REVIEWED,           // supervisor approves
    INSPECTION_STATUS.NEEDS_CORRECTIONS,  // supervisor rejects for correction
    INSPECTION_STATUS.DELETED,            // admin-only delete (role check enforces)
  ],
  [INSPECTION_STATUS.NEEDS_CORRECTIONS]: [
    INSPECTION_STATUS.IN_PROGRESS,        // inspector resumes to fix
    INSPECTION_STATUS.SUBMITTED,          // inspector resubmits
  ],
  [INSPECTION_STATUS.REVIEWED]: [
    INSPECTION_STATUS.CLOSED,             // archive
    INSPECTION_STATUS.NEEDS_CORRECTIONS,  // reopen with reason (supervisor/admin only)
    INSPECTION_STATUS.DELETED,            // admin-only delete (role check enforces)
  ],
  [INSPECTION_STATUS.REJECTED]: [
    INSPECTION_STATUS.UNASSIGNED,         // reassign to different inspector
    INSPECTION_STATUS.PENDING_ACCEPTANCE, // reassign directly
    INSPECTION_STATUS.DELETED,            // cancel
  ],
  [INSPECTION_STATUS.CLOSED]: [
    INSPECTION_STATUS.REVIEWED,           // reopen (admin only)
    INSPECTION_STATUS.NEEDS_CORRECTIONS,  // reopen for corrections (admin only)
    INSPECTION_STATUS.DELETED,            // admin-only delete (role check enforces)
  ],
  [INSPECTION_STATUS.DELETED]: [],        // terminal
  [INSPECTION_STATUS.LEAVE]: [
    INSPECTION_STATUS.DELETED,            // leave request cancelled
  ],
});

// ─── TRANSITION VALIDATION ─────────────────────────────────────

/**
 * Check if a raw status transition is allowed by the matrix (no role checks).
 * A no-op transition (same status) is always allowed.
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
export function canTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return true;
  const allowed = TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

/**
 * Full transition validation: matrix + role/ownership rules.
 *
 * @param {object}  inspection  - the current inspection (must have .id, .status, .inspector_id)
 * @param {string}  newStatus   - the desired next status
 * @param {object}  currentUser - { id, role } — the user attempting the action
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validateTransition(inspection, newStatus, currentUser) {
  if (!inspection || !inspection.id) {
    return { ok: false, code: "NO_TARGET", message: "Inspeção inválida." };
  }
  if (!currentUser) {
    return { ok: false, code: "NO_USER", message: "Sessão expirada. Faça login novamente." };
  }
  if (!isValidStatus(newStatus)) {
    return { ok: false, code: "INVALID_STATUS", message: `Estado desconhecido: "${newStatus}".` };
  }

  const currentStatus = inspection.status || INSPECTION_STATUS.PENDING;
  const role = currentUser.role;
  const isAssignedInspector = String(currentUser.id) === String(inspection.inspector_id);
  const isSupervisorOrAbove = [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR].includes(role);

  // 1. Matrix check
  if (!canTransition(currentStatus, newStatus)) {
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      message: `Transição não permitida: "${labelOf(currentStatus)}" → "${labelOf(newStatus)}".`,
    };
  }

  // 2. Role / ownership rules per target status
  switch (newStatus) {
    case INSPECTION_STATUS.IN_PROGRESS:
    case INSPECTION_STATUS.SUBMITTED:
      // Only the assigned inspector can start/submit.
      // Supervisors+ can override (e.g. for stuck inspections) but it's logged.
      if (!isAssignedInspector && !isSupervisorOrAbove) {
        return {
          ok: false,
          code: "NOT_ASSIGNED",
          message: "Apenas o inspetor atribuído pode iniciar ou submeter esta inspeção.",
        };
      }
      break;

    case INSPECTION_STATUS.REVIEWED:
      // Supervisor+ only
      if (!isSupervisorOrAbove) {
        return {
          ok: false,
          code: "NOT_AUTHORIZED",
          message: "Apenas supervisores ou administradores podem aprovar inspeções.",
        };
      }
      // Cannot review own inspection
      if (isAssignedInspector) {
        return {
          ok: false,
          code: "SELF_REVIEW",
          message: "Não pode aprovar a sua própria inspeção. Peça a outro supervisor para rever.",
        };
      }
      // Can only review if currently submitted, needs_corrections, or closed (admin reopen)
      if (currentStatus === INSPECTION_STATUS.CLOSED) {
        // Reopening a closed inspection requires admin
        if (role !== ROLES.ADMIN) {
          return {
            ok: false,
            code: "NOT_AUTHORIZED",
            message: "Apenas administradores podem reabrir inspeções fechadas.",
          };
        }
      } else if (currentStatus !== INSPECTION_STATUS.SUBMITTED && currentStatus !== INSPECTION_STATUS.NEEDS_CORRECTIONS) {
        return {
          ok: false,
          code: "NOT_SUBMITTED",
          message: "Só pode aprovar inspeções que foram submetidas para revisão.",
        };
      }
      break;

    case INSPECTION_STATUS.NEEDS_CORRECTIONS:
      if (!isSupervisorOrAbove) {
        return {
          ok: false,
          code: "NOT_AUTHORIZED",
          message: "Apenas supervisores ou administradores podem devolver inspeções para correção.",
        };
      }
      if (currentStatus !== INSPECTION_STATUS.SUBMITTED
          && currentStatus !== INSPECTION_STATUS.REVIEWED
          && currentStatus !== INSPECTION_STATUS.CLOSED) {
        return {
          ok: false,
          code: "NOT_REVIEWABLE",
          message: "Só pode devolver inspeções submetidas, aprovadas ou fechadas.",
        };
      }
      break;

    case INSPECTION_STATUS.PENDING:
      // Accept task: only the assigned inspector (or supervisor override)
      if (currentStatus === INSPECTION_STATUS.PENDING_ACCEPTANCE) {
        if (!isAssignedInspector && !isSupervisorOrAbove) {
          return {
            ok: false,
            code: "NOT_ASSIGNED",
            message: "Apenas o inspetor atribuído pode aceitar esta tarefa.",
          };
        }
      }
      break;

    case INSPECTION_STATUS.REJECTED:
      // Decline task: only the assigned inspector (or supervisor override)
      if (currentStatus === INSPECTION_STATUS.PENDING_ACCEPTANCE) {
        if (!isAssignedInspector && !isSupervisorOrAbove) {
          return {
            ok: false,
            code: "NOT_ASSIGNED",
            message: "Apenas o inspetor atribuído pode recusar esta tarefa.",
          };
        }
      }
      break;

    case INSPECTION_STATUS.DELETED:
      // Deletion guard: submitted / reviewed / closed inspections are protected
      // and require admin role. The matrix now allows these transitions, but
      // this role check enforces admin-only access.
      if (
        currentStatus === INSPECTION_STATUS.SUBMITTED ||
        currentStatus === INSPECTION_STATUS.REVIEWED ||
        currentStatus === INSPECTION_STATUS.CLOSED
      ) {
        if (role !== ROLES.ADMIN) {
          return {
            ok: false,
            code: "PROTECTED",
            message: `Inspeções "${labelOf(currentStatus)}" só podem ser eliminadas por um administrador (motivo obrigatório).`,
          };
        }
      } else {
        // For non-protected statuses: only the assigned inspector (their own)
        // or supervisor/admin can delete. Prevents any inspector from deleting
        // any other inspector's pending inspection.
        if (!isAssignedInspector && !isSupervisorOrAbove) {
          return {
            ok: false,
            code: "NOT_OWNED",
            message: "Só pode eliminar as suas próprias inspeções. Inspeções de outros inspetores requerem supervisor ou administrador.",
          };
        }
      }
      break;

    case INSPECTION_STATUS.CLOSED:
      if (!isSupervisorOrAbove) {
        return {
          ok: false,
          code: "NOT_AUTHORIZED",
          message: "Apenas supervisores ou administradores podem fechar inspeções.",
        };
      }
      break;

    default:
      break;
  }

  return { ok: true };
}

// ─── DELETE GUARD (convenience wrapper) ────────────────────────
/**
 * Check if the current user can delete the inspection.
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function canDelete(inspection, currentUser) {
  return validateTransition(inspection, INSPECTION_STATUS.DELETED, currentUser);
}

// ─── HELPERS ───────────────────────────────────────────────────

/**
 * Get the human-readable label for a status.
 */
export function labelOf(status) {
  return (STATE_LABELS[status] && STATE_LABELS[status].label) || status || "—";
}

/**
 * Check if a string is a known status.
 */
export function isValidStatus(status) {
  return Object.values(INSPECTION_STATUS).includes(status);
}

/**
 * Get the list of statuses the current user is allowed to move this inspection to.
 * Useful for rendering action buttons dynamically.
 * @returns {string[]}
 */
export function getAllowedNextStatuses(inspection, currentUser) {
  if (!inspection || !currentUser) return [];
  const currentStatus = inspection.status || INSPECTION_STATUS.PENDING;
  const allowed = TRANSITIONS[currentStatus] || [];
  return allowed.filter(target => validateTransition(inspection, target, currentUser).ok);
}
