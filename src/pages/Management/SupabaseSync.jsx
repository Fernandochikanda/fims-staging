// /src/pages/Management/SupabaseSync.jsx
import { useState, useEffect } from 'react';
import { templateService } from '../../services/templateService';
import { supabase } from '../../lib/supabase';

export function SupabaseSync({ onSyncComplete }) {
  const [isConnected, setIsConnected] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [progress, setProgress] = useState({ processed: 0, total: 0, success: 0, failed: 0 });
  const [localTemplates, setLocalTemplates] = useState({});
  const [supabaseTemplates, setSupabaseTemplates] = useState({});

  useEffect(() => {
    checkConnection();
    loadLocalTemplates();
    loadSupabaseTemplates();
  }, []);

  const checkConnection = async () => {
    const result = await templateService.checkConnection();
    setIsConnected(result.success);
  };

  const loadLocalTemplates = () => {
    const templates = JSON.parse(localStorage.getItem('fims_templates') || '{}');
    const clients = JSON.parse(localStorage.getItem('fims_template_clients') || '[]');
    setLocalTemplates({ templates, clients });
  };

  const loadSupabaseTemplates = async () => {
    const result = await templateService.fetchAllTemplates();
    if (result.success) {
      setSupabaseTemplates({ templates: result.templates, clients: result.clients });
    }
  };

  const handleSyncToSupabase = async () => {
    setIsLoading(true);
    setSyncStatus(null);
    setProgress({ processed: 0, total: 0, success: 0, failed: 0 });

    try {
      // Configurar callback de progresso
      templateService.setProgressCallback((p) => {
        setProgress(p);
      });

      const result = await templateService.syncLocalTemplates();

      if (result.success) {
        setSyncStatus({
          type: 'success',
          message: `✅ Sincronização concluída! ${result.results.success.length} templates enviados com sucesso.`,
          details: result.results
        });
        await loadSupabaseTemplates();
        if (onSyncComplete) onSyncComplete(result);
      } else {
        setSyncStatus({
          type: 'error',
          message: `❌ Erro ao sincronizar: ${result.error}`
        });
      }
    } catch (error) {
      setSyncStatus({
        type: 'error',
        message: `❌ Erro: ${error.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncFromSupabase = async () => {
    setIsLoading(true);
    setSyncStatus(null);

    try {
      const result = await templateService.syncSupabaseToLocal();

      if (result.success) {
        setSyncStatus({
          type: 'success',
          message: `✅ Sincronização concluída! ${result.total} templates baixados do Supabase.`
        });
        loadLocalTemplates();
        if (onSyncComplete) onSyncComplete(result);
      } else {
        setSyncStatus({
          type: 'error',
          message: `❌ Erro ao sincronizar: ${result.error}`
        });
      }
    } catch (error) {
      setSyncStatus({
        type: 'error',
        message: `❌ Erro: ${error.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAllSupabase = async () => {
    if (!window.confirm('⚠️ Tem certeza que deseja remover TODOS os templates do Supabase?')) return;
    if (!window.confirm('⚠️ Esta ação é irreversível. Continuar?')) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('fims_templates')
        .delete()
        .neq('client_id', '');

      if (error) throw error;

      setSyncStatus({
        type: 'success',
        message: '✅ Todos os templates foram removidos do Supabase.'
      });
      await loadSupabaseTemplates();
    } catch (error) {
      setSyncStatus({
        type: 'error',
        message: `❌ Erro ao remover: ${error.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const localCount = localTemplates.clients ? localTemplates.clients.length : 0;
  const supabaseCount = supabaseTemplates.clients ? supabaseTemplates.clients.length : 0;

  return (
    <div className="supabase-sync">
      <div className="sync-header">
        <h3>☁️ Sincronização com Supabase</h3>
        <div className="connection-status">
          Status: 
          <span className={`status-badge ${isConnected === true ? 'connected' : isConnected === false ? 'disconnected' : 'checking'}`}>
            {isConnected === true ? '✅ Conectado' : isConnected === false ? '❌ Desconectado' : '⏳ Verificando...'}
          </span>
        </div>
      </div>

      <div className="sync-stats">
        <div className="stat-card">
          <div className="stat-label">Templates Locais</div>
          <div className="stat-value">{localCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Templates na Nuvem</div>
          <div className="stat-value">{supabaseCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Diferença</div>
          <div className="stat-value" style={{ color: localCount !== supabaseCount ? '#F59E0B' : '#10B981' }}>
            {Math.abs(localCount - supabaseCount)}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="progress-container">
          <div className="progress-info">
            <span>Sincronizando...</span>
            <span>{progress.processed} / {progress.total}</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ 
                width: progress.total > 0 ? `${(progress.processed / progress.total) * 100}%` : '0%' 
              }} 
            />
          </div>
          {progress.success > 0 && (
            <div className="progress-details">
              <span className="success">✅ {progress.success} sucessos</span>
              {progress.failed > 0 && (
                <span className="failed">❌ {progress.failed} falhas</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="sync-actions">
        <button 
          className="btn btn-primary" 
          onClick={handleSyncToSupabase}
          disabled={isLoading || localCount === 0}
        >
          <span className="btn-icon">⬆</span>
          Enviar para Supabase
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={handleSyncFromSupabase}
          disabled={isLoading || supabaseCount === 0}
        >
          <span className="btn-icon">⬇</span>
          Baixar do Supabase
        </button>
        <button 
          className="btn btn-danger" 
          onClick={handleDeleteAllSupabase}
          disabled={isLoading || supabaseCount === 0}
        >
          <span className="btn-icon">🗑️</span>
          Limpar Nuvem
        </button>
      </div>

      {syncStatus && (
        <div className={`sync-status ${syncStatus.type}`}>
          <p>{syncStatus.message}</p>
          {syncStatus.details && (
            <div className="sync-details">
              <div>Enviados: {syncStatus.details.success.length}</div>
              {syncStatus.details.failed.length > 0 && (
                <div className="failed-list">
                  <strong>Falhas:</strong>
                  <ul>
                    {syncStatus.details.failed.map((f, i) => (
                      <li key={i}>{f.name}: {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isConnected === false && (
        <div className="connection-error">
          <p>⚠️ Não foi possível conectar ao Supabase. Verifique:</p>
          <ul>
            <li>As credenciais no arquivo .env</li>
            <li>Se o projeto Supabase está ativo</li>
            <li>As tabelas foram criadas no Supabase</li>
          </ul>
        </div>
      )}

      <style>{`
        .supabase-sync {
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 24px;
          margin: 16px 0;
        }

        .sync-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .sync-header h3 {
          margin: 0;
        }

        .connection-status {
          font-size: 14px;
          color: #6B7280;
        }

        .status-badge {
          margin-left: 8px;
          padding: 4px 12px;
          border-radius: 12px;
          font-weight: 500;
        }

        .status-badge.connected {
          background: #D1FAE5;
          color: #065F46;
        }

        .status-badge.disconnected {
          background: #FEE2E2;
          color: #991B1B;
        }

        .status-badge.checking {
          background: #E5E7EB;
          color: #4B5563;
        }

        .sync-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: white;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
          text-align: center;
        }

        .stat-label {
          font-size: 12px;
          color: #6B7280;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 600;
          color: #1E2A3A;
        }

        .progress-container {
          margin: 16px 0;
          padding: 16px;
          background: white;
          border-radius: 8px;
          border: 1px solid #E5E7EB;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: #4B5563;
          margin-bottom: 8px;
        }

        .progress-details {
          display: flex;
          gap: 16px;
          margin-top: 8px;
          font-size: 13px;
        }

        .progress-details .success {
          color: #065F46;
        }

        .progress-details .failed {
          color: #991B1B;
        }

        .sync-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin: 16px 0;
        }

        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }

        .btn-primary {
          background: #1E2A3A;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #2D3A4A;
        }

        .btn-secondary {
          background: #E5E7EB;
          color: #374151;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #D1D5DB;
        }

        .btn-danger {
          background: #FEE2E2;
          color: #991B1B;
        }

        .btn-danger:hover:not(:disabled) {
          background: #FECACA;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-icon {
          font-size: 16px;
        }

        .sync-status {
          margin-top: 16px;
          padding: 16px;
          border-radius: 8px;
        }

        .sync-status.success {
          background: #ECFDF5;
          border: 1px solid #10B981;
        }

        .sync-status.error {
          background: #FEF2F2;
          border: 1px solid #EF4444;
        }

        .sync-status p {
          margin: 0 0 8px 0;
        }

        .sync-details {
          font-size: 14px;
        }

        .failed-list {
          margin-top: 8px;
        }

        .failed-list ul {
          margin: 4px 0;
          padding-left: 20px;
          color: #991B1B;
        }

        .connection-error {
          margin-top: 16px;
          padding: 16px;
          background: #FEF2F2;
          border: 1px solid #EF4444;
          border-radius: 8px;
        }

        .connection-error ul {
          margin: 8px 0;
          padding-left: 20px;
        }

        @media (max-width: 600px) {
          .sync-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .sync-actions {
            flex-direction: column;
          }

          .btn {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
