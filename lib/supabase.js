// /src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// Substitua com suas credenciais do Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://uaspabiqnmcwohluymeb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_B08e9mtpZ8BCdauYElZlQw_4dgOaszz';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Nomes das tabelas
export const TABLES = {
  TEMPLATES: 'fims_templates',
  TEMPLATE_CLIENTS: 'fims_template_clients',
  INSPECTIONS: 'fims_inspections',
  USERS: 'fims_users',
  LOCATIONS: 'fims_locations',
  LOGS: 'fims_logs'
};
