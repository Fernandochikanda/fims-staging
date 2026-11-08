// /src/components/StatusBadge.jsx
// Renders a status badge using the consolidated STATE_LABELS from inspectionStates.js.
// This replaces the hardcoded map that was here before — now there is ONE source of
// truth for status labels and colors.

import { STATE_LABELS } from "../lib/inspectionStates";

// Legacy / display-only statuses that aren't part of the inspection lifecycle
// but still appear in the UI (e.g. alert levels).
const EXTRA_LABELS = {
  approved: { cls: "badge-reviewed", text: "Aprovada" },
  sent_to_client: { cls: "badge-reviewed", text: "Enviado ao Cliente" },
  ok: { cls: "badge-ok", text: "OK" },
  warning: { cls: "badge-warning", text: "Atenção" },
  critical: { cls: "badge-critical", text: "Crítico" },
};

export default function StatusBadge({ status }) {
  const stateLabel = STATE_LABELS[status];
  const extra = EXTRA_LABELS[status];
  const s = stateLabel
    ? { cls: stateLabel.cls, text: stateLabel.label }
    : extra || { cls: "badge-pending", text: status };
  return <span className={`badge ${s.cls}`}>{s.text}</span>;
}
