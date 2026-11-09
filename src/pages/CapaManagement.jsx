// /src/pages/CapaManagement.jsx
// ============================================================================
// CAPA (Corrective Action Preventive Action) management page.
// Lists corrective actions generated from inspection defects (score ≤ 2).
// Inspectors: see their own CAPAs, add evidence, mark in_progress.
// Supervisors/Admins: see all CAPAs, close with note, cancel (admin only).
// ============================================================================

import { useState, useEffect, useRef } from "react";
import { Icon } from "../lib/icons";
import { ROLES } from "../data/constants";
import { capaService, CAPA_STATUS, CAPA_STATUS_LABELS } from "../services/capaService";
import { showToast } from "../lib/toast";
import PromptModal from "../components/PromptModal";

// Single state object — all updates batched into one setState call
// to prevent rapid re-renders that cause "removeChild" DOM errors.
const initialState = {
  capas: [],
  loading: true,
  error: null,
  summary: { open: 0, in_progress: 0, overdue: 0, closed: 0, cancelled: 0, open_or_overdue: 0, total: 0 },
};

export default function CapaManagement({ currentUser, users }) {
  const [state, setState] = useState(initialState);
  const [filterStatus, setFilterStatus] = useState("open_or_overdue");
  const [filterInspector, setFilterInspector] = useState("");
  const [modal, setModal] = useState(null);

  // Refs to avoid stale closures and prevent updates after unmount
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const isSupervisorOrAbove = [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR].includes(currentUser.role);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Single fetch function — no useCallback, just called from effect
  async function fetchCapas() {
    const myFetchId = ++fetchIdRef.current;
    // Set loading state (single update)
    if (mountedRef.current) {
      setState((prev) => ({ ...prev, loading: true, error: null }));
    }

    try {
      // Auto-mark overdue (best-effort, ignore errors if table doesn't exist)
      await capaService.markOverdue().catch(() => {});

      // Build filters
      const filters = { limit: 500 };
      if (filterStatus !== "all" && filterStatus !== "open_or_overdue") {
        filters.status = filterStatus;
      }
      if (!isSupervisorOrAbove) {
        filters.assignedTo = currentUser.id;
      } else if (filterInspector) {
        filters.assignedTo = filterInspector;
      }

      // Fetch summary + list in parallel
      const [sumRes, listRes] = await Promise.all([
        capaService.getSummary(isSupervisorOrAbove ? null : currentUser.id),
        capaService.fetchCapas(filters),
      ]);

      // Ignore if a newer fetch has started
      if (myFetchId !== fetchIdRef.current || !mountedRef.current) return;

      let list = listRes.capas || [];

      // Client-side filter for "open_or_overdue"
      if (filterStatus === "open_or_overdue") {
        list = list.filter(
          (c) =>
            c.status === CAPA_STATUS.OPEN ||
            c.status === CAPA_STATUS.OVERDUE ||
            c.status === CAPA_STATUS.IN_PROGRESS
        );
      }

      // SINGLE batched state update — prevents rapid re-renders
      setState({
        capas: list,
        loading: false,
        error: null,
        summary: sumRes.success ? sumRes.summary : initialState.summary,
      });
    } catch (e) {
      console.error("[CapaManagement] fetch error:", e);
      if (myFetchId === fetchIdRef.current && mountedRef.current) {
        setState({
          capas: [],
          loading: false,
          error: e.message || "Erro ao carregar CAPAs",
          summary: initialState.summary,
        });
        showToast("Erro ao carregar CAPAs.", "error");
      }
    }
  }

  // Re-fetch when filters change
  useEffect(() => {
    fetchCapas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterInspector, currentUser.id, isSupervisorOrAbove]);

  const handleAction = (type, capa) => {
    setModal({ type, capa });
  };

  const onModalConfirm = async (value) => {
    const { type, capa } = modal;
    setModal(null);
    if (!capa) return;

    try {
      if (type === "close") {
        const res = await capaService.closeCapa(capa.id, {
          closureNote: value,
          closedBy: currentUser.id,
          closedByName: currentUser.name,
        });
        if (res.success) {
          showToast("CAPA fechada com sucesso.", "success");
          addAuditLogSafe("CAPA Fechada", `Fechou a CAPA para ${capa.item_label} em ${capa.location_name}.`);
        } else {
          showToast("Erro ao fechar CAPA: " + (res.error || ""), "error");
        }
      } else if (type === "cancel") {
        const res = await capaService.cancelCapa(capa.id, {
          reason: value,
          cancelledBy: currentUser.id,
        });
        if (res.success) {
          showToast("CAPA cancelada.", "success");
          addAuditLogSafe("CAPA Cancelada", `Cancelou a CAPA para ${capa.item_label} em ${capa.location_name}.`);
        }
      } else if (type === "evidence") {
        const res = await capaService.addEvidence(
          capa.id,
          { evidenceNote: value, evidencePhotoPath: null },
          currentUser
        );
        if (res.success) {
          showToast("Evidência registada. CAPA marcada como em curso.", "success");
          addAuditLogSafe("CAPA Em Curso", `Adicionou evidência à CAPA para ${capa.item_label} em ${capa.location_name}.`);
        }
      }
      fetchCapas(); // refresh
    } catch (e) {
      console.error("[CapaManagement] action error:", e);
      showToast("Erro ao processar ação.", "error");
    }
  };

  const addAuditLogSafe = (action, detail) => {
    try {
      const entry = {
        id: Date.now() + Math.random().toString(36).slice(2),
        timestamp: new Date().toISOString(),
        user: currentUser.name,
        action,
        type: "capa",
        detail,
      };
      const existing = JSON.parse(localStorage.getItem("fims_logs") || "[]");
      localStorage.setItem("fims_logs", JSON.stringify([entry, ...existing].slice(0, 200)));
    } catch (e) {}
  };

  const isOverdue = (capa) => {
    if (capa.status === CAPA_STATUS.CLOSED || capa.status === CAPA_STATUS.CANCELLED) return false;
    return new Date(capa.due_at) < new Date();
  };

  const formatDate = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-PT", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const summaryCards = [
    { key: "open_or_overdue", label: "Abertas + Atrasadas", count: state.summary.open_or_overdue || 0, color: "#EF9F27", icon: "alert" },
    { key: "open", label: "Abertas", count: state.summary.open || 0, color: "#BA7517", icon: "bell" },
    { key: "in_progress", label: "Em Curso", count: state.summary.in_progress || 0, color: "#378ADD", icon: "edit" },
    { key: "overdue", label: "Atrasadas", count: state.summary.overdue || 0, color: "#A32D2D", icon: "alert" },
    { key: "closed", label: "Fechadas", count: state.summary.closed || 0, color: "#0F6E56", icon: "check" },
    { key: "all", label: "Todas", count: state.summary.total || 0, color: "#6B7280", icon: "clipboard" },
  ];

  // Stable content rendering — always wraps content in the same container
  // to prevent DOM structure changes between loading/loaded states
  let content;
  if (state.loading) {
    content = (
      <div style={{ textAlign: "center", padding: 40, color: "#6B7280" }}>
        <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
        A carregar CAPAs...
      </div>
    );
  } else if (state.error) {
    content = (
      <div style={{ textAlign: "center", padding: 40, color: "#A32D2D" }}>
        <Icon name="alert" size={32} style={{ color: "#A32D2D", marginBottom: 8 }} />
        <p style={{ fontSize: 14 }}>Erro: {state.error}</p>
        <button className="btn btn-secondary btn-sm" onClick={fetchCapas} style={{ marginTop: 12 }}>
          Tentar novamente
        </button>
      </div>
    );
  } else if (state.capas.length === 0) {
    content = (
      <div style={{ textAlign: "center", padding: 40, color: "#6B7280" }}>
        <Icon name="check" size={32} style={{ color: "#0F6E56", marginBottom: 8 }} />
        <p style={{ fontSize: 14 }}>Nenhuma CAPA encontrada para este filtro.</p>
      </div>
    );
  } else {
    content = (
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #E5E7EB", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              <th style={thStyle}>Localização</th>
              <th style={thStyle}>Item (Defeito)</th>
              <th style={thStyle}>Secção</th>
              <th style={thStyle}>Inspetor</th>
              <th style={thStyle}>Prazo</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {state.capas.map((capa) => {
              const overdue = isOverdue(capa);
              const statusLabel = CAPA_STATUS_LABELS[capa.status] || { label: capa.status, color: "#888", cls: "badge-pending" };
              return (
                <tr key={capa.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{capa.location_name || "—"}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{String(capa.inspection_id || "").slice(0, 12)}</div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{capa.item_label || "—"}</div>
                    {capa.evidence_note ? (
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                        <Icon name="file" size={10} /> {capa.evidence_note.slice(0, 50)}
                        {capa.evidence_note.length > 50 ? "..." : ""}
                      </div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>{capa.section_name || "—"}</td>
                  <td style={tdStyle}>{capa.assigned_name || "—"}</td>
                  <td style={tdStyle}>
                    <div style={{ color: overdue ? "#A32D2D" : "#374151", fontWeight: overdue ? 600 : 400, fontSize: 12 }}>
                      {formatDate(capa.due_at)}
                    </div>
                    {overdue ? <div style={{ fontSize: 10, color: "#A32D2D", fontWeight: 600 }}>ATRASADA</div> : null}
                  </td>
                  <td style={tdStyle}>
                    <span className={`badge ${statusLabel.cls}`}>{statusLabel.label}</span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {(capa.status === CAPA_STATUS.OPEN || capa.status === CAPA_STATUS.OVERDUE) &&
                      String(capa.assigned_to) === String(currentUser.id) ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAction("evidence", capa)} title="Adicionar evidência">
                          <Icon name="camera" size={12} /> Evidência
                        </button>
                      ) : null}
                      {isSupervisorOrAhead &&
                      [CAPA_STATUS.OPEN, CAPA_STATUS.IN_PROGRESS, CAPA_STATUS.OVERDUE].includes(capa.status) ? (
                        <button className="btn btn-sm" onClick={() => handleAction("close", capa)} style={{ background: "#0F6E56", color: "#fff" }} title="Fechar CAPA">
                          <Icon name="check" size={12} /> Fechar
                        </button>
                      ) : null}
                      {currentUser.role === ROLES.ADMIN &&
                      [CAPA_STATUS.OPEN, CAPA_STATUS.IN_PROGRESS, CAPA_STATUS.OVERDUE].includes(capa.status) ? (
                        <button className="btn btn-sm" onClick={() => handleAction("cancel", capa)} style={{ background: "#A32D2D", color: "#fff" }} title="Cancelar CAPA (falso positivo)">
                          <Icon name="x" size={12} />
                        </button>
                      ) : null}
                      {capa.status === CAPA_STATUS.CLOSED ? (
                        <span style={{ fontSize: 11, color: "#6B7280" }}>
                          {capa.closed_by_name || "—"} • {formatDate(capa.closed_at)}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
        {summaryCards.map((card) => (
          <div
            key={card.key}
            onClick={() => setFilterStatus(card.key)}
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: "14px 16px",
              border: filterStatus === card.key ? `2px solid ${card.color}` : "1px solid #E5E7EB",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Icon name={card.icon} size={14} style={{ color: card.color }} />
              <span style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", fontWeight: 600 }}>{card.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: card.color }}>{card.count}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <select className="form-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: "auto" }}>
          <option value="open_or_overdue">Abertas + Atrasadas</option>
          <option value="all">Todas</option>
          <option value="open">Abertas</option>
          <option value="in_progress">Em Curso</option>
          <option value="overdue">Atrasadas</option>
          <option value="closed">Fechadas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        {isSupervisorOrAbove ? (
          <select className="form-select" value={filterInspector} onChange={(e) => setFilterInspector(e.target.value)} style={{ width: "auto" }}>
            <option value="">Todos os inspetores</option>
            {users.filter((u) => u.role === ROLES.INSPECTOR).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        ) : null}
        <button className="btn btn-secondary btn-sm" onClick={fetchCapas} disabled={state.loading}>
          <Icon name="cloud" size={13} /> {state.loading ? "A carregar..." : "Atualizar"}
        </button>
      </div>

      {/* Content — key forces React to unmount/remount when type changes,
          preventing 'removeChild' DOM reconciliation errors */}
      <div
        key={state.loading ? 'loading' : state.error ? 'error' : state.capas.length === 0 ? 'empty' : 'table'}
        style={{ minHeight: 200 }}
      >
        {content}
      </div>

      {/* Modal */}
      {modal ? (
        <PromptModal
          title={
            modal.type === "close" ? "Fechar CAPA" :
            modal.type === "cancel" ? "Cancelar CAPA" :
            "Adicionar Evidência"
          }
          message={
            modal.type === "close"
              ? `Vai fechar a CAPA para "${modal.capa.item_label}" em ${modal.capa.location_name}. Indique a nota de fecho:`
              : modal.type === "cancel"
              ? `Vai CANCELAR a CAPA para "${modal.capa.item_label}" em ${modal.capa.location_name}. Esta ação é para falsos positivos. Indique o motivo:`
              : `Indique a evidência de correção para "${modal.capa.item_label}" em ${modal.capa.location_name}:`
          }
          placeholder={
            modal.type === "close" ? "Ex: Defeito corrigido, verificado no local..." :
            modal.type === "cancel" ? "Ex: Falso positivo, item foi mal avaliado..." :
            "Ex: Defeito corrigido, fotos anexadas..."
          }
          confirmLabel={
            modal.type === "close" ? "Fechar" :
            modal.type === "cancel" ? "Cancelar CAPA" :
            "Registar"
          }
          danger={modal.type === "cancel"}
          requireInput
          onConfirm={onModalConfirm}
          onCancel={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 600,
  color: "#6B7280",
  textTransform: "uppercase",
  borderBottom: "1px solid #E5E7EB",
};

const tdStyle = {
  padding: "10px 12px",
  fontSize: 13,
  color: "#374151",
  verticalAlign: "top",
};
