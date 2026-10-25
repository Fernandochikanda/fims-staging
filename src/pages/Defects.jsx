// src/pages/Defects.jsx
// ============================================================================
// Página de Defeitos & Problemas Recorrentes.
//  - Dados sincronizados do Supabase (fims_defects) → visíveis em todos os
//    dispositivos (CEO/supervisores veem o mesmo estado).
//  - Escalonamento: SLA 48h → escalado; re-escala a cada 24h (global timer no
//    App + verificação local nesta página).
//  - Ações: Re-escalar agora / Marcar como resolvido.
// ============================================================================
import { useState, useEffect, useCallback } from "react";
import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import defectService from "../services/defectService";
import { useComms } from "../context/CommsContext";
import { NOTIF_EVENTS } from "../services/settingsService";

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}
function slaBadge(d) {
  if (d.status === "resolved") return { text: "Resolvido", color: "#0F6E56" };
  const ms = defectService.slaRemaining(d);
  if (ms < 0) return { text: "Atrasado " + Math.ceil(-ms / 3600000) + "h", color: "#7f1d1d" };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { text: h + "h " + m + "m restantes", color: h < 12 ? "#A32D2D" : "#BA7517" };
}

export default function Defects({ currentUser, users = [] }) {
  const { notifyEvent } = useComms();
  const [filter, setFilter] = useState("open");
  const [defects, setDefects] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const canManage = currentUser && [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR].includes(currentUser.role);

  const notifyEscalation = useCallback(async (d) => {
    const isRe = (d.escalation_count || 0) > 1;
    const msg = (isRe ? "🚨 RE-ESCALAÇÃO (" + d.escalation_count + "ª vez): " : "🚨 ESCALONAMENTO (48h): ") +
      '"' + d.item_label + '" em ' + d.location_name + " continua em aberto após o prazo. Escalado ao CEO.";
    await notifyEvent(NOTIF_EVENTS.DEFECT_ESCALATED, users, msg, "defects", {
      excludeId: currentUser?.id, sender: currentUser,
    });
  }, [notifyEvent, users, currentUser]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const escalated = await defectService.autoEscalate();
        if (alive && escalated.length) {
          for (const d of escalated) await notifyEscalation(d);
        }
        const all = await defectService.getAll();
        if (alive) { setDefects(all); setLoading(false); }
      } catch (e) {
        if (alive) setLoading(false);
      }
    };
    run();
    const iv = setInterval(run, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [notifyEscalation]);

  const handleEscalateNow = async (d) => {
    setBusyId(d.id);
    try {
      const updated = await defectService.escalateNow(d.id);
      if (updated) await notifyEscalation(updated);
      setDefects(await defectService.getAll());
    } finally { setBusyId(null); }
  };

  const handleResolve = async (d) => {
    setBusyId(d.id);
    try {
      const updated = await defectService.resolveManually(d.id, currentUser?.id);
      if (updated) {
        const msg = "✅ DEFEITO RESOLVIDO (manual): \"" + d.item_label + "\" em " + d.location_name + " foi marcado como resolvido por " + (currentUser?.name || "gestor") + ".";
        await notifyEvent(NOTIF_EVENTS.DEFECT_RESOLVED, users, msg, "defects", {
          excludeId: currentUser?.id, sender: currentUser,
        });
      }
      setDefects(await defectService.getAll());
    } finally { setBusyId(null); }
  };

  const filtered = defects.filter(d => {
    if (filter === "all") return true;
    if (filter === "open") return d.status === "open";
    if (filter === "resolved") return d.status === "resolved";
    if (filter === "overdue") return d.status === "open" && defectService.slaRemaining(d) < 0;
    return true;
  });
  const openCount = defects.filter(d => d.status === "open").length;
  const overdueCount = defects.filter(d => d.status === "open" && defectService.slaRemaining(d) < 0).length;
  const resolvedCount = defects.filter(d => d.status === "resolved").length;

  const filters = [
    { id: "open", label: "Em aberto" },
    { id: "overdue", label: "Atrasados" },
    { id: "resolved", label: "Resolvidos" },
    { id: "all", label: "Todos" },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{"\u26A0"} Defeitos & Problemas Recorrentes</div>
          <div className="page-sub">Itens com score &lt; 3 — SLA 48h, escalados ao CEO · sincronizado entre dispositivos</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16, borderLeft: "4px solid #A32D2D" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#A32D2D" }}>{openCount}</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Em aberto</div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: "4px solid #7f1d1d" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#7f1d1d" }}>{overdueCount}</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Atrasados (&gt;48h)</div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: "4px solid #0F6E56" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0F6E56" }}>{resolvedCount}</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Resolvidos</div>
        </div>
        <div className="card" style={{ padding: 16, borderLeft: "4px solid #6B7280" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#6B7280" }}>{defects.length}</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>Total</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {filters.map(f => (
          <button key={f.id} className={"btn btn-sm " + (filter === f.id ? "btn-primary" : "btn-secondary")} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>A carregar defeitos do servidor…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Nenhum defeito neste filtro. {"\u2705"}</div>
        ) : (
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {filtered.map(d => {
              const badge = slaBadge(d);
              const busy = busyId === d.id;
              return (
                <div key={d.id} style={{ padding: 14, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#1E2A3A" }}>
                      {(d.status === "open" ? "\u26A0 " : "\u2705 ") + (d.item_label || "Item")}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                      {d.location_name} {"\u00B7"} {d.section_name} {"\u00B7"} Score {d.score}/5
                    </div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                      Aberto: {fmtDate(d.opened_at)} {"\u00B7"} Prazo: {fmtDate(d.due_at)}
                      {d.recurrence_count > 1 ? " \u00B7 Recorr\u00EAncia: " + d.recurrence_count + "x" : ""}
                      {d.escalated ? " \u00B7 \u{1F6A8} Escalado" + ((d.escalation_count || 0) > 1 ? " (" + d.escalation_count + "x)" : "") : ""}
                      {d.status === "resolved" && d.resolved_at ? " \u00B7 Resolvido: " + fmtDate(d.resolved_at) : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge" style={{ background: badge.color, color: "white" }}>{badge.text}</span>
                    {canManage && d.status === "open" && (
                      <>
                        <button className="btn btn-sm btn-secondary" disabled={busy} onClick={() => handleEscalateNow(d)} title="Notificar CEO/admin/supervisores agora">
                          🚨 Re-escalar
                        </button>
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => handleResolve(d)} title="Marcar como resolvido e notificar equipa">
                          ✅ Resolver
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
