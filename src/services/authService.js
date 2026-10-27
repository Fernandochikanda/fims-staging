// /src/services/authService.js
// ============================================================================
// Autenticação FIMS.
//
// REMEDIAÇÃO (audit SEC-002/SEC-003/IDN-001/UAF-001):
//  • Login via RPC fims_login — a senha é verificada NA BASE DE DADOS
//    (pgcrypto bcrypt) e NUNCA devolve password/password_hash ao cliente.
//    Fallback: fluxo legado (pré-migração) mantido para zero downtime.
//  • Senhas legadas em texto plano são convertidas para bcrypt no 1º login
//    (dentro do RPC, na BD).
//  • Identidade canónica: fims_users.user_id (formato 'usr_*') é o ID
//    autoritativo usado em notificações, mensagens, defeitos e sessões.
//  • CRUD de utilizadores via RPCs fims_save_user / fims_delete_user
//    (hash server-side, validação de role/email). Fallback legado mantido.
//  • authService.signUp implementado (antes não existia e o SignUp falhava).
// ============================================================================
import { supabase, rpcWithFallback } from '../lib/supabase';

/** Converte uma linha fims_users para o formato de sessão, SEM credenciais */
function toSessionUser(row) {
  // ID canónico: user_id ('usr_*'); fallback para id numérico apenas em BD
  // ainda não migradas (sem user_id preenchido).
  const canonicalId = row.user_id || (row.id != null ? String(row.id) : null);
  const name = row.name || 'Usuário';
  return {
    id: canonicalId,
    dbId: row.id != null ? row.id : undefined,
    name,
    email: row.email,
    role: row.role || 'inspector',
    active: row.active !== false,
    avatar: row.avatar || name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
  };
}

export const authService = {
  /**
   * Login com email e senha.
   * Preferencial: RPC fims_login (hash verificado na BD).
   * Fallback: consulta direta (BD pré-migração) com bcrypt no cliente.
   */
  async login(email, password) {
    // 1) Caminho seguro (RPC)
    try {
      const { data, error, usedRpc } = await rpcWithFallback('fims_login', {
        p_email: email, p_password: password,
      }, null);

      if (usedRpc) {
        if (error) {
          return { success: false, error: 'Erro ao conectar ao servidor' };
        }
        const payload = typeof data === 'string' ? JSON.parse(data) : data;
        if (!payload || payload.error || !payload.user) {
          return { success: false, error: (payload && payload.error) || 'Email ou senha incorretos' };
        }
        const user = payload.user;
        localStorage.setItem('fims_current_user', JSON.stringify(user));
        await this.logActivity(user.id, 'Login', 'login', 'Entrou no sistema');
        return { success: true, user };
      }
    } catch (e) { /* cai para o fallback */ }

    // 2) Fallback legado (BD sem a migração) — mesmo comportamento de antes
    return this.loginLegacy(email, password);
  },

  /** Fluxo legado: seleciona o utilizador e compara a senha no cliente. */
  async loginLegacy(email, password) {
    try {
      const { data: users, error } = await supabase
        .from('fims_users')
        .select('*')
        .eq('email', email)
        .eq('active', true)
        .limit(1);

      if (error) {
        return this.loginWithSupabaseAuth(email, password);
      }

      if (!users || users.length === 0) {
        return this.loginWithSupabaseAuth(email, password);
      }

      const user = users[0];

      if (user.password_hash) {
        const bcrypt = await import('bcryptjs');
        const isValid = await bcrypt.default.compare(password, user.password_hash);
        if (!isValid) {
          return { success: false, error: 'Senha incorreta' };
        }
      } else if (user.password !== undefined && user.password !== null) {
        if (user.password !== password) {
          return { success: false, error: 'Senha incorreta' };
        }
      } else {
        return this.loginWithSupabaseAuth(email, password);
      }

      const formattedUser = toSessionUser(user);
      localStorage.setItem('fims_current_user', JSON.stringify(formattedUser));
      await this.logActivity(formattedUser.id, 'Login', 'login', 'Entrou no sistema');
      return { success: true, user: formattedUser };
    } catch (error) {
      return this.loginWithSupabaseAuth(email, password);
    }
  },

  /**
   * Login com Supabase Auth (fallback).
   * ID canónico continua a ser fims_users.user_id quando a linha existir.
   */
  async loginWithSupabaseAuth(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        return { success: false, error: 'Email ou senha incorretos' };
      }

      const { data: userData } = await supabase
        .from('fims_users')
        .select('id, user_id, name, email, role, active, avatar')
        .eq('email', email)
        .maybeSingle();

      const user = {
        id: (userData && userData.user_id) || data.user.id, // canónico quando existir
        dbId: userData ? userData.id : undefined,
        name: (userData && userData.name) || data.user.email?.split('@')[0] || 'Usuário',
        email: data.user.email,
        role: (userData && userData.role) || 'inspector',
        active: true,
        avatar: (userData && userData.avatar) || data.user.email?.substring(0, 2).toUpperCase() || 'US',
      };

      localStorage.setItem('fims_current_user', JSON.stringify(user));
      await this.logActivity(user.id, 'Login', 'login', 'Entrou no sistema (Supabase Auth)');
      return { success: true, user };
    } catch (error) {
      return { success: false, error: 'Erro ao conectar ao servidor' };
    }
  },

  /**
   * Criar conta (página SignUp) — antes este método NÃO EXISTIA e o fluxo
   * falhava sempre. Cria utilizador com role 'inspector'.
   */
  async signUp(email, password, name) {
    if (!email || !password || password.length < 6) {
      return { success: false, error: 'Email e senha (mín. 6 caracteres) obrigatórios' };
    }
    const create = await this.createUser({ name: name || email.split('@')[0], email, password, role: 'inspector' });
    if (!create.success) return create;
    return { success: true, user: create.user, message: 'Conta criada com sucesso! Já pode entrar.' };
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
      try { await supabase.auth.signOut(); } catch (e) { /* sem sessão Supabase Auth */ }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Registrar atividade no log
   */
  async logActivity(userId, action, type, detail) {
    try {
      let userName = 'Usuário';
      const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
      if (currentUser) userName = currentUser.name;

      const logEntry = {
        id: Date.now() + Math.random() * 1000,
        timestamp: new Date().toISOString(),
        user: userName,
        action,
        type,
        detail,
      };

      const logs = JSON.parse(localStorage.getItem('fims_logs') || '[]');
      logs.unshift(logEntry);
      localStorage.setItem('fims_logs', JSON.stringify(logs.slice(0, 1000)));

      try {
        await supabase.from('fims_logs').insert([{
          user_id: userId,
          user_name: userName,
          action,
          type,
          detail,
          timestamp: new Date().toISOString(),
        }]);
      } catch (e) { /* tabela pode não existir */ }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Buscar todos os utilizadores — APENAS colunas seguras (nunca credenciais).
   * id canónico = user_id ('usr_*').
   */
  async fetchAllUsers() {
    try {
      const { data, error } = await supabase
        .from('fims_users')
        .select('id, user_id, name, email, role, active, avatar')
        .order('name');

      if (error) {
        const seedUsers = JSON.parse(localStorage.getItem('fims_users') || '[]');
        return { success: true, users: seedUsers };
      }

      const users = (data || []).map(u => toSessionUser(u));
      return { success: true, users };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Criar um novo utilizador — RPC fims_save_user (hash server-side).
   * Fallback: fluxo legado com bcrypt no cliente (BD pré-migração).
   */
  async createUser(userData) {
    const payload = {
      p_data: {
        name: userData.name,
        email: userData.email,
        password: userData.password,
        role: userData.role || 'inspector',
        active: userData.active !== false,
      },
    };

    const { data, error, usedRpc } = await rpcWithFallback('fims_save_user', payload, async () => {
      // Fallback legado (pré-migração): hash no cliente + insert direto
      const bcrypt = await import('bcryptjs');
      const salt = await bcrypt.default.genSalt(10);
      const passwordHash = await bcrypt.default.hash(userData.password, salt);
      const newUser = {
        user_id: `user_${Date.now()}`,
        name: userData.name,
        email: userData.email,
        password_hash: passwordHash,
        role: userData.role || 'inspector',
        active: userData.active !== false,
        avatar: userData.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
      };
      const { data: d, error: e } = await supabase.from('fims_users').insert([newUser]).select('*');
      if (e) throw e;
      return { user: toSessionUser(d[0]) };
    });

    if (error) {
      return { success: false, error: error.message || 'Erro ao criar utilizador' };
    }
    const out = typeof data === 'string' ? JSON.parse(data) : data;
    if (!out || out.error) {
      return { success: false, error: (out && out.error) || 'Erro ao criar utilizador' };
    }
    return { success: true, user: toSessionUser(out.user) };
  },

  /**
   * Atualizar um utilizador — RPC fims_save_user; fallback legado.
   */
  async updateUser(userId, updates) {
    const payload = {
      p_data: {
        user_id: userId,
        name: updates.name,
        email: updates.email,
        role: updates.role,
        active: updates.active,
        avatar: updates.avatar,
        password: updates.password || null,
      },
    };

    const { data, error, usedRpc } = await rpcWithFallback('fims_save_user', payload, async () => {
      const patch = { ...updates, updated_at: new Date().toISOString() };
      if (patch.password) {
        const bcrypt = await import('bcryptjs');
        const salt = await bcrypt.default.genSalt(10);
        patch.password_hash = await bcrypt.default.hash(patch.password, salt);
        delete patch.password;
      }
      const { data: d, error: e } = await supabase
        .from('fims_users')
        .update(patch)
        .eq('user_id', userId)
        .select('*');
      if (e) throw e;
      return { user: d && d[0] ? d[0] : null }; // linha crua; formatada depois
    });

    if (error) {
      return { success: false, error: error.message };
    }
    const out = typeof data === 'string' ? JSON.parse(data) : data;
    if (!out || out.error) {
      return { success: false, error: (out && out.error) || 'Erro ao atualizar utilizador' };
    }
    const updatedUser = toSessionUser(out.user);

    const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
    if (currentUser && currentUser.id === userId) {
      localStorage.setItem('fims_current_user', JSON.stringify(updatedUser));
    }
    return { success: true, user: updatedUser };
  },

  /**
   * Ativar/Desativar um utilizador
   */
  async toggleUserStatus(userId, active) {
    return this.updateUser(userId, { active });
  },

  /**
   * Remover um utilizador — RPC fims_delete_user; fallback legado.
   */
  async deleteUser(userId) {
    const { data, error, usedRpc } = await rpcWithFallback('fims_delete_user', { p_user_id: userId }, async () => {
      const { error: e } = await supabase.from('fims_users').delete().eq('user_id', userId);
      if (e) throw e;
      return { ok: true };
    });

    if (error) {
      return { success: false, error: error.message };
    }
    const out = typeof data === 'string' ? JSON.parse(data) : data;
    if (!out || out.error) {
      return { success: false, error: (out && out.error) || 'Erro ao remover utilizador' };
    }

    const currentUser = JSON.parse(localStorage.getItem('fims_current_user') || 'null');
    if (currentUser && currentUser.id === userId) {
      await this.logout(userId);
    }
    return { success: true };
  },

  /**
   * Sincronizar utilizadores locais para o Supabase
   */
  async syncLocalUsers() {
    try {
      const localUsers = JSON.parse(localStorage.getItem('fims_users') || '[]');
      if (localUsers.length === 0) {
        return { success: true, message: 'Nenhum utilizador local para sincronizar' };
      }

      let successCount = 0;
      let errorCount = 0;

      for (const user of localUsers) {
        try {
          // senha padrão redefinida via RPC (hash server-side); fallback legado
          const res = await this.createUser({
            name: user.name,
            email: user.email,
            password: 'fims2025',
            role: user.role || 'inspector',
            active: user.active !== false,
          });
          if (res.success) successCount++; else errorCount++;
        } catch (e) {
          errorCount++;
        }
      }

      return { success: true, syncCount: successCount, errorCount };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export default authService;
