export default function StatusBadge({ status }) {
  const map = {
    pending: { cls: "badge-pending", text: "Pendente" },
    in_progress: { cls: "badge-progress", text: "Em Progresso" },
    submitted: { cls: "badge-submitted", text: "Submetida" },
    reviewed: { cls: "badge-reviewed", text: "Aprovada" },
    needs_corrections: { cls: "badge-critical", text: "Rejeitada (Corrigir)" },
    closed: { cls: "badge-closed", text: "Fechada" },
    ok: { cls: "badge-ok", text: "OK" },
    warning: { cls: "badge-warning", text: "Atenção" },
    critical: { cls: "badge-critical", text: "Crítico" },
  };
  const s = map[status] || { cls: "badge-pending", text: status };
  return <span className={`badge ${s.cls}`}>{s.text}</span>;
}
