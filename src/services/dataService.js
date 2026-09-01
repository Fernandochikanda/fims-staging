import { supabase } from '../lib/supabase';

export const dataService = {
  async fetchInspections() {
    try {
      const { data, error } = await supabase.from('fims_inspections').select('*').order('created_at', { ascending: false });
      if (error) { console.warn('[dataService] fetchInspections error:', error.message); return { success: false, inspections: [] }; }
      const inspections = (data || []).map(row => ({ ...row.data, id: row.id }));
      console.log('[dataService] Fetched', inspections.length, 'inspections');
      return { success: true, inspections };
    } catch (error) { console.error('[dataService] fetchInspections exception:', error); return { success: false, inspections: [] }; }
  },

  async saveInspection(inspection) {
    try {
      const row = { id: String(inspection.id), data: inspection, inspector_id: inspection.inspector_id ? String(inspection.inspector_id) : null, inspector_name: inspection.inspector_name || null, status: inspection.status || 'pending', date: inspection.date || null, location_name: inspection.location_name || null, alert_level: inspection.alert_level || 'ok', type: inspection.type || 'inspection', updated_at: new Date().toISOString() };
      const { error } = await supabase.from('fims_inspections').upsert(row);
      if (error) { console.warn('[dataService] saveInspection error:', error.message); return false; }
      return true;
    } catch (error) { console.error('[dataService] saveInspection exception:', error); return false; }
  },

  async deleteInspection(id) {
    try {
      const { error } = await supabase.from('fims_inspections').delete().eq('id', String(id));
      if (error) { console.warn('[dataService] deleteInspection error:', error.message); return false; }
      return true;
    } catch (error) { console.error('[dataService] deleteInspection exception:', error); return false; }
  },

  async syncInspections(inspections) {
    try {
      if (!inspections || inspections.length === 0) return true;
      const rows = inspections.map(i => ({ id: String(i.id), data: i, inspector_id: i.inspector_id ? String(i.inspector_id) : null, inspector_name: i.inspector_name || null, status: i.status || 'pending', date: i.date || null, location_name: i.location_name || null, alert_level: i.alert_level || 'ok', type: i.type || 'inspection', updated_at: new Date().toISOString() }));
      const batchSize = 100;
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from('fims_inspections').upsert(batch);
        if (error) { console.warn('[dataService] syncInspects batch error:', error.message); errorCount += batch.length; }
        else { successCount += batch.length; }
      }
      console.log('[dataService] Synced', successCount, 'inspections,', errorCount, 'errors');
      return errorCount === 0;
    } catch (error) { console.error('[dataService] syncInspections exception:', error); return false; }
  },

  async fetchLocations() {
    try {
      const { data, error } = await supabase.from('fims_locations').select('*').order('name');
      if (error) { console.warn('[dataService] fetchLocations error:', error.message); return { success: false, locations: [] }; }
      const locations = (data || []).map(row => ({ ...row.data, id: row.data.id || row.id }));
      console.log('[dataService] Fetched', locations.length, 'locations');
      return { success: true, locations };
    } catch (error) { console.error('[dataService] fetchLocations exception:', error); return { success: false, locations: [] }; }
  },

  async syncLocations(locations) {
    try {
      if (!locations || locations.length === 0) return true;
      const rows = locations.map(l => ({ id: String(l.id), data: l, name: l.name || null, updated_at: new Date().toISOString() }));
      const batchSize = 100;
      let successCount = 0, errorCount = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from('fims_locations').upsert(batch);
        if (error) { console.warn('[dataService] syncLocations batch error:', error.message); errorCount += batch.length; }
        else { successCount += batch.length; }
      }
      console.log('[dataService] Synced', successCount, 'locations,', errorCount, 'errors');
      return errorCount === 0;
    } catch (error) { console.error('[dataService] syncLocations exception:', error); return false; }
  },

  async saveLocation(location) {
    try {
      const row = { id: String(location.id), data: location, name: location.name || null, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('fims_locations').upsert(row);
      if (error) { console.warn('[dataService] saveLocation error:', error.message); return false; }
      return true;
    } catch (error) { console.error('[dataService] saveLocation exception:', error); return false; }
  },

  async deleteLocation(id) {
    try {
      const { error } = await supabase.from('fims_locations').delete().eq('id', String(id));
      if (error) { console.warn('[dataService] deleteLocation error:', error.message); return false; }
      return true;
    } catch (error) { console.error('[dataService] deleteLocation exception:', error); return false; }
  },

  subscribeToInspectionChanges(onChange) {
    console.log('[dataService] Setting up inspections real-time...');
    const channel = supabase.channel('fims-inspections-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fims_inspections' }, (payload) => {
        console.log('[dataService] Inspections event:', payload.eventType);
        onChange(payload);
      })
      .subscribe((status) => { console.log('[dataService] Inspections real-time status:', status); });
    return () => { console.log('[dataService] Unsubscribing from inspections real-time'); supabase.removeChannel(channel); };
  },

  subscribeToLocationChanges(onChange) {
    console.log('[dataService] Setting up locations real-time...');
    const channel = supabase.channel('fims-locations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fims_locations' }, (payload) => {
        console.log('[dataService] Locations event:', payload.eventType);
        onChange(payload);
      })
      .subscribe((status) => { console.log('[dataService] Locations real-time status:', status); });
    return () => { console.log('[dataService] Unsubscribing from locations real-time'); supabase.removeChannel(channel); };
  }
};
