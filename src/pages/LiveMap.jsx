// /src/pages/LiveMap.jsx
import { useState, useEffect } from "react";
import { Icon } from "../lib/icons";

export default function LiveMap({ inspections, users }) {
  const [selectedInsp, setSelectedInsp] = useState(null);
  const [mapError, setMapError] = useState(false);
  
  // Filtrar inspeções ativas com GPS
  const activeInspections = inspections.filter(i => 
    (i.status === "in_progress" || i.status === "submitted" || i.status === "pending_acceptance") && 
    i.gps_coords
  );
  
  // Buscar todas as inspeções com GPS (incluindo concluídas) para histórico
  const allWithGPS = inspections.filter(i => i.gps_coords);
  
  // Selecionar a primeira inspeção ativa por padrão
  useEffect(() => {
    if (activeInspections.length > 0 && !selectedInsp) {
      setSelectedInsp(activeInspections[0]);
    } else if (activeInspections.length === 0 && allWithGPS.length > 0 && !selectedInsp) {
      setSelectedInsp(allWithGPS[0]);
    }
  }, [activeInspections, allWithGPS]);

  // Obter coordenadas para o mapa
  const getMapCoords = () => {
    if (selectedInsp && selectedInsp.gps_coords) {
      return selectedInsp.gps_coords;
    }
    if (activeInspections.length > 0 && activeInspections[0].gps_coords) {
      return activeInspections[0].gps_coords;
    }
    if (allWithGPS.length > 0 && allWithGPS[0].gps_coords) {
      return allWithGPS[0].gps_coords;
    }
    // Fallback: Maputo
    return "-25.969248,32.573174";
  };

  const getMapUrl = () => {
    const coords = getMapCoords();
    return `https://www.google.com/maps?q=${coords}&z=15&output=embed`;
  };

  const getInspectorName = (inspectorId) => {
    const user = users.find(u => u.id === inspectorId);
    return user?.name || "Não atribuído";
  };

  const getStatusColor = (status) => {
    switch(status) {
      case "in_progress": return "#EF9F27";
      case "submitted": return "#3B82F6";
      case "pending_acceptance": return "#FAC775";
      case "reviewed": return "#0F6E56";
      case "approved": return "#0F6E56";
      default: return "#6B7280";
    }
  };

  const getStatusLabel = (status) => {
    switch(status) {
      case "in_progress": return "Em Andamento";
      case "submitted": return "Submetida";
      case "pending_acceptance": return "Pendente";
      case "reviewed": return "Aprovada";
      case "approved": return "Aprovada";
      default: return status || "N/A";
    }
  };

  const handleMapError = () => {
    setMapError(true);
  };

  return (
    <div>
      <div className="page-header" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div className="page-title">🗺️ Mapa de Campo</div>
          <div className="page-sub">
            {activeInspections.length} inspetor(es) ativo(s) no campo
            {allWithGPS.length > 0 && ` • ${allWithGPS.length} com GPS registado`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="badge" style={{ background: "#EF9F27", color: "white" }}>
            ● {activeInspections.filter(i => i.status === "in_progress").length} Em Andamento
          </span>
          <span className="badge" style={{ background: "#3B82F6", color: "white" }}>
            ● {activeInspections.filter(i => i.status === "submitted").length} Submetidas
          </span>
          <span className="badge" style={{ background: "#FAC775", color: "#333" }}>
            ● {activeInspections.filter(i => i.status === "pending_acceptance").length} Pendentes
          </span>
        </div>
      </div>

      <div className="two-col" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        {/* Mapa */}
        <div className="card" style={{ padding: 0, overflow: "hidden", position: "relative", minHeight: "450px" }}>
          {allWithGPS.length > 0 ? (
            <iframe
              title="Live Map"
              width="100%"
              height="450"
              style={{ 
                border: 0, 
                display: "block"
              }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              src={getMapUrl()}
              onError={handleMapError}
            />
          ) : (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              height: "450px",
              flexDirection: "column",
              color: "#888",
              background: "#F9FAFB",
              padding: 20,
              textAlign: "center"
            }}>
              <Icon name="location" size={48} style={{ color: "#D1D5DB", marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Nenhuma localização disponível</div>
              <div style={{ fontSize: 13, color: "#9CA3AF" }}>
                {inspections.length > 0 
                  ? "As inspeções ativas não têm coordenadas GPS registadas."
                  : "Nenhuma inspeção ativa no momento."}
              </div>
              <div style={{ fontSize: 12, color: "#D1D5DB", marginTop: 8 }}>
                💡 As coordenadas GPS são capturadas automaticamente durante a inspeção
              </div>
              <div style={{ fontSize: 11, color: "#E5E7EB", marginTop: 4 }}>
                ⚠️ Certifique-se de permitir o acesso à localização no navegador
              </div>
            </div>
          )}
          
          {/* Mini legenda no mapa */}
          {selectedInsp && selectedInsp.gps_coords && !mapError && (
            <div style={{
              position: "absolute",
              bottom: 16,
              left: 16,
              right: 16,
              background: "rgba(0,0,0,0.8)",
              color: "white",
              padding: "10px 16px",
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              backdropFilter: "blur(4px)"
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedInsp.location_name || "Inspeção"}</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  {getInspectorName(selectedInsp.inspector_id)} • {selectedInsp.date || "Data não definida"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ 
                  display: "inline-block", 
                  width: 10, 
                  height: 10, 
                  borderRadius: "50%", 
                  background: getStatusColor(selectedInsp.status) 
                }} />
                <span style={{ fontSize: 12 }}>{getStatusLabel(selectedInsp.status)}</span>
                <a 
                  href={`https://maps.google.com/?q=${selectedInsp.gps_coords}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    color: "#60A5FA", 
                    fontSize: 12,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <Icon name="external-link" size={12} /> Abrir no Google Maps
                </a>
              </div>
            </div>
          )}
          
          {/* Mensagem de erro do mapa */}
          {mapError && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0,0,0,0.8)",
              color: "white",
              padding: "20px 30px",
              borderRadius: 8,
              textAlign: "center"
            }}>
              <Icon name="alert" size={32} style={{ marginBottom: 8 }} />
              <p>Erro ao carregar o mapa</p>
              <a 
                href={`https://maps.google.com/?q=${getMapCoords()}`} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: "#60A5FA", fontSize: 13 }}
              >
                Abrir no Google Maps →
              </a>
            </div>
          )}
        </div>

        {/* Lista de inspeções */}
        <div className="card" style={{ maxHeight: "450px", overflowY: "auto" }}>
          <h3 style={{ fontSize: 15, marginBottom: 12, color: "#1E2A3A" }}>
            📋 Inspeções com GPS
            <span style={{ fontSize: 12, fontWeight: 400, color: "#888", marginLeft: 8 }}>
              ({allWithGPS.length})
            </span>
          </h3>
          
          {allWithGPS.length === 0 ? (
            <div style={{ 
              textAlign: "center", 
              padding: "40px 20px", 
              color: "#888",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8
            }}>
              <Icon name="check-circle" size={32} style={{ color: "#D1D5DB" }} />
              <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhuma localização registada</div>
              <div style={{ fontSize: 12 }}>As inspeções ainda não têm coordenadas GPS.</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                ⚠️ Ative o GPS durante a inspeção para registar a localização.
              </div>
            </div>
          ) : (
            allWithGPS.slice(0, 20).map(insp => {
              const isSelected = selectedInsp?.id === insp.id;
              return (
                <div 
                  key={insp.id} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: 12, 
                    padding: "10px 12px",
                    borderRadius: 8,
                    marginBottom: 8,
                    border: isSelected ? "2px solid #1E2A3A" : "1px solid #E5E7EB",
                    background: isSelected ? "#F8F7F4" : "white",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => {
                    setSelectedInsp(insp);
                    setMapError(false);
                  }}
                >
                  <div style={{ 
                    width: 10, 
                    height: 10, 
                    borderRadius: "50%", 
                    background: getStatusColor(insp.status),
                    flexShrink: 0
                  }} />
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontWeight: 500, 
                      fontSize: 13,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}>
                      {insp.location_name || "Inspeção"}
                    </div>
                    <div style={{ color: "#888", fontSize: 11, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span>{getInspectorName(insp.inspector_id)}</span>
                      <span>•</span>
                      <span>{insp.date || "N/A"}</span>
                      <span>•</span>
                      <span style={{ color: getStatusColor(insp.status) }}>
                        {getStatusLabel(insp.status)}
                      </span>
                    </div>
                  </div>
                  
                  {insp.gps_coords && (
                    <a 
                      href={`https://maps.google.com/?q=${insp.gps_coords}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ 
                        color: "#378ADD", 
                        fontSize: 11,
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flexShrink: 0
                      }}
                    >
                      <Icon name="location" size={12} /> Ver
                    </a>
                  )}
                </div>
              );
            })
          )}
          
          {allWithGPS.length > 20 && (
            <div style={{ 
              marginTop: 8, 
              padding: 8, 
              background: "#F3F4F6", 
              borderRadius: 6,
              fontSize: 11,
              color: "#6B7280",
              textAlign: "center"
            }}>
              📌 + {allWithGPS.length - 20} outras inspeções com GPS
            </div>
          )}
        </div>
      </div>

      {/* Estatísticas rápidas */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", 
        gap: 12,
        marginTop: 16
      }}>
        <div className="card" style={{ textAlign: "center", padding: "12px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1E2A3A" }}>
            {allWithGPS.length}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>Total com GPS</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "12px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#EF9F27" }}>
            {inspections.filter(i => i.status === "in_progress").length}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>Em Andamento</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "12px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#3B82F6" }}>
            {inspections.filter(i => i.status === "submitted").length}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>Submetidas</div>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "12px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0F6E56" }}>
            {inspections.filter(i => i.status === "reviewed" || i.status === "approved").length}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>Aprovadas</div>
        </div>
      </div>

      <style>{`
        .card {
          background: white;
          border-radius: 10px;
          padding: 16px;
          border: 1px solid #E5E7EB;
        }
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
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
        .two-col {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 16px;
        }
        @media (max-width: 1024px) {
          .two-col {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 600px) {
          .page-header {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
