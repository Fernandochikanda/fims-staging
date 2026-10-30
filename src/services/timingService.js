import { supabase } from '../lib/supabase';
import { genId } from '../lib/helpers';
const TABLE = 'fims_inspection_timings';
export const timingService = {
  async start(inspection) {
    try {
      const { data: existing } = await supabase.from(TABLE).select('*').eq('inspection_id', String(inspection.id)).is('end_time', null).limit(1);
      if (existing && existing.length > 0) {
        const t = existing[0]; const pauses = t.pause_history || [];
        pauses.push({ event: 'resume', timestamp: new Date().toISOString() });
        await supabase.from(TABLE).update({ pause_history: pauses }).eq('id', t.id);
        return t;
      }
      const entry = { id: genId(), inspection_id: String(inspection.id), inspector_id: String(inspection.inspector_id || ''), inspector_name: inspection.inspector_name || '', location_name: inspection.location_name || '', start_time: new Date().toISOString(), end_time: null, duration_minutes: 0, pause_history: [] };
      await supabase.from(TABLE).insert([entry]);
      return entry;
    } catch (e) { console.warn('[timing] start:', e.message); return null; }
  },
  async pause(inspectionId) {
    try {
      const { data: open } = await supabase.from(TABLE).select('*').eq('inspection_id', String(inspectionId)).is('end_time', null).limit(1);
      if (open && open.length > 0) { const t = open[0]; const pauses = t.pause_history || []; pauses.push({ event: 'pause', timestamp: new Date().toISOString() }); await supabase.from(TABLE).update({ pause_history: pauses }).eq('id', t.id); }
    } catch (e) { console.warn('[timing] pause:', e.message); }
  },
  async stop(inspectionId) {
    try {
      const { data: open } = await supabase.from(TABLE).select('*').eq('inspection_id', String(inspectionId)).is('end_time', null).limit(1);
      if (open && open.length > 0) {
        const t = open[0]; const endTime = new Date().toISOString();
        const start = new Date(t.start_time).getTime(); const end = new Date(endTime).getTime();
        let activeMs = end - start;
        const pauses = t.pause_history || [];
        for (let i = 0; i < pauses.length - 1; i++) { if (pauses[i].event === 'pause' && pauses[i+1] && pauses[i+1].event === 'resume') { activeMs -= new Date(pauses[i+1].timestamp).getTime() - new Date(pauses[i].timestamp).getTime(); } }
        const durationMinutes = Math.max(0, Math.round(activeMs / 60000));
        await supabase.from(TABLE).update({ end_time: endTime, duration_minutes: durationMinutes }).eq('id', t.id);
        return { ...t, end_time: endTime, duration_minutes: durationMinutes };
      }
    } catch (e) { console.warn('[timing] stop:', e.message); }
    return null;
  },
  async getTiming(inspectionId) {
    try { const { data } = await supabase.from(TABLE).select('*').eq('inspection_id', String(inspectionId)).order('created_at', { ascending: false }).limit(1); return data?.[0] || null; }
    catch (e) { return null; }
  },
  formatDuration(minutes) {
    if (!minutes || minutes <= 0) return '—';
    if (minutes < 60) return minutes + ' min';
    return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'min';
  }
};
export default timingService;
