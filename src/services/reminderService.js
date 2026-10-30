import { logService } from './logService';
const RUN_KEY = 'fims_last_reminder_run';
const SUM_KEY = 'fims_last_summary_date';
export const reminderService = {
  async checkAndRemind(inspections, users, currentUser) {
    if (!inspections || !currentUser) return null;
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const overdueMs = 48 * 3600000;
    const lastRun = localStorage.getItem(RUN_KEY);
    if (lastRun && (now - parseInt(lastRun)) < 3600000) return null;
    let result = null;
    if (currentUser.role === 'inspector') {
      const myInsp = inspections.filter(i => String(i.inspector_id) === String(currentUser.id) && i.type !== 'leave');
      const dueToday = myInsp.filter(i => i.date === today && !['submitted','reviewed','closed','deleted'].includes(i.status));
      const overdue = myInsp.filter(i => { if (['submitted','reviewed','closed','deleted'].includes(i.status) || !i.date) return false; return (now - new Date(i.date).getTime()) > overdueMs; });
      if (dueToday.length > 0) logService.log(currentUser, `Tem ${dueToday.length} inspecao(oes) marcadas para hoje`, 'reminder', dueToday.map(i => i.location_name).join(', '));
      if (overdue.length > 0) logService.log(currentUser, `${overdue.length} inspecao(oes) em atraso (> 48h)`, 'reminder', overdue.map(i => i.location_name).join(', '));
      result = { dueToday: dueToday.length, overdue: overdue.length };
    }
    if (currentUser.role === 'supervisor' || currentUser.role === 'admin' || currentUser.role === 'ceo') {
      const pendingReview = inspections.filter(i => i.status === 'submitted' && i.type !== 'leave');
      if (pendingReview.length > 0) logService.log(currentUser, `Tem ${pendingReview.length} inspecao(oes) aguardando revisao`, 'reminder', pendingReview.map(i => i.location_name).join(', '));
      result = { pendingReview: pendingReview.length };
    }
    localStorage.setItem(RUN_KEY, String(now));
    return result;
  },
  async checkDailySummary(inspections, currentUser) {
    if (!inspections || !currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    if (localStorage.getItem(SUM_KEY) === today) return;
    const myInsp = currentUser.role === 'inspector' ? inspections.filter(i => String(i.inspector_id) === String(currentUser.id) && i.type !== 'leave') : inspections.filter(i => i.type !== 'leave');
    const dueToday = myInsp.filter(i => i.date === today && !['submitted','reviewed','closed','deleted'].includes(i.status));
    const overdue = myInsp.filter(i => { if (['submitted','reviewed','closed','deleted'].includes(i.status) || !i.date) return false; return (Date.now() - new Date(i.date).getTime()) > 48 * 3600000; });
    if (dueToday.length > 0 || overdue.length > 0) {
      logService.log(currentUser, `Resumo diario: ${dueToday.length} para hoje, ${overdue.length} em atraso`, 'reminder', 'daily_summary');
    }
    localStorage.setItem(SUM_KEY, today);
  }
};
export default reminderService;
