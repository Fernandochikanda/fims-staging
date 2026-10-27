// src/services/dataService.js
import { supabase } from '../lib/supabase';

export const dataService = {
  async fetchInspections() {
    try {
      const { data, error } = await supabase
        .from('fims_inspections')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) { 
        console.warn('[dataService] fetchInspections error:', error.message); 
        return { success: false, inspections: [] }; 
      }
      
      const inspections = (data || []).map(row => {
        const dataContent = row.data || {};
        return {
          ...dataContent,
          id: row.id,
          inspector_id: row.inspector_id || dataContent.inspector_id,
          inspector_name: row.inspector_name || dataContent.inspector_name,
          status: row.status || dataContent.status,
          date: row.date || dataContent.date,
          location_name: row.location_name || dataContent.location_name,
          location_id: row.location_id || dataContent.location_id,
          alert_level: row.alert_level || dataContent.alert_level,
          type: row.type || dataContent.type,
          items: dataContent.items || [],
          sections: dataContent.sections || [],
          photosByItem: dataContent.photosByItem || {}, 
          updated_at: row.updated_at,
          created_at: row.created_at
        };
      });
      
      console.log(`[dataService] Fetched ${inspections.length} inspections`);
      
      const withInspector = inspections.filter(i => i.inspector_id);
      if (withInspector.length > 0) {
        const uniqueIds = [...new Set(withInspector.map(i => i.inspector_id))];
        console.log('[dataService] Inspector IDs encontrados:', uniqueIds.slice(0, 10));
      }
      
      return { success: true, inspections };
    } catch (error) { 
      console.error('[dataService] fetchInspections exception:', error); 
      return { success: false, inspections: [] }; 
    }
  },

  async fetchUsers() {
    try {
      // ID canónico: fims_users.user_id ('usr_*') — corrige IDN-001.
      // O id numérico vai em dbId apenas para referência interna.
      const { data, error } = await supabase
        .from('fims_users')
        .select('id, user_id, name, email, role, active');

      if (error) {
        console.warn('[dataService] fetchUsers error:', error.message);
        return { success: false, users: [] };
      }

      const users = (data || []).map(row => ({
        id: row.user_id || String(row.id), // canónico
        dbId: row.id,
        name: row.name || 'Sem Nome',
        email: row.email || '',
        role: row.role || 'inspector',
        active: row.active !== false
      }));

      return { success: true, users };
    } catch (error) {
      console.error('[dataService] fetchUsers exception:', error);
      return { success: false, users: [] };
    }
  },

  async saveInspection(inspection) {
    try {
      // BUSCAR DADOS EXISTENTES NO BANCO PARA EVITAR SOBRESCREVER ITENS/FOTOS
      const { data: existingRow } = await supabase
        .from('fims_inspections')
        .select('data')
        .eq('id', String(inspection.id))
        .single();

      const existingData = existingRow?.data || {};
      
      // FUSÃO PROFUNDA: Garantir que não apagamos itens e fotos se a atualização for parcial
      const mergedData = {
        ...existingData,
        ...inspection,
        items: (inspection.items && inspection.items.length > 0) ? inspection.items : (existingData.items || []),
        sections: (inspection.sections && inspection.sections.length > 0) ? inspection.sections : (existingData.sections || []),
        photosByItem: (inspection.photosByItem && Object.keys(inspection.photosByItem).length > 0) ? inspection.photosByItem : (existingData.photosByItem || {}),
      };

      const row = { 
        id: String(inspection.id), 
        data: mergedData,  // Guardar os dados fundidos no JSONB
        inspector_id: String(inspection.inspector_id || ''),
        inspector_name: inspection.inspector_name || null,
        status: inspection.status || 'pending',
        date: inspection.date || null,
        location_name: inspection.location_name || null,
        location_id: inspection.location_id ? String(inspection.location_id) : null,
        alert_level: inspection.alert_level || 'ok',
        type: inspection.type || 'inspection',
        updated_at: new Date().toISOString() 
      };
      
      const { error } = await supabase.from('fims_inspections').upsert(row);
      if (error) { 
        console.warn('[dataService] saveInspection error:', error.message); 
        return false; 
      }
      return true;
    } catch (error) { 
      console.error('[dataService] saveInspection exception:', error); 
      return false; 
    }
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
      
      const rows = inspections.map(i => ({ 
        id: String(i.id), 
        data: i,
        inspector_id: String(i.inspector_id || ''),
        inspector_name: i.inspector_name || null,
        status: i.status || 'pending',
        date: i.date || null,
        location_name: i.location_name || null,
        location_id: i.location_id ? String(i.location_id) : null,
        alert_level: i.alert_level || 'ok',
        type: i.type || 'inspection',
        updated_at: new Date().toISOString() 
      }));
      
      const batchSize = 50;
      let successCount = 0, errorCount = 0;
      
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from('fims_inspections').upsert(batch);
        if (error) { 
          console.warn('[dataService] syncBatch error:', error.message); 
          errorCount += batch.length; 
        } else { 
          successCount += batch.length; 
        }
      }
      
      console.log(`[dataService] Synced ${successCount} inspections, ${errorCount} errors`);
      return errorCount === 0;
    } catch (error) { 
      console.error('[dataService] syncInspections exception:', error); 
      return false; 
    }
  },

  async fetchLocations() {
    try {
      const { data, error } = await supabase.from('fims_locations').select('*').order('name');
      if (error) { console.warn('[dataService] fetchLocations error:', error.message); return { success: false, locations: [] }; }
      const locations = (data || []).map(row => ({ ...row.data, id: row.data.id || row.id }));
      console.log(`[dataService] Fetched ${locations.length} locations`);
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
        if (error) { console.warn('[dataService] syncLocations error:', error.message); errorCount += batch.length; }
        else { successCount += batch.length; }
      }
      console.log(`[dataService] Synced ${successCount} locations, ${errorCount} errors`);
      return errorCount === 0;
    } catch (error) { console.error('[dataService] syncLocations exception:', error); return false; }
  },

  subscribeToInspectionChanges(onChange) {
    console.log('[dataService] Setting up inspections real-time...');
    
    const channelName = `fims-inspections-${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'fims_inspections' 
      }, (payload) => {
        console.log('[dataService] Inspections event:', payload.eventType);
        
        if (payload.new) {
          const dataContent = payload.new.data || {};
          payload.new = {
            ...dataContent,
            id: payload.new.id,
            inspector_id: payload.new.inspector_id || dataContent.inspector_id,
            inspector_name: payload.new.inspector_name || dataContent.inspector_name,
            status: payload.new.status || dataContent.status,
            date: payload.new.date || dataContent.date,
            location_name: payload.new.location_name || dataContent.location_name,
            location_id: payload.new.location_id || dataContent.location_id,
            alert_level: payload.new.alert_level || dataContent.alert_level,
            type: payload.new.type || dataContent.type,
            items: dataContent.items || [],
            sections: dataContent.sections || [],
            photosByItem: dataContent.photosByItem || {},
            updated_at: payload.new.updated_at,
            created_at: payload.new.created_at
          };
        }
        if (payload.old) {
          const dataContent = payload.old.data || {};
          payload.old = {
            ...dataContent,
            id: payload.old.id,
            inspector_id: payload.old.inspector_id || dataContent.inspector_id
          };
        }
        onChange(payload);
      });
    
    channel.subscribe((status) => { 
      console.log('[dataService] Realtime status:', status); 
    });
    
    return () => { 
      console.log('[dataService] Unsubscribing'); 
      supabase.removeChannel(channel); 
    };
  },

  subscribeToLocationChanges(onChange) {
    console.log('[dataService] Setting up locations real-time...');
    const channelName = `fims-locations-${Date.now()}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fims_locations' }, (payload) => {
        console.log('[dataService] Locations event:', payload.eventType);
        onChange(payload);
      })
      .subscribe((status) => { console.log('[dataService] Locations realtime status:', status); });
    return () => { console.log('[dataService] Unsubscribing from locations'); supabase.removeChannel(channel); };
  },

  async deleteAllInspections() {
    try {
      const { data: allIds } = await supabase
        .from('fims_inspections')
        .select('id')
        .limit(10000);
      
      if (allIds && allIds.length > 0) {
        const idsToDelete = allIds.map(row => row.id);
        
        const batchSize = 500;
        for (let i = 0; i < idsToDelete.length; i += batchSize) {
          const batch = idsToDelete.slice(i, i + batchSize);
          const { error } = await supabase
            .from('fims_inspections')
            .delete()
            .in('id', batch);
          
          if (error) {
            console.warn('[dataService] Erro ao deletar lote:', error.message);
          }
        }
      }
      
      console.log('[dataService] Todas as inspeções eliminadas do Supabase');
      return { success: true };
    } catch (error) {
      console.error('[dataService] Erro ao eliminar todas:', error);
      return { success: false, error: error.message };
    }
  },

  async deleteInspectionsBeforeDate(date) {
    try {
      const { count } = await supabase
        .from('fims_inspections')
        .select('*', { count: 'exact', head: true })
        .lt('date', date);
      
      if (count === 0) {
        return { success: true, deleted: 0, message: 'Nenhuma inspeção anterior a essa data' };
      }
      
      const { error } = await supabase
        .from('fims_inspections')
        .delete()
        .lt('date', date);
      
      if (error) throw error;
      
      console.log(`[dataService] Eliminadas ${count} inspeções anteriores a ${date}`);
      return { success: true, deleted: count };
    } catch (error) {
      console.error('[dataService] Erro ao eliminar por data:', error);
      return { success: false, error: error.message };
    }
  },

  async countInspections() {
    try {
      const { count, error } = await supabase
        .from('fims_inspections')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return { success: true, count: count || 0 };
    } catch (error) {
      return { success: false, count: 0, error: error.message };
    }
  },

  async fetchAuditLogs() {
    try {
      const { data, error } = await supabase
        .from('fims_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);

      if (error) {
        console.warn('[dataService] fetchAuditLogs error:', error.message);
        return { success: false, logs: [] };
      }

      const logs = (data || []).map(row => ({
        id: row.id || row.timestamp,
        timestamp: row.timestamp,
        user: row.user_name || row.user || 'Sistema',
        action: row.action || '',
        type: row.type || 'system',
        detail: row.detail || ''
      }));

      console.log(`[dataService] Fetched ${logs.length} audit logs from Supabase`);
      return { success: true, logs };
    } catch (error) {
      console.error('[dataService] fetchAuditLogs exception:', error);
      return { success: false, logs: [] };
    }
  },

  async saveAuditLog({ userId, userName, action, type, detail }) {
    try {
      const { error } = await supabase
        .from('fims_logs')
        .insert([{
          user_id: userId,
          user_name: userName,
          action,
          type,
          detail,
          timestamp: new Date().toISOString()
        }]);

      if (error) {
        console.warn('[dataService] saveAuditLog error:', error.message);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[dataService] saveAuditLog exception:', error);
      return false;
    }
  }
};
