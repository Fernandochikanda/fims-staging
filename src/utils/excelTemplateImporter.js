// /src/utils/excelTemplateImporter.js
import * as XLSX from 'xlsx';

/**
 * Processa os dados do Excel e extrai os templates por cliente
 * Versão otimizada para arquivos grandes
 */
export function processExcelTemplates(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellDates: false,
          cellText: false,
          cellNF: false
        });
        
        const templates = {};
        const errors = [];
        const clientList = [];
        const totalSheets = workbook.SheetNames.length;
        
        // Processar cada sheet (cliente) com limite de tempo
        let processed = 0;
        
        workbook.SheetNames.forEach((sheetName) => {
          try {
            // Pular sheets vazias ou com nomes especiais
            if (!sheetName || sheetName.trim() === '' || sheetName.includes('metadata')) {
              return;
            }
            
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet || !worksheet['!ref']) {
              errors.push(`Sheet "${sheetName}" está vazia`);
              return;
            }
            
            // Converter para JSON com opções otimizadas
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
              header: 1,
              defval: '',
              blankrows: false
            });
            
            if (!jsonData || jsonData.length < 3) {
              errors.push(`Sheet "${sheetName}" não tem dados suficientes`);
              return;
            }
            
            // Extrair dados do template
            const template = extractTemplateFromSheet(sheetName, jsonData);
            if (template && template.sections && template.sections.length > 0) {
              templates[template.clientId] = template;
              clientList.push({
                id: template.clientId,
                name: template.clientName,
                sections: template.sections.length,
                items: template.totalItems || 0
              });
            } else {
              errors.push(`Sheet "${sheetName}" não tem itens válidos`);
            }
            
            processed++;
            
          } catch (error) {
            errors.push(`Erro ao processar "${sheetName}": ${error.message}`);
            console.error(`Erro na sheet ${sheetName}:`, error);
          }
        });
        
        // Verificar se pelo menos um template foi processado
        if (Object.keys(templates).length === 0 && errors.length > 0) {
          reject(new Error(`Nenhum template foi processado. Erros: ${errors.join(', ')}`));
          return;
        }
        
        resolve({ templates, errors, clientList, totalSheets, processed });
        
      } catch (error) {
        reject(new Error(`Erro ao ler o arquivo: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo. Verifique se o arquivo não está corrompido.'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extrai o template de uma sheet do Excel
 */
function extractTemplateFromSheet(sheetName, data) {
  if (!data || data.length < 3) return null;
  
  // Nome do cliente (primeira linha com texto)
  let clientName = sheetName;
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (row && row[0] && String(row[0]).trim().length > 0) {
      const firstCell = String(row[0]).trim();
      if (!firstCell.includes('Relatório') && 
          !firstCell.includes('Sistemas') &&
          !firstCell.includes('DATA') &&
          firstCell.length > 2) {
        clientName = firstCell;
        break;
      }
    }
  }
  
  let sections = [];
  let currentSection = null;
  let isProcessingItems = false;
  
  // Encontrar onde começam os dados relevantes
  let startIndex = 0;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const firstCell = String(row[0] || '').trim().toUpperCase();
    if (firstCell.includes('PESSOAL') || firstCell.includes('LIMPEZAS') || 
        firstCell.includes('EXTERIOR') || firstCell.includes('INTERIOR')) {
      startIndex = i;
      break;
    }
  }
  
  // Processar linhas
  for (let i = startIndex; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const firstCell = String(row[0] || '').trim();
    const fullRow = row.filter(cell => String(cell).trim()).join(' ');
    
    // Verificar se é o fim do template
    const upperFirst = firstCell.toUpperCase();
    if (upperFirst.includes('PONTUAÇÃO TOTAL') || 
        upperFirst.includes('TOTAL') ||
        upperFirst.includes('ASSINATURA') ||
        (upperFirst.includes('PONTUAÇÃO') && fullRow.includes('TOTAL'))) {
      if (currentSection && currentSection.items.length > 0) {
        sections.push(currentSection);
        currentSection = null;
      }
      break;
    }
    
    // Se for um cabeçalho de seção
    if (isSectionHeader(firstCell, fullRow)) {
      if (currentSection && currentSection.items.length > 0) {
        sections.push(currentSection);
      }
      
      const title = cleanSectionTitle(firstCell);
      currentSection = {
        id: `section_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        title: title || 'Geral',
        items: []
      };
      isProcessingItems = true;
      continue;
    }
    
    // Se estamos processando itens
    if (isProcessingItems && currentSection) {
      const isValidItem = isValidInspectionItem(firstCell, fullRow);
      
      if (isValidItem && firstCell.length > 5) {
        const label = cleanItemLabel(firstCell);
        
        if (label.length > 3) {
          const exists = currentSection.items.some(item => item.label === label);
          if (!exists) {
            const weight = extractWeightFromRow(row);
            currentSection.items.push({
              id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              label: label,
              weight: weight || 1,
              note: ''
            });
          }
        }
      }
      
      if (firstCell.includes('Pontuação') && !firstCell.includes('TOTAL')) {
        if (currentSection && currentSection.items.length > 0) {
          sections.push(currentSection);
          currentSection = null;
          isProcessingItems = false;
        }
      }
    }
  }
  
  if (currentSection && currentSection.items.length > 0) {
    sections.push(currentSection);
  }
  
  sections = sections.filter(s => s.items && s.items.length > 0);
  
  if (sections.length === 0) {
    const allItems = [];
    for (let i = startIndex; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      const firstCell = String(row[0] || '').trim();
      if (firstCell.length > 10 && isValidInspectionItem(firstCell, '')) {
        const label = cleanItemLabel(firstCell);
        if (label.length > 3) {
          allItems.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            label: label,
            weight: 1,
            note: ''
          });
        }
      }
    }
    if (allItems.length > 0) {
      sections.push({
        id: `section_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        title: 'Inspeção Geral',
        items: allItems
      });
    }
  }
  
  const clientId = `CLIENT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const totalItems = sections.reduce((sum, s) => sum + (s.items ? s.items.length : 0), 0);
  
  if (totalItems === 0) {
    return null;
  }
  
  return {
    clientId: clientId,
    clientName: clientName || sheetName,
    sections: sections,
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    totalItems: totalItems
  };
}

function isSectionHeader(text, fullRow) {
  if (!text) return false;
  
  const upperText = text.toUpperCase().trim();
  
  const headers = [
    'PESSOAL DE LIMPEZAS', 'EXTERIOR', 'INTERIOR', 'GABINETES', 'CARPETE',
    'CHÃO', 'PAREDES', 'MÓVEIS', 'COPAS', 'CASAS DE BANHO', 'CORREDORES',
    'ELEVADORES', 'ESCADAS', 'JARDIM', 'PISCINA', 'RECEPÇÃO', 'SALA DE AULAS',
    'ADMINISTRAÇÃO', 'PARQUE DE ESTACIONAMENTO', 'DEPOSITO DE LIXO', 'DRENOS',
    'GINÁSIO', 'BALNEARIOS', 'ENTRADA', 'RECEPÇÃO E CORREDORES',
    'CHÃO TIJOLEIRAS', 'CHÃO DIFICIL', 'SALA DE JOGOS', 'CENTRO SOCIAL',
    'MÓVEIS E OUTROS DECORATIVOS', 'MÓVEIS E OTROS DECORATIVOS',
    'PESSOAL', 'LIMPEZAS', 'GABINETE', 'ELEVADOR'
  ];
  
  for (const header of headers) {
    if (upperText.includes(header) || header.includes(upperText)) {
      return true;
    }
  }
  
  const words = upperText.split(/\s+/).filter(w => w.length > 1);
  if (words.length >= 3 && upperText === upperText && !text.includes('?')) {
    const itemKeywords = ['limpo', 'livre', 'regularmente', 'manchas', 'poeira', 'teias'];
    const hasKeyword = itemKeywords.some(kw => upperText.includes(kw.toUpperCase()));
    if (!hasKeyword) {
      return true;
    }
  }
  
  return false;
}

function cleanSectionTitle(text) {
  if (!text) return 'Geral';
  let cleaned = text.replace(/^Pontuação\s*/i, '');
  cleaned = cleaned.replace(/^[-\s]+/, '');
  cleaned = cleaned.replace(/^[\d]+[\.\s]+/, '');
  cleaned = cleaned.trim();
  return cleaned || 'Geral';
}

function isValidInspectionItem(text, fullRow) {
  if (!text) return false;
  
  const cleaned = text.trim();
  if (cleaned.length < 5) return false;
  
  const ignorePatterns = [
    /^PONTUAÇÃO/i, /^TOTAL/i, /^DATA/i, /^Sistemas de pontos/i,
    /^Excelente/i, /^Acima da média/i, /^média/i, /^Deficiente/i,
    /^Mau/i, /^Relatório/i, /^inspeção/i, /^PESSOAL/i,
    /^EXTERIOR/i, /^INTERIOR/i, /^GABINETES/i, /^CARPETE/i,
    /^CHÃO/i, /^PAREDES/i, /^MÓVEIS/i, /^COPAS/i,
    /^CASAS DE BANHO/i, /^CORREDORES/i, /^ELEVADORES/i,
    /^ESCADAS/i, /^JARDIM/i, /^PISCINA/i, /^RECEPÇÃO/i,
    /^SALA DE AULAS/i, /^ADMINISTRAÇÃO/i,
    /^PARQUE DE ESTACIONAMENTO/i, /^DEPOSITO DE LIXO/i,
    /^DRENOS/i, /^GINÁSIO/i, /^BALNEARIOS/i, /^ENTRADA/i,
    /^RECEPÇÃO E CORREDORES/i, /^CHÃO TIJOLEIRAS/i,
    /^CHÃO DIFICIL/i, /^SALA DE JOGOS/i, /^CENTRO SOCIAL/i,
    /^MÓVEIS E OUTROS DECORATIVOS/i, /^MÓVEIS E OTROS DECORATIVOS/i
  ];
  
  for (const pattern of ignorePatterns) {
    if (pattern.test(cleaned)) {
      return false;
    }
  }
  
  const keywords = ['limpo', 'livre', 'regularmente', 'manchas', 'poeira', 'teias', 
                    'limpos', 'estão', 'está', 'aspirado', 'varrido', 'lavado',
                    'polidos', 'limpas', 'limpeza', 'organizado'];
  const hasKeyword = keywords.some(kw => cleaned.toLowerCase().includes(kw));
  
  if (cleaned.includes('?') || hasKeyword) {
    return true;
  }
  
  if ((cleaned.includes('está') || cleaned.includes('estão')) && cleaned.length > 15) {
    return true;
  }
  
  if (cleaned.length > 20) {
    return true;
  }
  
  return false;
}

function cleanItemLabel(text) {
  if (!text) return '';
  
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^[\d]+[\.\s]+/, '');
  cleaned = cleaned.replace(/\?$/, '');
  cleaned = cleaned.replace(/^[-\s]+/, '');
  cleaned = cleaned.replace(/[\(\[{]?\s*peso\s*[:=]\s*\d+\s*[\)\]}]?\s*/i, '');
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned.trim();
}

function extractWeightFromRow(row) {
  if (!row) return 1;
  
  for (let i = 1; i < Math.min(row.length, 8); i++) {
    const cell = String(row[i] || '').trim();
    if (/^\d+$/.test(cell)) {
      const num = parseInt(cell);
      if (num >= 1 && num <= 5) {
        return num;
      }
    }
  }
  return 1;
}

/**
 * Salva templates no localStorage
 */
export function saveTemplatesToStorage(templates) {
  try {
    localStorage.setItem('fims_templates', JSON.stringify(templates));
    
    const clientList = Object.keys(templates).map(key => {
      const t = templates[key];
      return {
        id: t.clientId,
        name: t.clientName,
        sections: t.sections ? t.sections.length : 0,
        items: t.totalItems || 0,
        lastUpdated: t.lastUpdated || new Date().toISOString()
      };
    });
    
    localStorage.setItem('fims_template_clients', JSON.stringify(clientList));
    return clientList;
  } catch (error) {
    console.error('Erro ao salvar templates:', error);
    throw new Error('Erro ao salvar templates no localStorage');
  }
}

/**
 * Carrega templates do localStorage
 */
export function loadTemplatesFromStorage() {
  try {
    const templates = JSON.parse(localStorage.getItem('fims_templates') || '{}');
    const clients = JSON.parse(localStorage.getItem('fims_template_clients') || '[]');
    return { templates, clients };
  } catch (error) {
    console.error('Erro ao carregar templates:', error);
    return { templates: {}, clients: [] };
  }
}

/**
 * Busca um template pelo nome do cliente (ALIAS para getClientTemplate)
 */
export function getTemplateByClientName(clientName) {
  return getClientTemplate(clientName);
}

/**
 * Busca um template pelo nome do cliente - FUNÇÃO PRINCIPAL
 * Esta é a função usada pelo App.jsx
 */
export function getClientTemplate(clientName) {
  try {
    const templates = JSON.parse(localStorage.getItem('fims_templates') || '{}');
    
    if (!clientName) return getDefaultTemplate();
    
    const searchName = clientName.toLowerCase().trim();
    
    // Busca exata
    for (const key of Object.keys(templates)) {
      const template = templates[key];
      if (template.clientName && template.clientName.toLowerCase() === searchName) {
        return template;
      }
    }
    
    // Busca parcial
    for (const key of Object.keys(templates)) {
      const template = templates[key];
      if (template.clientName && 
          (template.clientName.toLowerCase().includes(searchName) || 
           searchName.includes(template.clientName.toLowerCase()))) {
        return template;
      }
    }
    
    return getDefaultTemplate();
  } catch (error) {
    console.error('Erro ao buscar template:', error);
    return getDefaultTemplate();
  }
}

/**
 * Retorna o template padrão
 */
function getDefaultTemplate() {
  return {
    clientId: 'DEFAULT',
    clientName: 'Template Padrão',
    sections: [
      {
        id: 'default_section_1',
        title: 'Inspeção Geral',
        items: [
          { id: 'gen_001', label: 'Estado geral das instalações', weight: 1, note: '' },
          { id: 'gen_002', label: 'Segurança e limpeza', weight: 1, note: '' }
        ]
      }
    ],
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    totalItems: 2
  };
}
