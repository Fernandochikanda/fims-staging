// /src/pages/Login.jsx
import { useState } from "react";
import { Icon } from "../lib/icons";
import { authService } from "../services/authService";
import logoUrl from "../LOGO.png"; // Importação do seu logótipo

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);

    try {
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
        {/* LOGOTIPO ADICIONADO AQUI */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <img src={logoUrl} alt="Nemchem Logo" style={{ height: 70, width: 'auto', marginBottom: 10 }} />
          <div style={{ textAlign: 'center' }}>
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
            type={showPassword ? "text" : "password"} 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder="••••••••" 
            onKeyDown={handleKeyPress}
            disabled={loading}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280", marginTop: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} style={{ cursor: "pointer" }} />
            Mostrar senha
          </label>
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

        <div style={{ marginTop: 20, padding: "12px", background: "#F8F7F4", borderRadius: 8, fontSize: 11, color: "#888" }}>
          <strong>Credenciais</strong><br />
          <span style={{ color: '#10B981' }}>✅ Autenticação segura via Supabase</span><br />
          Use as credenciais cadastradas no sistema
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
