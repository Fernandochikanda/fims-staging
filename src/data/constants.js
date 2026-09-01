// /src/data/constants.js
import { getTemplateByClientName } from '../utils/excelTemplateImporter';

export const ROLES = { ADMIN: "admin", CEO: "ceo", SUPERVISOR: "supervisor", INSPECTOR: "inspector" };

export const SEED_USERS = [
  { id: 1, name: "Sistema Admin", email: "admin@fims.co.mz", role: ROLES.ADMIN, active: true, avatar: "SA" },
  { id: 2, name: "Carlos Machava", email: "ceo@fims.co.mz", role: ROLES.CEO, active: true, avatar: "CM" },
  { id: 3, name: "Ana Sitoe", email: "supervisor@fims.co.mz", role: ROLES.SUPERVISOR, active: true, avatar: "AS" },
  { id: 4, name: "João Tembe", email: "inspector1@fims.co.mz", role: ROLES.INSPECTOR, active: true, avatar: "JT" },
  { id: 5, name: "Maria Nhantumbo", email: "inspector2@fims.co.mz", role: ROLES.INSPECTOR, active: true, avatar: "MN" },
  { id: 6, name: "Carlos Mondlane", email: "inspector3@fims.co.mz", role: ROLES.INSPECTOR, active: true, avatar: "CM" },
  { id: 7, name: "Rita Macuácua", email: "inspector4@fims.co.mz", role: ROLES.INSPECTOR, active: true, avatar: "RM" },
];

export const INSPECTOR_COLORS = {
  4: "#378ADD",
  5: "#0F6E56",
  6: "#534AB7",
  7: "#BA7517"
};

export const PRIORITY_LEVELS = {
  emergency: { label: "Emergency", color: "#A32D2D" },
  high: { label: "High", color: "#EF9F27" },
  medium: { label: "Medium", color: "#FAC775" },
  normal: { label: "Normal", color: "#3B6D11" },
  low: { label: "Low", color: "#888888" }
};

// Lista de localizações - todas usando a função que busca do localStorage
export const SEED_LOCATIONS = [
  { id: 1, name: "Baker Hughes", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 2, name: "Bayport", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 3, name: "Biofund", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 4, name: "Broll S & C", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 5, name: "Casino", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 6, name: "Civitas", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 7, name: "C. Belga", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 8, name: "C. Belga Berreau", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 9, name: "Comité Olímpico", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 10, name: "Commotor GMS", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 11, name: "Condomínio JN130", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 12, name: "EGPAF", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 13, name: "ExxonMobil", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 14, name: "FCDO", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 15, name: "GAPI", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 16, name: "Gestão de Terminais K4", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 17, name: "GDA", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 18, name: "Hollard Seguros R/C", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 19, name: "Hollard Seguros 4º", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 20, name: "Intercar KIA", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 21, name: "ISCTEM 1", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 22, name: "ISCTEM 2", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 23, name: "Karingani", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 24, name: "Multi Choice Torres Rani", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 25, name: "Pronova", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 26, name: "Radisson", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 27, name: "Shopping 24", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 28, name: "Siemens", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 29, name: "SIP", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 30, name: "Tec. Indus. Museu", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 31, name: "Techvision Alto Maé", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 32, name: "Techvision Import", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 33, name: "Techvision Group", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 34, name: "Torre Azul", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 35, name: "Torre Indico", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 36, name: "Torres Rani", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 37, name: "Torres VBC-INSS", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 38, name: "Xiluva", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 39, name: "Zimpeto Square", address: "Av. de Moçambique, Maputo", supervisor_id: 3 },
  { id: 40, name: "Broll Acacia Estate", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 41, name: "Jogabet", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 42, name: "Multi Choice Maputo", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 43, name: "Kactus", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 44, name: "Motraco", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 45, name: "Gestfuel Mussumbuluco", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 46, name: "Gestfuel Estrada Velha", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 47, name: "Aura Residence", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 48, name: "MC Dermott", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 49, name: "Hollard Seguros R/C GA", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 50, name: "Hollard Seguros R/C GA 3º Andar", address: "Maputo, Moçambique", supervisor_id: 3 },
  { id: 51, name: "Hollard Seguros R/C GA 4º Andar", address: "Maputo, Moçambique", supervisor_id: 3 }
];

// Função para obter os templates - primeiro tenta do localStorage, depois fallback para estático
export function getClientTemplate(clientName) {
  // Primeiro tenta buscar do localStorage (templates importados do Excel)
  const template = getTemplateByClientName(clientName);
  
  // Se encontrou no localStorage, retorna
  if (template && template.sections && template.sections.length > 0) {
    return template;
  }
  
  // Fallback: tenta do clientTemplates.js estático
  try {
    const { getTemplate } = require('./clientTemplates');
    const staticTemplate = getTemplate(clientName);
    if (staticTemplate && staticTemplate.sections && staticTemplate.sections.length > 0) {
      return staticTemplate;
    }
  } catch (e) {
    console.warn('Fallback template not found:', e);
  }
  
  // Template padrão de emergência
  return {
    clientId: 'DEFAULT',
    clientName: clientName || 'Template Padrão',
    sections: [
      {
        id: 'default_section',
        title: 'Inspeção Geral',
        items: [
          { id: 'default_1', label: 'Estado geral das instalações', weight: 1 },
          { id: 'default_2', label: 'Limpeza e organização', weight: 1 },
          { id: 'default_3', label: 'Segurança', weight: 1 }
        ]
      }
    ],
    totalItems: 3
  };
}

// Para compatibilidade com código existente que usa TEMPLATE_SECTIONS
const defaultTemplate = getClientTemplate('Baker Hughes');
export const TEMPLATE_SECTIONS = defaultTemplate.sections || [];
export const TOTAL_POSSIBLE = TEMPLATE_SECTIONS.reduce((sum, s) => sum + (s.items ? s.items.reduce((ss, i) => ss + (i.weight || i.max || 1), 0) : 0), 0);
