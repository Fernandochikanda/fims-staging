// /src/services/templateService.js
import { supabase, TABLES } from '../lib/supabase';

/**
 * Serviço para gerenciar templates no Supabase
 */
export const templateService = {
  /**
   * Envia um template para o Supabase
   */
  async uploadTemplate(template) {
    try {
      // Verificar se o template já existe
      const { data: existing, error: checkError } = await supabase
        .from(TABLES.TEMPLATES)
        .select('client_id')
        .eq('client_id', template.clientId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      // Preparar dados para inserção
      const templateData = {
        client_id: template.clientId,
        client_name: template.clientName,
        sections: template.sections,
        version: template.version || '1.0',
        total_items: template.totalItems,
        last_updated: template.lastUpdated || new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      let result;

      if (existing) {
        // Atualizar template existente
        result = await supabase
          .from(TABLES.TEMPLATES)
          .update(templateData)
          .eq('client_id', template.clientId);
      } else {
        // Inserir novo template
        result = await supabase
          .from(TABLES.TEMPLATES)
          .insert([templateData]);
      }

      if (result.error) throw result.error;

      // Atualizar também a lista de clientes
      await this.updateClientList();

      return { success: true, data: templateData };
    } catch (error) {
      console.error('Erro ao enviar template:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Envia múltiplos templates para o Supabase
   */
  async uploadMultipleTemplates(templates) {
    const results = {
      success: [],
      failed: [],
      total: Object.keys(templates).length
    };

    // Enviar em lotes de 5 para não sobrecarregar
    const templateArray = Object.values(templates);
    const batchSize = 5;

    for (let i = 0; i < templateArray.length; i += batchSize) {
      const batch = templateArray.slice(i, i + batchSize);
      
      const promises = batch.map(template => this.uploadTemplate(template));
      const batchResults = await Promise.all(promises);

      batchResults.forEach((result, index) => {
        if (result.success) {
          results.success.push(batch[index].clientName);
        } else {
          results.failed.push({
            name: batch[index].clientName,
            error: result.error
          });
        }
      });

      // Atualizar progresso
      if (this.onProgress) {
        this.onProgress({
          processed: Math.min(i + batchSize, templateArray.length),
          total: templateArray.length,
          success: results.success.length,
          failed: results.failed.length
        });
      }
    }

    return results;
  },

  /**
   * Busca todos os templates do Supabase
   */
  async fetchAllTemplates() {
    try {
      const { data, error } = await supabase
        .from(TABLES.TEMPLATES)
        .select('*')
        .order('client_name', { ascending: true });

      if (error) throw error;

      // Converter para o formato do cliente
      const templates = {};
      const clients = [];

      data.forEach(item => {
        const template = {
          clientId: item.client_id,
          clientName: item.client_name,
          sections: item.sections || [],
          version: item.version || '1.0',
          totalItems: item.total_items || 0,
          lastUpdated: item.last_updated || item.created_at
        };

        templates[item.client_id] = template;
        clients.push({
          id: item.client_id,
          name: item.client_name,
          sections: item.sections ? item.sections.length : 0,
          items: item.total_items || 0,
          lastUpdated: item.last_updated || item.created_at
        });
      });

      return { templates, clients, success: true };
    } catch (error) {
      console.error('Erro ao buscar templates:', error);
      return { templates: {}, clients: [], success: false, error: error.message };
    }
  },

  /**
   * Busca um template específico pelo ID do cliente
   */
  async fetchTemplateByClientId(clientId) {
    try {
      const { data, error } = await supabase
        .from(TABLES.TEMPLATES)
        .select('*')
        .eq('client_id', clientId)
        .single();

      if (error) throw error;

      return {
        success: true,
        template: {
          clientId: data.client_id,
          clientName: data.client_name,
          sections: data.sections || [],
          version: data.version || '1.0',
          totalItems: data.total_items || 0,
          lastUpdated: data.last_updated || data.created_at
        }
      };
    } catch (error) {
      console.error('Erro ao buscar template:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Busca um template pelo nome do cliente
   */
  async fetchTemplateByClientName(clientName) {
    try {
      const { data, error } = await supabase
        .from(TABLES.TEMPLATES)
        .select('*')
        .ilike('client_name', `%${clientName}%`)
        .limit(1);

      if (error) throw error;

      if (!data || data.length === 0) {
        return { success: false, error: 'Template não encontrado' };
      }

      const item = data[0];
      return {
        success: true,
        template: {
          clientId: item.client_id,
          clientName: item.client_name,
          sections: item.sections || [],
          version: item.version || '1.0',
          totalItems: item.total_items || 0,
          lastUpdated: item.last_updated || item.created_at
        }
      };
    } catch (error) {
      console.error('Erro ao buscar template por nome:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Atualiza a lista de clientes no Supabase
   */
  async updateClientList() {
    try {
      // Buscar todos os templates
      const { data, error } = await supabase
        .from(TABLES.TEMPLATES)
        .select('client_id, client_name, sections, total_items, last_updated');

      if (error) throw error;

      // Converter para lista de clientes
      const clients = data.map(item => ({
        id: item.client_id,
        name: item.client_name,
        sections: item.sections ? item.sections.length : 0,
        items: item.total_items || 0,
        lastUpdated: item.last_updated
      }));

      // Salvar no localStorage também para cache
      localStorage.setItem('fims_supabase_clients', JSON.stringify(clients));

      return { success: true, clients };
    } catch (error) {
      console.error('Erro ao atualizar lista de clientes:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Remove um template do Supabase
   */
  async deleteTemplate(clientId) {
    try {
      const { error } = await supabase
        .from(TABLES.TEMPLATES)
        .delete()
        .eq('client_id', clientId);

      if (error) throw error;

      await this.updateClientList();
      return { success: true };
    } catch (error) {
      console.error('Erro ao remover template:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Sincroniza templates do localStorage para o Supabase
   */
  async syncLocalTemplates() {
    try {
      // Buscar templates do localStorage
      const localTemplates = JSON.parse(localStorage.getItem('fims_templates') || '{}');
      const localClients = JSON.parse(localStorage.getItem('fims_template_clients') || '[]');

      if (Object.keys(localTemplates).length === 0) {
        return { success: true, message: 'Nenhum template local para sincronizar' };
      }

      // Enviar todos os templates
      const results = await this.uploadMultipleTemplates(localTemplates);

      return {
        success: true,
        results,
        total: Object.keys(localTemplates).length
      };
    } catch (error) {
      console.error('Erro ao sincronizar templates:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Sincroniza templates do Supabase para o localStorage
   */
  async syncSupabaseToLocal() {
    try {
      const result = await this.fetchAllTemplates();
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Salvar no localStorage
      localStorage.setItem('fims_templates', JSON.stringify(result.templates));
      localStorage.setItem('fims_template_clients', JSON.stringify(result.clients));

      return {
        success: true,
        templates: result.templates,
        clients: result.clients,
        total: result.clients.length
      };
    } catch (error) {
      console.error('Erro ao sincronizar do Supabase:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Verifica a conexão com o Supabase
   */
  async checkConnection() {
    try {
      const { data, error } = await supabase
        .from(TABLES.TEMPLATES)
        .select('count')
        .limit(1);

      if (error) throw error;
      return { success: true, message: 'Conexão com Supabase estabelecida' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Configura callback de progresso
   */
  setProgressCallback(callback) {
    this.onProgress = callback;
  }
};
