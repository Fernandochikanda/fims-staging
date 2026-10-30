import { supabase } from '../lib/supabase';
import { logService } from './logService';
import { ROLES, SEED_USERS } from '../data/constants';
export const escalationService = {
  async checkAndEscalate() {
    const now = Date.now();
    let intervalHours = 48;
    try { const { settingsService } = await import('./settingsService'); const s = await settingsService.get(); if (s?.escalation_interval_hours) intervalHours = s.escalation_interval_hours; } catch (e) {}
    const intervalMs = intervalHours * 3600000;
    let defects = [];
    try { const { data } = await supabase.from('fims_defects').select('*').eq('status', 'open'); defects = data || []; } catch (e) { return; }
    const notifyUsers = SEED_USERS.filter(u => [ROLES.ADMIN, ROLES.CEO, ROLES.SUPERVISOR].includes(u.role));
    for (const defect of defects) {
      const createdTime = new Date(defect.opened_at || defect.created_at).getTime();
      const elapsed = now - createdTime;
      let level = 0;
      if (elapsed > intervalMs * 3) level = 3;
      else if (elapsed > intervalMs * 2) level = 2;
      else if (elapsed > intervalMs) level = 1;
      if (level === 0) continue;
      const ackKey = `esc_ack_${defect.id}_${level}`;
      if (localStorage.getItem(ackKey)) continue;
      const notifKey = `esc_notified_${defect.id}_${level}`;
      const lastNotified = localStorage.getItem(notifKey);
      if (lastNotified && (now - parseInt(lastNotified)) < intervalMs) continue;
      const messages = {
        1: `ESCALONAMENTO L1: Defeito "${defect.item_label}" em ${defect.location_name} nao resolvido ha ${intervalHours}h.`,
        2: `ESCALONAMENTO L2 (CRITICO): Defeito "${defect.item_label}" em ${defect.location_name} nao resolvido ha ${intervalHours * 2}h. SLA violado.`,
        3: `ESCALONAMENTO L3 (CLIENTE): Defeito "${defect.item_label}" em ${defect.location_name} nao resolvido ha ${intervalHours * 3}h. Gerar alerta para o cliente.`,
      };
      notifyUsers.forEach(u => logService.log({ id: u.id, name: u.name }, messages[level], 'escalation', `Defect: ${defect.id}, Level: ${level}`));
      try { await supabase.from('fims_escalation_log').insert([{ id: `esc_${Date.now()}_${defect.id}`, defect_id: defect.id, level, message: messages[level], created_at: new Date().toISOString() }]); } catch (e) {}
      if (level >= 2 && !defect.escalated) { try { await supabase.from('fims_defects').update({ escalated: true, escalated_at: new Date().toISOString(), escalation_level: level }).eq('id', defect.id); } catch (e) {} }
      localStorage.setItem(notifKey, String(now));
    }
  },
  acknowledge(defectId, level) { localStorage.setItem(`esc_ack_${defectId}_${level}`, 'true'); },
  isAcknowledged(defectId, level) { return !!localStorage.getItem(`esc_ack_${defectId}_${level}`); }
};
export default escalationService;
