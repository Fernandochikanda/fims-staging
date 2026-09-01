// /src/pages/Login.jsx
import { useState } from "react";
import { SEED_USERS } from "../data/constants";
import { Icon } from "../lib/icons";
import { authService } from "../services/authService";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [useSeed, setUseSeed] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);

    try {
      // Modo Seed (offline)
      if (useSeed) {
        const user = SEED_USERS.find(u => u.email === email);
        if (user && password === "fims2025") {
          localStorage.setItem("fims_current_user", JSON.stringify(user));
          setLoading(false);
          onLogin(user);
          return;
        } else {
          setError("Email ou senha incorretos. Tente: admin@fims.co.mz / fims2025");
          setLoading(false);
          return;
        }
      }

      // Modo Supabase
      const result = await authService.login(email, password);
      
      if (result.success) {
        setLoading(false);
        onLogin(result.user);
      } else {
        setError(result.error || "Email ou senha incorretos");
        setLoading(false);
      }

    } catch (err) {
      console.error('Erro no login:', err);
      setError("Erro ao conectar ao servidor. Tente novamente.");
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1E2A3A", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="clipboard" size={20} style={{ color: "#fff" }} />
          </div>
          <div>
            <div className="login-logo">FIMS</div>
            <div className="login-sub">Field Inspection Management</div>
          </div>
        </div>

        {error && (
          <div className="alert-bar alert-critical" style={{ marginBottom: 16 }}>
            <Icon name="alert" size={14} />{error}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Email</label>
          <input 
            className="form-input" 
            type="email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            placeholder="seu@email.com" 
            onKeyDown={handleKeyPress}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Senha</label>
          <input 
            className="form-input" 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder="••••••••" 
            onKeyDown={handleKeyPress}
            disabled={loading}
          />
        </div>

        <button 
          className="btn btn-primary" 
          style={{ width: "100%", justifyContent: "center", padding: "10px" }} 
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8 }}></span>
              Entrando...
            </>
          ) : (
            'Entrar'
          )}
        </button>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input 
              type="checkbox" 
              checked={useSeed} 
              onChange={(e) => setUseSeed(e.target.checked)} 
            />
            Usar modo offline (seed)
          </label>
        </div>

        <div style={{ marginTop: 20, padding: "12px", background: "#F8F7F4", borderRadius: 8, fontSize: 11, color: "#888" }}>
          <strong>Credenciais</strong><br />
          {useSeed ? (
            <>
              admin@fims.co.mz → Admin<br />
              ceo@fims.co.mz → CEO<br />
              supervisor@fims.co.mz → Supervisor<br />
              inspector1@fims.co.mz → Inspetor<br />
              <em>Senha: fims2025</em>
            </>
          ) : (
            <>
              <span style={{ color: '#10B981' }}>✅ Conectado ao Supabase</span><br />
              Use as credenciais cadastradas no sistema
            </>
          )}
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
