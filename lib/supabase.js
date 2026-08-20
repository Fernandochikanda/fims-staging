// /src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// Substitua com suas credenciais do Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://uaspabiqnmcwohluymeb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhc3BhYmlxbm1jd29obHV5bWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTU5NzUsImV4cCI6MjEwMjI5MTk3NX0.Ke6mrbPxCpL4U1lP5jyY5pnayFEsFvAsPPghJPauLxE';

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
