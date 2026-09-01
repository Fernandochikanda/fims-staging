// /src/services/authService.js
import { supabase } from '../lib/supabase';

/**
 * Serviço de autenticação com Supabase
 * Mantém compatibilidade com o sistema existente
 */
export const authService = {
  /**
   * Login com email e senha
   */
  async login(email, password) {
    try {
      // Buscar usuário pelo email na tabela fims_users
      const { data: users, error } = await supabase
        .from('fims_users')
        .select('*')
        .eq('email', email)
        .eq('active', true)
        .limit(1);

      if (error) {
        console.error('Erro na consulta:', error);
        // Se a tabela não existir, tentar autenticação Supabase Auth
        return this.loginWithSupabaseAuth(email, password);
      }

      if (!users || users.length === 0) {
        // Tentar autenticação com Supabase Auth
        return this.loginWithSupabaseAuth(email, password);
      }

      const user = users[0];

      // Verificar senha (se tiver hash)
      if (user.password_hash) {
        // Importar bcrypt dinamicamente
        const bcrypt = await import('bcryptjs');
        const isValid = await bcrypt.default.compare(password, user.password_hash);
        
        if (!isValid) {
          return { 
            success: false, 
            error: 'Senha incorreta' 
          };
        }
      } else {
        // Se não tiver hash, comparar texto plano (para compatibilidade)
        if (user.password !== password) {
          return { 
            success: false, 
            error: 'Senha incorreta' 
          };
        }
      }

      // Remover campos sensíveis
      const { password_hash, password: pwd, ...userData } = user;

      // Converter para o formato esperado pelo sistema
      const formattedUser = {
        id: userData.user_id || userData.id,
        name: userData.name,
        email: userData.email,
        role: userData.role || 'inspector',
        active: userData.active !== false,
        avatar: userData.avatar || userData.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      };

      // Salvar no localStorage
      localStorage.setItem('fims_current_user', JSON.stringify(formattedUser));

      // Registrar login
      await this.logActivity(formattedUser.id, 'Login', 'login', 'Entrou no sistema');

      return { 
        success: true, 
        user: formattedUser 
      };

    } catch (error) {
      console.error('Erro no login:', error);
      
      // Fallback: tentar login com Supabase Auth
      return this.loginWithSupabaseAuth(email, password);
    }
  },

  /**
   * Login com Supabase Auth (fallback)
   */
  async loginWithSupabaseAuth(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { 
          success: false, 
          error: 'Email ou senha incorretos' 
        };
      }

      // Buscar dados adicionais do usuário
      const { data: userData } = await supabase
        .from('fims_users')
        .select('*')
        .eq('email', email)
        .single();

      const user = {
        id: data.user.id,
        name: userData?.name || data.user.email?.split('@')[0] || 'Usuário',
        email: data.user.email,
        role: userData?.role || 'inspector',
        active: true,
        avatar: userData?.avatar || data.user.email?.substring(0, 2).toUpperCase() || 'US'
      };

      localStorage.setItem('fims_current_user', JSON.stringify(user));
      
      await this.logActivity(user.id, 'Login', 'login', 'Entrou no sistema (Supabase Auth)');

      return { success: true, user };

    } catch (error) {
      return { 
        success: false, 
        error: 'Erro ao conectar ao servidor' 
      };
    }
  },

  /**
   * Logout
   */
  async logout(userId) {
    try {
      if (userId) {
        await this.logActivity(userId, 'Logout', 'logout', 'Saiu do sistema');
      }

      localStorage.removeItem('fims_current_user');
      
      // Tentar logout do Supabase Auth
      try {
        await supabase.auth.signOut();
      } catch (e) {
        // Ignorar erro se não estiver usando Supabase Auth
      }

      return { success: true };

    } catch (error) {
      console.error('Erro no logout:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Registrar atividade no log
   */
  async logActivity(userId, action, type, detail) {
    try {
      // Buscar nome do usuário
      let userName = 'Usuário';
      
      // Tentar buscar do localStorage primeiro
      const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
      if (currentUser) {
        userName = currentUser.name;
      }

      const logEntry = {
        id: Date.now() + Math.random() * 1000,
        timestamp: new Date().toISOString(),
        user: userName,
        action,
        type,
        detail
      };

      // Salvar no localStorage (cache)
      const logs = JSON.parse(localStorage.getItem('fims_logs') || '[]');
      logs.unshift(logEntry);
      localStorage.setItem('fims_logs', JSON.stringify(logs.slice(0, 1000)));

      // Opcional: Salvar no Supabase
      try {
        await supabase
          .from('fims_logs')
          .insert([{
            user_id: userId,
            user_name: userName,
            action,
            type,
            detail,
            timestamp: new Date().toISOString()
          }]);
      } catch (e) {
        // Ignorar erro se tabela não existir
      }

      return { success: true };

    } catch (error) {
      console.error('Erro ao registrar log:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Buscar todos os usuários do Supabase
   */
  async fetchAllUsers() {
    try {
      const { data, error } = await supabase
        .from('fims_users')
        .select('*')
        .order('name');

      if (error) {
        // Se tabela não existir, retornar seed users
        const seedUsers = JSON.parse(localStorage.getItem('fims_users') || '[]');
        return { success: true, users: seedUsers };
      }

      // Converter para o formato esperado
      const users = data.map(u => ({
        id: u.user_id || u.id,
        name: u.name,
        email: u.email,
        role: u.role || 'inspector',
        active: u.active !== false,
        avatar: u.avatar || u.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      }));

      return { success: true, users };

    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Criar um novo usuário
   */
  async createUser(userData) {
    try {
      const bcrypt = await import('bcryptjs');
      const salt = await bcrypt.default.genSalt(10);
      const passwordHash = await bcrypt.default.hash(userData.password, salt);

      const newUser = {
        user_id: `user_${Date.now()}`,
        name: userData.name,
        email: userData.email,
        password_hash: passwordHash,
        role: userData.role || 'inspector',
        active: true,
        avatar: userData.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      };

      const { data, error } = await supabase
        .from('fims_users')
        .insert([newUser])
        .select('*');

      if (error) throw error;

      const { password_hash, ...createdUser } = data[0];

      return { 
        success: true, 
        user: {
          id: createdUser.user_id,
          name: createdUser.name,
          email: createdUser.email,
          role: createdUser.role,
          active: true,
          avatar: createdUser.avatar
        }
      };

    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      return { 
        success: false, 
        error: error.message || 'Erro ao criar usuário' 
      };
    }
  },

  /**
   * Atualizar um usuário
   */
  async updateUser(userId, updates) {
    try {
      // Se estiver atualizando a senha
      if (updates.password) {
        const bcrypt = await import('bcryptjs');
        const salt = await bcrypt.default.genSalt(10);
        updates.password_hash = await bcrypt.default.hash(updates.password, salt);
        delete updates.password;
      }

      const { data, error } = await supabase
        .from('fims_users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select('*');

      if (error) throw error;

      const { password_hash, ...updatedUser } = data[0];

      // Atualizar usuário no localStorage se for o atual
      const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
      if (currentUser && currentUser.id === userId) {
        const updated = {
          id: updatedUser.user_id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          active: updatedUser.active !== false,
          avatar: updatedUser.avatar
        };
        localStorage.setItem('fims_current_user', JSON.stringify(updated));
      }

      return { 
        success: true, 
        user: {
          id: updatedUser.user_id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          active: updatedUser.active !== false,
          avatar: updatedUser.avatar
        }
      };

    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  },

  /**
   * Ativar/Desativar um usuário
   */
  async toggleUserStatus(userId, active) {
    try {
      const { data, error } = await supabase
        .from('fims_users')
        .update({ 
          active, 
          updated_at: new Date().toISOString() 
        })
        .eq('user_id', userId)
        .select('*');

      if (error) throw error;

      const { password_hash, ...updatedUser } = data[0];

      return { 
        success: true, 
        user: {
          id: updatedUser.user_id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          active: updatedUser.active !== false,
          avatar: updatedUser.avatar
        }
      };

    } catch (error) {
      console.error('Erro ao alterar status:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  },

  /**
   * Remover um usuário
   */
  async deleteUser(userId) {
    try {
      const { error } = await supabase
        .from('fims_users')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      // Se for o usuário atual, fazer logout
      const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
      if (currentUser && currentUser.id === userId) {
        await this.logout(userId);
      }

      return { success: true };

    } catch (error) {
      console.error('Erro ao remover usuário:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  },

  /**
   * Sincronizar usuários locais para o Supabase
   */
  async syncLocalUsers() {
    try {
      const localUsers = JSON.parse(localStorage.getItem('fims_users') || '[]');
      
      if (localUsers.length === 0) {
        return { success: true, message: 'Nenhum usuário local para sincronizar' };
      }

      const bcrypt = await import('bcryptjs');
      let successCount = 0;
      let errorCount = 0;

      for (const user of localUsers) {
        try {
          const salt = await bcrypt.default.genSalt(10);
          const passwordHash = await bcrypt.default.hash('fims2025', salt);

          const { error } = await supabase
            .from('fims_users')
            .upsert({
              user_id: `user_${user.id}`,
              name: user.name,
              email: user.email,
              password_hash: passwordHash,
              role: user.role || 'inspector',
              active: user.active !== false,
              avatar: user.avatar || user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            }, { onConflict: 'email' });

          if (error) {
            errorCount++;
          } else {
            successCount++;
          }
        } catch (e) {
          errorCount++;
        }
      }

      return { 
        success: true, 
        syncCount: successCount,
        errorCount
      };

    } catch (error) {
      console.error('Erro ao sincronizar usuários:', error);
      return { success: false, error: error.message };
    }
  }
};
