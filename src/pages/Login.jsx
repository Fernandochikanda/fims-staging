import { useState } from "react";
import { SEED_USERS } from "../data/constants";
import { Icon } from "../lib/icons";
import { authService } from "../services/authService";
import { useAuth } from "../context/AuthContext";

export default function Login({ onLogin }) {
  const { setShowSignUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [useSeed, setUseSeed] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
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
      const result = await authService.login(email, password);
      if (result.success) { setLoading(false); onLogin(result.user); }
      else { setError(result.error || "Email ou senha incorretos"); setLoading(false); }
    } catch (err) {
      setError("Erro ao conectar ao servidor. Tente novamente.");
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => { if (e.key === "Enter") handleLogin(); };

  const handleForgotPassword = async () => {
    setError(""); setLoading(true); setResetSent(false);
    try {
      const result = await authService.resetPassword(resetEmail);
      if (result.success) setResetSent(true);
      else setError(result.error || "Erro ao enviar email");
    } catch (err) { setError("Erro ao enviar email."); }
    setLoading(false);
  };

  if (showForgot) {
    return (
      <div className="login-page"><div className="login-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1E2A3A", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="clipboard" size={20} style={{ color: "#fff" }} />
          </div>
          <div><div className="login-logo">FIMS</div><div className="login-sub">Field Inspection Management</div></div>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Recuperar Senha</h2>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Digite seu email para receber o link de recuperação.</p>
        {resetSent ? (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#D1FAE5", color: "#065F46", fontSize: 13 }}>
            <strong>✅ Email enviado!</strong><br />Verifique <strong>{resetEmail}</strong>.
          </div>
        ) : (<>
          {error && (<div className="alert-bar alert-critical" style={{ marginBottom: 16 }}><Icon name="alert" size={14} />{error}</div>)}
          <div className="form-group"><label className="form-label">Email</label>
            <input className="form-input" type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="seu@email.com" disabled={loading} />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "10px" }} onClick={handleForgotPassword} disabled={loading || !resetEmail}>
            {loading ? "Enviando..." : "Enviar link"}
          </button>
        </>)}
        <p style={{ marginTop: 16, textAlign: "center" }}>
          <button type="button" onClick={() => { setShowForgot(false); setResetSent(false); setError(""); setResetEmail(""); }}
            style={{ background: "none", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>Voltar para login</button>
        </p>
      </div></div>
    );
  }

  return (
    <div className="login-page"><div className="login-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1E2A3A", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="clipboard" size={20} style={{ color: "#fff" }} />
        </div>
        <div><div className="login-logo">FIMS</div><div className="login-sub">Field Inspection Management</div></div>
      </div>
      {error && (<div className="alert-bar alert-critical" style={{ marginBottom: 16 }}><Icon name="alert" size={14} />{error}</div>)}
      <div className="form-group"><label className="form-label">Email</label>
        <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" onKeyDown={handleKeyPress} disabled={loading} />
      </div>
      <div className="form-group"><label className="form-label">Senha</label>
        <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={handleKeyPress} disabled={loading} />
      </div>
      <div style={{ textAlign: "right", marginBottom: 12 }}>
        <button type="button" onClick={() => setShowForgot(true)} style={{ background: "none", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0 }}>Esqueceu a senha?</button>
      </div>
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "10px" }} onClick={handleLogin} disabled={loading}>
        {loading ? (<><span className="spinner" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8 }}></span>Entrando...</>) : 'Entrar'}
      </button>
      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 12, color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />Usar modo offline (seed)
        </label>
      </div>
      <div style={{ marginTop: 20, padding: "12px", background: "#F8F7F4", borderRadius: 8, fontSize: 11, color: "#888" }}>
        <strong>Credenciais</strong><br />
        {useSeed ? (<>
          admin@fims.co.mz → Admin<br />ceo@fims.co.mz → CEO<br />supervisor@fims.co.mz → Supervisor<br />inspector1@fims.co.mz → Inspetor<br /><em>Senha: fims2025</em>
        </>) : (<><span style={{ color: '#10B981' }}>✅ Conectado ao Supabase</span><br />Use as credenciais cadastradas</>)}
      </div>
      <p style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "#888" }}>
        Não tem conta? <button type="button" onClick={() => setShowSignUp(true)} style={{ background: "none", border: "none", color: "#2563EB", cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0 }}>Cadastre-se</button>
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div></div>
  );
}
