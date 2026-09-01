// /src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// Usar a URL e chave corretas do seu projeto
const supabaseUrl = 'https://uaspabiqnmcwohluymeb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhc3BhYmlxbm1jd29obHV5bWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTU5NzUsImV4cCI6MjEwMjI5MTk3NX0.Ke6mrbPxCpL4U1lP5jyY5pnayFEsFvAsPPghJPauLxE'; // Substitua pela chave correta

console.log('🔑 Supabase URL:', supabaseUrl);
console.log('🔑 Supabase Key presente:', !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
  },
});

export const TABLES = {
  USERS: 'fims_users',
  TEMPLATES: 'fims_templates',
  TEMPLATE_CLIENTS: 'fims_template_clients',
  INSPECTIONS: 'fims_inspections',
  LOGS: 'fims_logs',
  LOCATIONS: 'fims_locations',
};
