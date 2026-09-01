import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://cfplibrosawkrdgkmebw.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmcGxpYnJvc2F3a3JkZ2ttZWJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNzE2MzcsImV4cCI6MjEwMzg0NzYzN30.KHfmVum-f2wqIiPouu0WYrCVU1HVTlZH4UFp1J4tjrw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const TABLES = {
  USERS: 'fims_users',
  LOCATIONS: 'fims_locations',
  INSPECTIONS: 'fims_inspections',
  LOGS: 'fims_logs',
  NOTIFICATIONS: 'fims_notifications',
  TEMPLATES: 'fims_templates',
  TEMPLATE_CLIENTS: 'fims_template_clients'
};
