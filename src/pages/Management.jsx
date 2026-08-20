// /src/pages/Management.jsx
import { useState, useRef, useEffect } from "react";
import { Icon } from "../lib/icons";
import ScoreRing from "../components/ScoreRing";
import { ROLES, TEMPLATE_SECTIONS } from "../data/constants";
import { scoreLabel } from "../lib/helpers";
import { TemplateImporter } from "./Management/TemplateImporter";
import { loadTemplatesFromStorage, getTemplateByClientName } from "../utils/excelTemplateImporter";
import { SupabaseSync } from "./Management/SupabaseSync";

// /src/pages/Management.jsx - Atualizar UsersPage

export function UsersPage({ users, setUsers }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: ROLES.INSPECTOR });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Carregar usuários do Supabase ao montar
  useEffect(() => {
    loadUsersFromSupabase();
  }, []);

  const loadUsersFromSupabase = async () => {
    try {
      const result = await authService.fetchAllUsers();
      if (result.success && result.users.length > 0) {
        setUsers(result.users);
        localStorage.setItem('fims_users', JSON.stringify(result.users));
      }
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
  };

  const save = async () => {
    if (!form.name || !form.email || !form.password) {
      setError('Preencha todos os campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await authService.createUser(form);
      
      if (result.success) {
        // Recarregar lista de usuários
        const { users: updatedUsers } = await authService.fetchAllUsers();
        setUsers(updatedUsers);
        localStorage.setItem('fims_users', JSON.stringify(updatedUsers));
        setShowModal(false);
        setForm({ name: "", email: "", password: "", role: ROLES.INSPECTOR });
      } else {
        setError(result.error || 'Erro ao criar usuário');
      }
    } catch (err) {
      setError('Erro ao criar usuário. Tente novamente.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      const result = await authService.toggleUserStatus(userId, !currentStatus);
      if (result.success) {
        const { users: updatedUsers } = await authService.fetchAllUsers();
        setUsers(updatedUsers);
        localStorage.setItem('fims_users', JSON.stringify(updatedUsers));
      }
    } catch (err) {
      alert('Erro ao alterar status');
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm('Tem certeza que deseja remover este usuário?')) return;
    
    try {
      const result = await authService.deleteUser(userId);
      if (result.success) {
        const { users: updatedUsers } = await authService.fetchAllUsers();
        setUsers(updatedUsers);
        localStorage.setItem('fims_users', JSON.stringify(updatedUsers));
      }
    } catch (err) {
      alert('Erro ao remover usuário');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Gestão de Utilizadores</div>
          <div className="page-sub">{users.length} utilizadores</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
          <Icon name="plus" size={13} />Novo Utilizador
        </button>
      </div>
      
      {error && (
        <div className="error-banner" style={{ 
          background: '#FEF2F2', 
          padding: '10px 16px', 
          borderRadius: '8px',
          color: '#991B1B',
          marginBottom: '16px',
          border: '1px solid #FCA5A5'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Perfil</th>
              <th>Estado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div className="user-avatar-sm">{u.avatar || u.name?.substring(0,2).toUpperCase()}</div>
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ color: "#888" }}>{u.email}</td>
                <td><span className="badge badge-progress">{u.role}</span></td>
                <td>
                  <span className={`badge ${u.active !== false ? "badge-ok" : "badge-closed"}`}>
                    {u.active !== false ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td>
                  <button 
                    className="btn btn-sm btn-secondary" 
                    onClick={() => toggleUserStatus(u.id, u.active !== false)}
                  >
                    {u.active !== false ? "Desativar" : "Ativar"}
                  </button>
                  <button 
                    className="btn btn-sm btn-danger" 
                    onClick={() => deleteUser(u.id)}
                    style={{ marginLeft: '4px' }}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 15, fontWeight: 500 }}>Novo Utilizador</div>
              <button className="icon-btn" onClick={() => setShowModal(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nome completo</label>
                <input 
                  className="form-input" 
                  value={form.name} 
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input 
                  className="form-input" 
                  type="email" 
                  value={form.email} 
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Senha</label>
                <input 
                  className="form-input" 
                  type="password" 
                  value={form.password} 
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} 
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Perfil</label>
                <select 
                  className="form-select" 
                  value={form.role} 
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value={ROLES.INSPECTOR}>Inspetor</option>
                  <option value={ROLES.SUPERVISOR}>Supervisor</option>
                  <option value={ROLES.CEO}>CEO</option>
                  <option value={ROLES.ADMIN}>Administrador</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={loading}>
                {loading ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function LocationsPage({ locations, setLocations, users, inspections }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", supervisor_id: "" });

  return (
    <div>
      <div className="page-header">
        <div><div className="page-title">Localizações</div><div className="page-sub">{locations.length} locais</div></div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}><Icon name="plus" size={13} />Nova Localização</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {locations.map(loc => {
          const locInsp = inspections.filter(i => i.location_id === loc.id && i.score_pct !== null);
          const avg = locInsp.length ? Math.round(locInsp.reduce((s, i) => s + i.score_pct, 0) / locInsp.length) : null;
          return (
            <div key={loc.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div><div style={{ fontSize: 14, fontWeight: 500 }}>{loc.name}</div><div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{loc.address}</div></div>
                <ScoreRing pct={avg} size={44} />
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>{locInsp.length} inspeções realizadas</div>
            </div>
          );
        })}
      </div>
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div style={{ fontSize: 15, fontWeight: 500 }}>Nova Localização</div><button className="icon-btn" onClick={() => setShowModal(false)}><Icon name="x" size={14} /></button></div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Nome do Local</label><input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Endereço</label><input className="form-input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => { setLocations(prev => [...prev, { id: Date.now(), ...form }]); setShowModal(false); }}>Criar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportsPage({ inspections, locations }) {
  const [filterLoc, setFilterLoc] = useState("all");
  let filtered = inspections.filter(i => i.score_pct !== null);
  if (filterLoc !== "all") filtered = filtered.filter(i => i.location_id === Number(filterLoc));
  const avgScore = filtered.length ? Math.round(filtered.reduce((s, i) => s + i.score_pct, 0) / filtered.length) : 0;

  return (
    <div>
      <div className="page-header"><div><div className="page-title">Relatórios e Analytics</div><div className="page-sub">{filtered.length} inspeções</div></div></div>
      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">Score Médio</div><div className="metric-value" style={{ color: scoreLabel(avgScore).color }}>{avgScore}%</div></div>
        <div className="metric-card"><div className="metric-label">Total Inspeções</div><div className="metric-value">{filtered.length}</div></div>
        <div className="metric-card"><div className="metric-label">Críticas</div><div className="metric-value" style={{ color: "#A32D2D" }}>{filtered.filter(i => i.alert_level === "critical").length}</div></div>
      </div>
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Performance por Localização</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Localização</th><th>Nº Inspeções</th><th>Score Médio</th></tr></thead>
            <tbody>
              {locations.map(loc => {
                const li = filtered.filter(i => i.location_id === loc.id);
                if (!li.length) return null;
                const avg = Math.round(li.reduce((s, i) => s + i.score_pct, 0) / li.length);
                return <tr key={loc.id}><td style={{ fontWeight: 500 }}>{loc.name}</td><td>{li.length}</td><td><ScoreRing pct={avg} size={36} /></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TEMPLATES PAGE - COMPLETO COM IMPORTAÇÃO DO EXCEL E SUPABASE
// ============================================================
export function TemplatesPage() {
  const [showImporter, setShowImporter] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [stats, setStats] = useState({ total: 0, totalItems: 0, totalSections: 0 });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    const { clients } = loadTemplatesFromStorage();
    setTemplates(clients);
    
    // Calcular estatísticas
    const { templates: allTemplates } = loadTemplatesFromStorage();
    const totalItems = Object.values(allTemplates).reduce((sum, t) => sum + (t.totalItems || 0), 0);
    const totalSections = Object.values(allTemplates).reduce((sum, t) => sum + (t.sections || []).length, 0);
    setStats({
      total: clients.length,
      totalItems: totalItems,
      totalSections: totalSections
    });
  };

  const handleImportComplete = (count) => {
    loadTemplates();
    setShowImporter(false);
    if (count > 0) {
      alert(`✅ ${count} templates importados com sucesso!`);
    }
  };

  const handleSyncComplete = (result) => {
    console.log('Sincronização concluída:', result);
    loadTemplates();
    if (result && result.results && result.results.success) {
      alert(`✅ Sincronização concluída! ${result.results.success.length} templates enviados.`);
    } else if (result && result.total) {
      alert(`✅ ${result.total} templates sincronizados do Supabase.`);
    }
  };

  const handleViewTemplate = (clientId) => {
    const { templates: allTemplates } = loadTemplatesFromStorage();
    const template = allTemplates[clientId];
    if (template) {
      setSelectedTemplate(template);
    }
  };

  const handleCloseTemplate = () => {
    setSelectedTemplate(null);
  };

  const handleDeleteTemplate = (clientId) => {
    if (!window.confirm('Tem certeza que deseja remover este template?')) return;
    
    const { templates: allTemplates } = loadTemplatesFromStorage();
    delete allTemplates[clientId];
    localStorage.setItem('fims_templates', JSON.stringify(allTemplates));
    
    // Atualizar lista de clientes
    const clients = Object.keys(allTemplates).map(key => ({
      id: allTemplates[key].clientId,
      name: allTemplates[key].clientName,
      sections: allTemplates[key].sections.length,
      items: allTemplates[key].totalItems,
      lastUpdated: allTemplates[key].lastUpdated
    }));
    localStorage.setItem('fims_template_clients', JSON.stringify(clients));
    
    loadTemplates();
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="templates-page">
      <div className="page-header">
        <div>
          <div className="page-title">📋 Templates de Inspeção</div>
          <div className="page-sub">
            {stats.total} clientes • {stats.totalSections} secções • {stats.totalItems} itens
          </div>
        </div>
        <div className="header-actions">
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setShowSync(!showSync)}
          >
            <Icon name="cloud" size={13} />
            {showSync ? 'Fechar Sincronização' : '☁️ Sincronizar'}
          </button>
          <button 
            className="btn btn-primary btn-sm"
            onClick={() => setShowImporter(!showImporter)}
          >
            <Icon name="upload" size={13} />
            {showImporter ? 'Fechar' : 'Importar Excel'}
          </button>
        </div>
      </div>

      {showImporter && (
        <TemplateImporter onImportComplete={handleImportComplete} />
      )}

      {showSync && (
        <SupabaseSync onSyncComplete={handleSyncComplete} />
      )}

      {/* Modal de detalhes do template */}
      {selectedTemplate && (
        <div className="modal-overlay" onClick={handleCloseTemplate}>
          <div className="modal template-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selectedTemplate.clientName}</div>
              <button className="icon-btn" onClick={handleCloseTemplate}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <span className="badge badge-ok">Versão: {selectedTemplate.version}</span>
                <span className="badge badge-progress">
                  Atualizado: {new Date(selectedTemplate.lastUpdated).toLocaleDateString('pt-PT')}
                </span>
                <span className="badge">{selectedTemplate.totalItems} itens</span>
              </div>
              
              {selectedTemplate.sections.map((section, idx) => (
                <div key={section.id} style={{ marginBottom: 16 }}>
                  <div style={{ 
                    fontSize: 14, 
                    fontWeight: 600, 
                    color: '#1E2A3A',
                    padding: '8px 0',
                    borderBottom: '1px solid #E5E7EB',
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span>{section.title}</span>
                    <span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>
                      {section.items.length} itens
                    </span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {section.items.map(item => (
                      <li key={item.id} style={{ 
                        fontSize: 13, 
                        color: '#4B5563',
                        padding: '4px 0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>{item.label}</span>
                        {item.weight > 1 && (
                          <span style={{ 
                            fontSize: 11, 
                            color: '#888',
                            background: '#F3F4F6',
                            padding: '1px 10px',
                            borderRadius: 10
                          }}>
                            Peso: {item.weight}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseTemplate}>Fechar</button>
              <button 
                className="btn btn-danger" 
                onClick={() => {
                  handleDeleteTemplate(selectedTemplate.clientId);
                  handleCloseTemplate();
                }}
              >
                <Icon name="trash" size={14} /> Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid de templates */}
      <div className="templates-grid">
        {filteredTemplates.map(template => (
          <div key={template.id} className="template-card">
            <div className="template-card-header">
              <h3 className="client-name" title={template.name}>
                {template.name}
              </h3>
              <span className="badge">{template.sections} secções</span>
            </div>
            <div className="template-card-body">
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>{template.items}</strong> itens de inspeção
              </p>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px 0' }}>
                Atualizado: {new Date(template.lastUpdated).toLocaleDateString('pt-PT')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleViewTemplate(template.id)}
                >
                  👁️ Ver detalhes
                </button>
                <button 
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDeleteTemplate(template.id)}
                  style={{ padding: '4px 10px' }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
          <p style={{ fontSize: 16, color: '#4B5563', margin: 0 }}>
            {searchTerm ? 'Nenhum cliente encontrado com esse termo.' : 'Nenhum template carregado.'}
          </p>
          <p style={{ color: '#888', fontSize: 14 }}>
            {searchTerm ? 'Tente outro termo de busca.' : 'Clique em "Importar Excel" para carregar os templates do arquivo.'}
          </p>
        </div>
      )}

      <style>{`
        .templates-page {
          padding: 0;
        }
        
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 20px;
        }
        
        .page-title {
          font-size: 18px;
          font-weight: 600;
          color: #1E2A3A;
        }
        
        .page-sub {
          font-size: 13px;
          color: #888;
          margin-top: 2px;
        }
        
        .header-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        
        .search-input {
          padding: 8px 14px;
          border: 1px solid #D1D5DB;
          border-radius: 6px;
          font-size: 13px;
          min-width: 200px;
          background: white;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }
        
        .template-card {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 16px 18px;
          transition: all 0.2s ease;
        }
        
        .template-card:hover {
          border-color: #3B82F6;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        
        .template-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .client-name {
          margin: 0;
          font-size: 15px;
          font-weight: 500;
          color: #1E2A3A;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 160px;
        }
        
        .badge {
          background: #F3F4F6;
          padding: 2px 12px;
          border-radius: 12px;
          font-size: 11px;
          color: #4B5563;
          font-weight: 500;
          white-space: nowrap;
        }
        
        .badge-ok {
          background: #D1FAE5;
          color: #065F46;
        }
        
        .badge-progress {
          background: #DBEAFE;
          color: #1E40AF;
        }
        
        .template-card-body {
          color: #6B7280;
          font-size: 13px;
        }
        
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
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
          background: #FEF2F2;
          color: #DC2626;
        }
        
        .btn-danger:hover {
          background: #FEE2E2;
        }
        
        .btn-sm {
          padding: 4px 12px;
          font-size: 12px;
        }
        
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: #F9FAFB;
          border-radius: 12px;
          border: 1px dashed #D1D5DB;
        }
        
        .template-detail-modal {
          max-width: 700px !important;
          max-height: 90vh;
        }
        
        .template-detail-modal .modal-body {
          padding: 16px 20px;
        }
        
        @media (max-width: 600px) {
          .page-header {
            flex-direction: column;
          }
          
          .header-actions {
            width: 100%;
          }
          
          .search-input {
            min-width: 100%;
          }
          
          .templates-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// AUDIT PAGE
// ============================================================
export function AuditPage({ auditLogs }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  let filtered = auditLogs;
  if (filter !== 'all') {
    filtered = filtered.filter(log => log.type === filter);
  }
  if (search) {
    const term = search.toLowerCase();
    filtered = filtered.filter(log => 
      log.user.toLowerCase().includes(term) || 
      log.action.toLowerCase().includes(term) ||
      log.detail.toLowerCase().includes(term)
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Registo de Auditoria</div>
          <div className="page-sub">{auditLogs.length} registos • {filtered.length} filtrados</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }}
          />
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, background: 'white' }}
          >
            <option value="all">Todos</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="schedule">Agendamento</option>
            <option value="notification">Notificações</option>
            <option value="capa_alert">Alertas CAPA</option>
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Utilizador</th>
              <th>Ação</th>
              <th>Tipo</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
                {search ? 'Nenhum registo encontrado com esse termo.' : 'Nenhum registo ainda.'}
              </td></tr>
            )}
            {filtered.map(log => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  {new Date(log.timestamp).toLocaleString('pt-PT')}
                </td>
                <td style={{ fontWeight: 500 }}>{log.user}</td>
                <td>{log.action}</td>
                <td>
                  <span className={`badge ${
                    log.type === 'login' ? 'badge-ok' : 
                    log.type === 'logout' ? 'badge-closed' : 
                    log.type === 'capa_alert' ? 'badge-danger' : 
                    'badge-progress'
                  }`}>
                    {log.type}
                  </span>
                </td>
                <td style={{ fontSize: 13, color: '#4B5563' }}>{log.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS PAGE
// ============================================================
export function SettingsPage() {
  const fileInputRef = useRef(null);
  const [backupSize, setBackupSize] = useState(null);

  const getStorageSize = () => {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length * 2; // UTF-16
      }
    }
    return total;
  };

  const handleExport = () => {
    const backupData = {
      fims_inspections: JSON.parse(localStorage.getItem("fims_inspections") || "[]"),
      fims_users: JSON.parse(localStorage.getItem("fims_users") || "[]"),
      fims_locations: JSON.parse(localStorage.getItem("fims_locations") || "[]"),
      fims_logs: JSON.parse(localStorage.getItem("fims_logs") || "[]"),
      fims_notifs: JSON.parse(localStorage.getItem("fims_notifs") || "[]"),
      fims_messages: JSON.parse(localStorage.getItem("fims_messages") || "[]"),
      fims_announcements: JSON.parse(localStorage.getItem("fims_announcements") || "[]"),
      fims_dismissed: JSON.parse(localStorage.getItem("fims_dismissed") || "[]"),
      fims_current_user: JSON.parse(localStorage.getItem("fims_current_user") || "null"),
      fims_templates: JSON.parse(localStorage.getItem("fims_templates") || "{}"),
      fims_template_clients: JSON.parse(localStorage.getItem("fims_template_clients") || "[]"),
      exportDate: new Date().toISOString(),
      version: "FIMS v1.0.0"
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `FIMS_Backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm("⚠️ ATENÇÃO: Restaurar um backup irá SOBRESCREVER todos os dados atuais. Tem certeza?")) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        
        // Restaurar todos os dados
        Object.keys(data).forEach(key => {
          if (key !== "exportDate" && key !== "version" && data[key] !== null && data[key] !== undefined) {
            localStorage.setItem(key, JSON.stringify(data[key]));
          }
        });

        alert("✅ Backup restaurado com sucesso! A aplicação vai recarregar.");
        window.location.reload();
      } catch (err) {
        alert("❌ Erro: Arquivo de backup inválido.");
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearTemplates = () => {
    if (!window.confirm("⚠️ Tem certeza que deseja remover TODOS os templates importados?")) return;
    localStorage.removeItem('fims_templates');
    localStorage.removeItem('fims_template_clients');
    alert("Templates removidos com sucesso.");
    window.location.reload();
  };

  const handleClearAll = () => {
    if (!window.confirm("⚠️ ATENÇÃO: Isso irá apagar TODOS os dados (inspeções, utilizadores, templates, etc.). Tem certeza?")) return;
    if (!window.confirm("⚠️ ÚLTIMO AVISO: Esta ação é IRREVERSÍVEL. Continuar?")) return;
    localStorage.clear();
    alert("Todos os dados foram removidos. A aplicação vai recarregar.");
    window.location.reload();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">⚙️ Configurações do Sistema</div>
          <div className="page-sub">Backup, recuperação e gestão de dados</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12, color: "#1E2A3A" }}>💾 Backup & Recovery</h3>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          Faça o download de um ficheiro de backup completo com todos os dados (inspeções, utilizadores, templates, logs, etc.). 
          Guarde este ficheiro num local seguro. Se perder os dados, pode restaurá-los instantaneamente.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={handleExport}>
            <Icon name="download" size={14} /> Download Backup (.json)
          </button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>
            <Icon name="upload" size={14} /> Restaurar Backup
          </button>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12, color: "#1E2A3A" }}>📊 Estatísticas</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {[
            ["Inspeções", JSON.parse(localStorage.getItem("fims_inspections") || "[]").length],
            ["Utilizadores", JSON.parse(localStorage.getItem("fims_users") || "[]").length],
            ["Localizações", JSON.parse(localStorage.getItem("fims_locations") || "[]").length],
            ["Templates", JSON.parse(localStorage.getItem("fims_template_clients") || "[]").length],
            ["Registos", JSON.parse(localStorage.getItem("fims_logs") || "[]").length],
            ["Armazenamento", (getStorageSize() / 1024).toFixed(1) + ' KB']
          ].map(([k, v]) => (
            <div key={k} style={{ background: "#F8F7F4", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#888" }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 12, color: "#1E2A3A" }}>🗑️ Gestão de Dados</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button className="btn btn-danger" onClick={handleClearTemplates}>
            <Icon name="trash" size={14} /> Remover Todos os Templates
          </button>
          <button className="btn btn-danger" onClick={handleClearAll} style={{ background: '#DC2626' }}>
            <Icon name="trash" size={14} /> 🔴 Apagar Todos os Dados
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#888", marginTop: 12 }}>
          ⚠️ Estas ações são irreversíveis. Faça um backup antes de proceder.
        </p>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12, color: "#1E2A3A" }}>ℹ️ Informação do Sistema</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {[
            ["Versão", "FIMS v1.0.0"],
            ["Ambiente", "Produção (Frontend)"],
            ["Base de Dados", "LocalStorage + Supabase"],
            ["Stack", "React + Vite"],
            ["Templates", JSON.parse(localStorage.getItem("fims_template_clients") || "[]").length + " clientes"]
          ].map(([k, v]) => (
            <div key={k} style={{ background: "#F8F7F4", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#888" }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
