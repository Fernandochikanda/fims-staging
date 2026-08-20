import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase env variables! Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
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
