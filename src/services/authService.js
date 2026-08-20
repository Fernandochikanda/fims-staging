import { supabase } from '../lib/supabase'

export const authService = {
  async login(email, password) {
    console.log('[login] Attempting:', email);
    try {
      // Step 1: Try Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.log('[login] Supabase Auth failed:', error.message);
        console.log('[login] Trying database fallback...');

        // Step 2: Inline database fallback (NO this.loginWithDatabase)
        const { data: dbUsers, error: dbError } = await supabase
          .from('fims_users')
          .select('*')
          .eq('email', email)
          .eq('active', true)
          .limit(1);

        if (dbError) {
          console.log('[login] DB query error:', dbError.message);
          return { success: false, error: 'Email ou senha incorretos' };
        }

        if (!dbUsers || dbUsers.length === 0) {
          console.log('[login] User not found in fims_users');
          return { success: false, error: 'Email ou senha incorretos' };
        }

        const dbUser = dbUsers[0];
        console.log('[login] Found in fims_users:', dbUser.name);

        // Check password
        if (dbUser.password_hash) {
          const bcrypt = await import('bcryptjs');
          const isValid = await bcrypt.default.compare(password, dbUser.password_hash);
          if (!isValid) {
            console.log('[login] Password hash mismatch');
            return { success: false, error: 'Senha incorreta' };
          }
        } else if (dbUser.password && dbUser.password !== password) {
          console.log('[login] Plaintext password mismatch');
          return { success: false, error: 'Senha incorreta' };
        }

        const { password_hash, password: pwd, ...userData } = dbUser;
        const formattedUser = {
          id: userData.user_id || userData.id,
          name: userData.name,
          email: userData.email,
          role: userData.role || 'inspector',
          active: userData.active !== false,
          avatar: userData.avatar || (userData.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
        };

        localStorage.setItem('fims_current_user', JSON.stringify(formattedUser));
        console.log('[login] Success via database:', formattedUser.name);

        // Log activity (inline, no this.logActivity)
        try {
          const logs = JSON.parse(localStorage.getItem('fims_logs') || '[]');
          logs.unshift({
            id: Date.now(), timestamp: new Date().toISOString(),
            user: formattedUser.name, action: 'Login', type: 'login',
            detail: 'Entrou no sistema (DB)'
          });
          localStorage.setItem('fims_logs', JSON.stringify(logs.slice(0, 1000)));

          await supabase.from('fims_logs').insert([{
            id: String(Date.now()),
            user_id: formattedUser.id, user_name: formattedUser.name,
            action: 'Login', type: 'login', detail: 'Entrou no sistema (DB)',
            timestamp: new Date().toISOString()
          }]);
        } catch (logErr) {
          console.warn('[login] Log error (ignored):', logErr.message);
        }

        return { success: true, user: formattedUser };
      }

      // Step 3: Supabase Auth success - fetch profile
      console.log('[login] Supabase Auth success');
      const { data: userData } = await supabase
        .from('fims_users')
        .select('*')
        .eq('email', email)
        .single();

      const user = {
        id: data.user.id,
        name: userData?.name || email.split('@')[0],
        email: data.user.email,
        role: userData?.role || 'inspector',
        active: userData?.active !== false,
        avatar: userData?.avatar || email.substring(0, 2).toUpperCase()
      };

      localStorage.setItem('fims_current_user', JSON.stringify(user));
      console.log('[login] Success via Supabase Auth:', user.name);

      // Log activity (inline)
      try {
        const logs = JSON.parse(localStorage.getItem('fims_logs') || '[]');
        logs.unshift({
          id: Date.now(), timestamp: new Date().toISOString(),
          user: user.name, action: 'Login', type: 'login',
          detail: 'Entrou no sistema'
        });
        localStorage.setItem('fims_logs', JSON.stringify(logs.slice(0, 1000)));

        await supabase.from('fims_logs').insert([{
          id: String(Date.now()),
          user_id: user.id, user_name: user.name,
          action: 'Login', type: 'login', detail: 'Entrou no sistema',
          timestamp: new Date().toISOString()
        }]);
      } catch (logErr) {
        console.warn('[login] Log error (ignored):', logErr.message);
      }

      return { success: true, user };

    } catch (error) {
      console.error('[login] Exception:', error);
      return { success: false, error: 'Erro ao conectar ao servidor' };
    }
  },

  async logout(userId) {
    try {
      const logs = JSON.parse(localStorage.getItem('fims_logs') || '[]');
      const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
      logs.unshift({
        id: Date.now(), timestamp: new Date().toISOString(),
        user: currentUser?.name || 'User', action: 'Logout', type: 'logout',
        detail: 'Saiu do sistema'
      });
      localStorage.setItem('fims_logs', JSON.stringify(logs.slice(0, 1000)));

      try {
        await supabase.from('fims_logs').insert([{
          id: String(Date.now()),
          user_id: userId, user_name: currentUser?.name || 'User',
          action: 'Logout', type: 'logout', detail: 'Saiu do sistema',
          timestamp: new Date().toISOString()
        }]);
      } catch (e) {}

      localStorage.removeItem('fims_current_user');
      try { await supabase.auth.signOut(); } catch (e) {}
      return { success: true };
    } catch (error) {
      console.error('Erro no logout:', error);
      return { success: false, error: error.message };
    }
  },

  async signUp(email, password, name) {
    try {
      console.log('[signUp] Attempting:', email);
      const { data, error } = await supabase.auth.signUp({ email, password });
      console.log('[signUp] Response:', { data, error });

      if (error) {
        let msg = error.message || 'Erro ao criar conta';
        if (msg.includes('already registered')) msg = 'Este email ja esta cadastrado.';
        if (msg.includes('rate limit') || msg.includes('too many')) msg = 'Muitas tentativas. Aguarde.';
        if (msg.includes('password') && msg.includes('6')) msg = 'Senha deve ter pelo menos 6 caracteres.';
        return { success: false, error: msg };
      }

      const authUser = data.user;
      if (!authUser) {
        return { success: true, user: null, message: 'Conta criada! Verifique seu email.' };
      }

      const userName = name || email.split('@')[0] || 'Usuario';
      const avatar = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

      const { error: insertError } = await supabase
        .from('fims_users')
        .insert([{
          user_id: authUser.id, name: userName, email: email,
          password_hash: null, role: 'inspector', active: true, avatar: avatar
        }]);

      if (insertError) {
        console.warn('[signUp] fims_users insert error:', insertError.message);
      } else {
        console.log('[signUp] Profile inserted');
      }

      return { success: true, user: { id: authUser.id, email, name: userName, role: 'inspector' } };
    } catch (error) {
      console.error('[signUp] Exception:', error);
      return { success: false, error: error.message || 'Erro ao criar conta' };
    }
  },

  async resetPassword(email) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async changePassword(newPassword) {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async fetchAllUsers() {
    try {
      const { data, error } = await supabase.from('fims_users').select('*').order('name');
      if (error) {
        console.warn('[fetchAllUsers] error:', error.message);
        const seedUsers = JSON.parse(localStorage.getItem('fims_users') || '[]');
        return { success: true, users: seedUsers };
      }
      const users = data.map(u => ({
        id: u.user_id || u.id, name: u.name, email: u.email,
        role: u.role || 'inspector', active: u.active !== false,
        avatar: u.avatar || (u.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      }));
      return { success: true, users };
    } catch (error) {
      console.error('[fetchAllUsers] error:', error);
      return { success: false, error: error.message };
    }
  },

  async createUser(userData) {
    try {
      const bcrypt = await import('bcryptjs');
      const salt = await bcrypt.default.genSalt(10);
      const passwordHash = await bcrypt.default.hash(userData.password, salt);

      const { data, error } = await supabase.from('fims_users').insert([{
        user_id: `user_${Date.now()}`, name: userData.name, email: userData.email,
        password_hash: passwordHash, role: userData.role || 'inspector', active: true,
        avatar: userData.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      }]).select('*');

      if (error) throw error;
      const { password_hash, ...created } = data[0];
      return {
        success: true,
        user: { id: created.user_id, name: created.name, email: created.email,
               role: created.role, active: true, avatar: created.avatar }
      };
    } catch (error) {
      console.error('Erro ao criar usuario:', error);
      return { success: false, error: error.message || 'Erro ao criar usuario' };
    }
  },

  async updateUser(userId, updates) {
    try {
      if (updates.password) {
        const bcrypt = await import('bcryptjs');
        const salt = await bcrypt.default.genSalt(10);
        updates.password_hash = await bcrypt.default.hash(updates.password, salt);
        delete updates.password;
      }

      const { data, error } = await supabase
        .from('fims_users')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select('*');

      if (error) throw error;
      const { password_hash, ...updated } = data[0];

      const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
      if (currentUser && currentUser.id === userId) {
        localStorage.setItem('fims_current_user', JSON.stringify({
          id: updated.user_id, name: updated.name, email: updated.email,
          role: updated.role, active: updated.active !== false, avatar: updated.avatar
        }));
      }

      return {
        success: true,
        user: { id: updated.user_id, name: updated.name, email: updated.email,
               role: updated.role, active: updated.active !== false, avatar: updated.avatar }
      };
    } catch (error) {
      console.error('Erro ao atualizar usuario:', error);
      return { success: false, error: error.message };
    }
  },

  async toggleUserStatus(userId, active) {
    try {
      const { data, error } = await supabase
        .from('fims_users')
        .update({ active, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .select('*');

      if (error) throw error;
      const { password_hash, ...updated } = data[0];
      return {
        success: true,
        user: { id: updated.user_id, name: updated.name, email: updated.email,
               role: updated.role, active: updated.active !== false, avatar: updated.avatar }
      };
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      return { success: false, error: error.message };
    }
  },

  async deleteUser(userId) {
    try {
      const { error } = await supabase.from('fims_users').delete().eq('user_id', userId);
      if (error) throw error;
      const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
      if (currentUser && currentUser.id === userId) {
        localStorage.removeItem('fims_current_user');
        try { await supabase.auth.signOut(); } catch (e) {}
      }
      return { success: true };
    } catch (error) {
      console.error('Erro ao remover usuario:', error);
      return { success: false, error: error.message };
    }
  }
}
