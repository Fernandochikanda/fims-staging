// /src/pages/InspectionsList.jsx
import { useState } from "react";
import { Icon } from "../lib/icons";
import ScoreRing from "../components/ScoreRing";
import StatusBadge from "../components/StatusBadge";
import { ROLES } from "../data/constants";

export default function InspectionsList({ 
  inspections, 
  currentUser, 
  onView, 
  onCreate,
  onDelete // Nova prop para deletar
}) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [deleteModal, setDeleteModal] = useState(null); // { id, location_name }

  // Verificar se o usuário pode excluir (Admin ou CEO)
  const canDelete = currentUser && [ROLES.ADMIN, ROLES.CEO].includes(currentUser.role);

  // Filtrar inspeções
  let filtered = inspections;
  
  if (filterStatus !== "all") {
    filtered = filtered.filter(i => i.status === filterStatus);
  }
  
  if (search.trim()) {
    const term = search.toLowerCase().trim();
    filtered = filtered.filter(i => 
      i.location_name?.toLowerCase().includes(term) ||
      i.inspector_name?.toLowerCase().includes(term) ||
      i.date?.includes(term)
    );
  }

  // Ordenar por data (mais recente primeiro)
  filtered = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Função para confirmar exclusão
  const handleDeleteClick = (insp) => {
    setDeleteModal({
      id: insp.id,
      location_name: insp.location_name,
      date: insp.date,
      inspector_name: insp.inspector_name
    });
  };

  // Função para executar exclusão
  const confirmDelete = () => {
    if (deleteModal && onDelete) {
      onDelete(deleteModal.id);
      setDeleteModal(null);
    }
  };

  // Função para cancelar exclusão
  const cancelDelete = () => {
    setDeleteModal(null);
  };

  // Função para obter a cor do risco
  const getRiskColor = (score) => {
    if (score === null || score === undefined) return "#888";
    if (score >= 80) return "#0F6E56";
    if (score >= 60) return "#BA7517";
    if (score >= 40) return "#EF9F27";
    return "#A32D2D";
  };

  const getRiskLabel = (score) => {
    if (score === null || score === undefined) return "N/A";
    if (score >= 80) return "Baixo";
    if (score >= 60) return "Médio";
    if (score >= 40) return "Alto";
    return "Crítico";
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div className="page-title">📋 Inspeções</div>
          <div className="page-sub">
            {filtered.length} de {inspections.length} inspeções
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Buscar por local, inspetor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "8px 14px",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              fontSize: 13,
              minWidth: 200
            }}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: "8px 14px",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              fontSize: 13,
              background: "white"
            }}
          >
            <option value="all">Todos os status</option>
            <option value="pending_acceptance">Pendente</option>
            <option value="in_progress">Em Andamento</option>
            <option value="submitted">Submetida</option>
            <option value="reviewed">Aprovada</option>
            <option value="needs_corrections">Correção Necessária</option>
            <option value="sent_to_client">Enviada ao Cliente</option>
            <option value="closed">Fechada</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={onCreate}>
            <Icon name="plus" size={13} /> Nova Inspeção
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="table-wrap" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: "800px" }}>
          <thead>
            <tr>
              <th>Localização</th>
              <th>Inspetor</th>
              <th>Data</th>
              <th>Score</th>
              <th>Risco</th>
              <th>Status</th>
              <th style={{ textAlign: "center" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "#888" }}>
                  {search || filterStatus !== "all" ? (
                    "Nenhuma inspeção encontrada com os filtros aplicados."
                  ) : (
                    <>
                      <Icon name="clipboard" size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <div>Nenhuma inspeção realizada ainda.</div>
                      <button className="btn btn-primary btn-sm" onClick={onCreate} style={{ marginTop: 12 }}>
                        <Icon name="plus" size={13} /> Criar primeira inspeção
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map(insp => {
                const score = insp.score_pct;
                const riskColor = getRiskColor(score);
                const riskLabel = getRiskLabel(score);
                
                return (
                  <tr key={insp.id}>
                    <td style={{ fontWeight: 500 }}>{insp.location_name || "N/A"}</td>
                    <td>{insp.inspector_name || "Não atribuído"}</td>
                    <td>{insp.date || "N/A"}</td>
                    <td>
                      {score !== null && score !== undefined ? (
                        <ScoreRing pct={score} size={36} />
                      ) : (
                        <span style={{ color: "#888", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      {score !== null && score !== undefined ? (
                        <span style={{ 
                          color: riskColor, 
                          fontWeight: 600,
                          fontSize: 13
                        }}>
                          {riskLabel}
                        </span>
                      ) : (
                        <span style={{ color: "#888", fontSize: 12 }}>N/A</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={insp.status} />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => onView(insp)}
                          style={{ padding: "4px 10px" }}
                        >
                          <Icon name="eye" size={12} /> Ver
                        </button>
                        {canDelete && (
                          <button 
                            className="btn btn-danger btn-sm" 
                            onClick={() => handleDeleteClick(insp)}
                            style={{ padding: "4px 10px" }}
                          >
                            <Icon name="trash" size={12} /> Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {deleteModal && (
        <div 
          className="modal-overlay" 
          onClick={cancelDelete}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px"
          }}
        >
          <div 
            className="modal" 
            onClick={e => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 12,
              maxWidth: 450,
              width: "100%",
              padding: 0,
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              animation: "modalSlideIn 0.3s ease"
            }}
          >
            <div className="modal-header" style={{
              padding: "16px 20px",
              borderBottom: "1px solid #E5E7EB",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#A32D2D", display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name="alert" size={20} />
                Confirmar Exclusão
              </div>
              <button 
                className="icon-btn" 
                onClick={cancelDelete}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#888"
                }}
              >
                ✕
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: "20px" }}>
              <p style={{ fontSize: 14, color: "#4B5563", marginBottom: 16 }}>
                Tem certeza que deseja excluir esta inspeção?
              </p>
              
              <div style={{
                background: "#F8F7F4",
                padding: "12px 16px",
                borderRadius: 8,
                marginBottom: 16
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span style={{ color: "#888" }}>Local:</span>
                  <span style={{ fontWeight: 500 }}>{deleteModal.location_name}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span style={{ color: "#888" }}>Data:</span>
                  <span style={{ fontWeight: 500 }}>{deleteModal.date || "N/A"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span style={{ color: "#888" }}>Inspetor:</span>
                  <span style={{ fontWeight: 500 }}>{deleteModal.inspector_name || "Não atribuído"}</span>
                </div>
              </div>
              
              <div style={{
                background: "#FEF2F2",
                padding: "10px 14px",
                borderRadius: 6,
                fontSize: 12,
                color: "#991B1B",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <Icon name="alert" size={14} />
                <span>Esta ação é irreversível e não pode ser desfeita.</span>
              </div>
            </div>
            
            <div className="modal-footer" style={{
              padding: "12px 20px",
              borderTop: "1px solid #E5E7EB",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10
            }}>
              <button 
                className="btn btn-secondary" 
                onClick={cancelDelete}
                style={{
                  padding: "8px 20px",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  background: "#F3F4F6",
                  color: "#374151"
                }}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-danger" 
                onClick={confirmDelete}
                style={{
                  padding: "8px 20px",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  background: "#A32D2D",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }}
              >
                <Icon name="trash" size={14} />
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          animation: fadeIn 0.2s ease;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .table-wrap {
          overflow-x: auto;
          background: white;
          border-radius: 10px;
          border: 1px solid #E5E7EB;
        }
        
        .table-wrap table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        
        .table-wrap th {
          text-align: left;
          padding: 12px 16px;
          background: #F8F7F4;
          color: #4B5563;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .table-wrap td {
          padding: 12px 16px;
          border-bottom: 1px solid #F3F4F6;
          vertical-align: middle;
        }
        
        .table-wrap tr:hover td {
          background: #FAFAFA;
        }
        
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .btn-sm {
          padding: 4px 10px;
          font-size: 12px;
        }
        
        .btn-primary {
          background: #1E2A3A;
          color: white;
        }
        
        .btn-primary:hover {
          background: #2D3A4A;
        }
        
        .btn-secondary {
          background: #F3F4F6;
          color: #374151;
        }
        
        .btn-secondary:hover {
          background: #E5E7EB;
        }
        
        .btn-danger {
          background: #A32D2D;
          color: white;
        }
        
        .btn-danger:hover {
          background: #8A2525;
        }
        
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        
        .page-title {
          font-size: 20px;
          font-weight: 600;
          color: #1E2A3A;
        }
        
        .page-sub {
          font-size: 13px;
          color: #888;
          margin-top: 2px;
        }
        
        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
          }
          
          .page-header > div:last-child {
            width: 100%;
          }
          
          .page-header input,
          .page-header select {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
