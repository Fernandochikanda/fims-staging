// /src/pages/Management/TemplateImporter.jsx
import { useState } from 'react';
import { processExcelTemplates, saveTemplatesToStorage } from '../../utils/excelTemplateImporter';

export function TemplateImporter({ onImportComplete }) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [processedSheets, setProcessedSheets] = useState(0);
  const [totalSheets, setTotalSheets] = useState(0);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Verificar se é um arquivo Excel
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.oasis.opendocument.spreadsheet'
      ];
      
      if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
        setStatusMessage('❌ Por favor, selecione um arquivo Excel válido (.xlsx ou .xls)');
        return;
      }
      
      setSelectedFile(file);
      setResults(null);
      setStatusMessage(`📄 Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      setProcessedSheets(0);
      setTotalSheets(0);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      setStatusMessage('⚠️ Por favor, selecione um arquivo primeiro.');
      return;
    }

    setImporting(true);
    setProgress(5);
    setStatusMessage('⏳ Processando arquivo...');

    try {
      const result = await processExcelTemplates(selectedFile);
      
      const { templates, errors, clientList, totalSheets, processed } = result;
      
      setTotalSheets(totalSheets || 0);
      setProcessedSheets(processed || 0);
      
      setProgress(50);
      setStatusMessage(`⏳ Processados ${Object.keys(templates).length} templates...`);

      if (Object.keys(templates).length === 0) {
        throw new Error('Nenhum template válido foi encontrado no arquivo. Verifique o formato.');
      }

      // Salvar templates
      setProgress(70);
      const savedClients = saveTemplatesToStorage(templates);
      setProgress(90);
      setStatusMessage(`✅ ${savedClients.length} templates salvos com sucesso!`);

      setProgress(100);
      setResults({
        success: true,
        imported: Object.keys(templates).length,
        errors: errors || [],
        clients: savedClients,
        totalSheets: totalSheets || 0,
        processed: processed || 0
      });
      setStatusMessage(`✅ Importação concluída! ${Object.keys(templates).length} templates importados.`);

      if (onImportComplete) {
        setTimeout(() => onImportComplete(Object.keys(templates).length), 500);
      }

    } catch (error) {
      console.error('Erro na importação:', error);
      setResults({
        success: false,
        error: error.message || 'Erro desconhecido durante a importação'
      });
      setStatusMessage(`❌ Erro: ${error.message}`);
      setProgress(0);
    } finally {
      setImporting(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setResults(null);
    setStatusMessage('');
    setProcessedSheets(0);
    setTotalSheets(0);
    if (onImportComplete) {
      onImportComplete(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect({ target: { files: [file] } });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="template-importer">
      <div className="importer-header">
        <h3>📤 Importar Templates do Excel</h3>
        <p className="text-muted">
          Importe todos os templates de clientes do arquivo "Mapa Controle de Qualidade(1).xls"
        </p>
        <p className="text-hint">
          ⚡ O processo pode levar alguns segundos. Aguarde até a conclusão.
        </p>
      </div>

      <div className="importer-content">
        <div className="file-upload-section">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="excelFileInput"
          />
          <label 
            htmlFor="excelFileInput" 
            className={`upload-area ${selectedFile ? 'has-file' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            {selectedFile ? (
              <div className="file-info">
                <span className="file-icon">📄</span>
                <span className="file-name">{selectedFile.name}</span>
                <span className="file-size">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                {!importing && (
                  <button 
                    className="remove-file" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedFile(null);
                      setResults(null);
                      setStatusMessage('');
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">📂</span>
                <p>Clique ou arraste o arquivo Excel</p>
                <p className="hint">Suporta .xlsx e .xls</p>
              </div>
            )}
          </label>
        </div>

        {statusMessage && (
          <div className={`status-message ${results ? (results.success ? 'success' : 'error') : 'info'}`}>
            {statusMessage}
          </div>
        )}

        {importing && (
          <div className="importing-status">
            <div className="spinner"></div>
            <div className="progress-info">
              <span>Processando... {progress}%</span>
              {totalSheets > 0 && (
                <span className="sheet-info">{processedSheets || 0} de {totalSheets} sheets processadas</span>
              )}
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="actions-row">
          {selectedFile && !importing && !results && (
            <>
              <button className="btn btn-primary" onClick={handleImport}>
                <span className="btn-icon">⬆</span>
                Importar Templates
              </button>
              <button className="btn btn-secondary" onClick={handleCancel}>
                Cancelar
              </button>
            </>
          )}

          {results && results.success && !importing && (
            <button className="btn btn-secondary" onClick={handleCancel}>
              Fechar
            </button>
          )}
        </div>

        {results && results.success && (
          <div className="results success">
            <div className="result-header">
              <span className="result-icon">✅</span>
              <h4>Importação Concluída!</h4>
            </div>
            <p className="result-count">
              {results.imported} templates de clientes importados com sucesso.
              {results.totalSheets > 0 && ` (${results.processed} de ${results.totalSheets} sheets processadas)`}
            </p>
            
            {results.errors && results.errors.length > 0 && (
              <div className="warnings">
                <h5>⚠️ Avisos ({results.errors.length})</h5>
                <ul>
                  {results.errors.slice(0, 15).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {results.errors.length > 15 && (
                    <li>... e mais {results.errors.length - 15} avisos</li>
                  )}
                </ul>
              </div>
            )}
            
            <div className="client-list-summary">
              <h5>Clientes Importados:</h5>
              <div className="client-grid">
                {results.clients.slice(0, 30).map(client => (
                  <div key={client.id} className="client-card">
                    <div className="client-name" title={client.name}>
                      {client.name.length > 25 ? client.name.substring(0, 25) + '...' : client.name}
                    </div>
                    <div className="client-stats">
                      <span>{client.sections || 0} secções</span>
                      <span>{client.items || 0} itens</span>
                    </div>
                  </div>
                ))}
                {results.clients.length > 30 && (
                  <div className="client-card more">
                    + {results.clients.length - 30} outros clientes
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {results && !results.success && (
          <div className="results error">
            <div className="result-header">
              <span className="result-icon">❌</span>
              <h4>Erro na Importação</h4>
            </div>
            <p>{results.error}</p>
            <p className="error-hint">
              💡 Verifique se o arquivo não está corrompido e tente novamente.
              Se o problema persistir, tente converter o arquivo para .xlsx.
            </p>
          </div>
        )}
      </div>

      <style>{`
        .template-importer {
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 24px;
          margin: 16px 0;
        }
        
        .importer-header {
          margin-bottom: 20px;
        }
        
        .importer-header h3 {
          margin: 0 0 4px 0;
          font-size: 18px;
        }
        
        .text-muted {
          color: #6B7280;
          font-size: 14px;
          margin: 0;
        }
        
        .text-hint {
          color: #6B7280;
          font-size: 13px;
          margin: 4px 0 0 0;
        }
        
        .file-upload-section {
          margin-bottom: 16px;
        }
        
        .upload-area {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 24px;
          border: 2px dashed #D1D5DB;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          min-height: 100px;
        }
        
        .upload-area:hover {
          border-color: #3B82F6;
          background: #F3F4F6;
        }
        
        .upload-area.has-file {
          border-color: #10B981;
          background: #ECFDF5;
        }
        
        .upload-placeholder {
          text-align: center;
          color: #6B7280;
        }
        
        .upload-icon {
          font-size: 32px;
          display: block;
          margin-bottom: 8px;
        }
        
        .upload-placeholder p {
          margin: 4px 0;
        }
        
        .upload-placeholder .hint {
          font-size: 12px;
          color: #9CA3AF;
        }
        
        .file-info {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 500;
          width: 100%;
          justify-content: center;
        }
        
        .file-icon {
          font-size: 24px;
        }
        
        .file-name {
          color: #1F2937;
        }
        
        .file-size {
          color: #6B7280;
          font-size: 12px;
        }
        
        .remove-file {
          background: none;
          border: none;
          color: #EF4444;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
        }
        
        .remove-file:hover {
          color: #DC2626;
        }
        
        .status-message {
          padding: 10px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        
        .status-message.success {
          background: #ECFDF5;
          color: #065F46;
          border: 1px solid #10B981;
        }
        
        .status-message.error {
          background: #FEF2F2;
          color: #991B1B;
          border: 1px solid #EF4444;
        }
        
        .status-message.info {
          background: #EFF6FF;
          color: #1E40AF;
          border: 1px solid #3B82F6;
        }
        
        .actions-row {
          display: flex;
          gap: 12px;
          margin: 16px 0;
        }
        
        .btn {
          padding: 10px 24px;
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
        
        .btn-primary:hover {
          background: #2D3A4A;
        }
        
        .btn-primary:disabled {
          background: #93C5FD;
          cursor: not-allowed;
        }
        
        .btn-secondary {
          background: #E5E7EB;
          color: #374151;
        }
        
        .btn-secondary:hover {
          background: #D1D5DB;
        }
        
        .btn-icon {
          font-size: 16px;
        }
        
        .importing-status {
          padding: 16px;
          background: #F3F4F6;
          border-radius: 8px;
          margin: 16px 0;
        }
        
        .importing-status .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid #E5E7EB;
          border-top-color: #3B82F6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 12px auto;
          display: block;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: #4B5563;
          margin-bottom: 8px;
        }
        
        .sheet-info {
          color: #6B7280;
          font-size: 12px;
        }
        
        .progress-bar {
          width: 100%;
          height: 8px;
          background: #E5E7EB;
          border-radius: 4px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          background: #3B82F6;
          transition: width 0.5s ease;
          border-radius: 4px;
        }
        
        .results {
          margin-top: 16px;
          padding: 16px;
          border-radius: 8px;
        }
        
        .results.success {
          background: #ECFDF5;
          border: 1px solid #10B981;
        }
        
        .results.error {
          background: #FEF2F2;
          border: 1px solid #EF4444;
        }
        
        .result-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        
        .result-icon {
          font-size: 24px;
        }
        
        .result-header h4 {
          margin: 0;
          font-size: 16px;
        }
        
        .result-count {
          margin: 0 0 12px 0;
          color: #065F46;
        }
        
        .error-hint {
          color: #6B7280;
          font-size: 13px;
          margin-top: 8px;
        }
        
        .warnings {
          background: #FFFBEB;
          border: 1px solid #FCD34D;
          border-radius: 6px;
          padding: 12px 16px;
          margin: 12px 0;
        }
        
        .warnings h5 {
          margin: 0 0 6px 0;
          color: #92400E;
          font-size: 14px;
        }
        
        .warnings ul {
          margin: 0;
          padding-left: 20px;
          color: #78350F;
          font-size: 13px;
          max-height: 100px;
          overflow-y: auto;
        }
        
        .client-list-summary {
          margin-top: 12px;
        }
        
        .client-list-summary h5 {
          margin: 0 0 8px 0;
          font-size: 14px;
        }
        
        .client-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 8px;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .client-card {
          background: white;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #E5E7EB;
          font-size: 13px;
        }
        
        .client-card.more {
          text-align: center;
          color: #6B7280;
          font-weight: 500;
          background: #F3F4F6;
        }
        
        .client-name {
          font-weight: 500;
          color: #1F2937;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .client-stats {
          display: flex;
          gap: 8px;
          font-size: 11px;
          color: #6B7280;
        }
        
        .client-stats span {
          background: #F3F4F6;
          padding: 1px 8px;
          border-radius: 10px;
        }
        
        @media (max-width: 600px) {
          .template-importer {
            padding: 16px;
          }
          
          .client-grid {
            grid-template-columns: 1fr;
          }
          
          .actions-row {
            flex-direction: column;
          }
          
          .btn {
            justify-content: center;
          }
          
          .progress-info {
            flex-direction: column;
            align-items: center;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  );
}
