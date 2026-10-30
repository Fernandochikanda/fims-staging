import { supabase } from '../lib/supabase';
import { genId } from '../lib/helpers';
const LOCAL_KEY = 'fims_logs';
function getLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; } }
function saveLocal(logs) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(logs.slice(-200))); } catch (e) {} }
export const logService = {
  async log(user, action, type, details = '') {
    const entry = { id: genId(), user_id: String(user?.id || ''), user_name: user?.name || 'Sistema', action, type, details, timestamp: new Date().toISOString() };
    try { const { error } = await supabase.from('fims_logs').insert([entry]); if (error) throw error; }
    catch (e) { const logs = getLocal(); logs.unshift(entry); saveLocal(logs); }
    return entry;
  },
  async fetchLogs(limit = 100, filters = {}) {
    try {
      let q = supabase.from('fims_logs').select('*').order('timestamp', { ascending: false }).limit(limit);
      if (filters.userId) q = q.eq('user_id', String(filters.userId));
      if (filters.type) q = q.eq('type', filters.type);
      const { data, error } = await q; if (error) throw error; return data || [];
    } catch (e) { return getLocal(); }
  },
};
export default logService;
