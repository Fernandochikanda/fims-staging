// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uaspabiqnmcwohluymeb.supabase.co';
const supabaseAnonKey = 'sb_publishable_B08e9mtpZ8BCdauYElZlQw_4dgOaszz';

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
  TEMPLATES: 'fims_templates',      // ✅ TABELA CORRETA com os templates
  INSPECTIONS: 'fims_inspections',
  LOGS: 'fims_logs',
  LOCATIONS: 'fims_locations',
  NOTIFICATIONS: 'fims_notifications'
};

