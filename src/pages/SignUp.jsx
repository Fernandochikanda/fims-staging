import { useState } from 'react'
import { authService } from '../services/authService'
import { showToast } from '../lib/toast'
import { useAuth } from '../context/AuthContext'

export default function SignUp() {
  const { setShowSignUp } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await authService.signUp(email, password, name)
    if (result.success) {
      if (result.message) { showToast(result.message, 'info', 5000) }
      else { showToast('Conta criada com sucesso!', 'success') }
      setShowSignUp(false)
    } else {
      setError(result.error || 'Erro ao criar conta')
      showToast(result.error || 'Erro ao criar conta', 'error')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 32, borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <h2 style={{ marginBottom: 24, fontSize: 20, fontWeight: 600 }}>Criar Conta</h2>
        {error && (<div style={{ background: '#FEF2F2', color: '#991B1B', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13, borderLeft: '3px solid #EF4444' }}>{error}</div>)}
        <div style={{ marginBottom: 16 }}><input type="text" placeholder="Nome (opcional)" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 }} /></div>
        <div style={{ marginBottom: 16 }}><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 }} /></div>
        <div style={{ marginBottom: 16 }}><input type="password" placeholder="Senha (min 6 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="6" style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 }} /></div>
        <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px 16px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Cadastrando...' : 'Cadastrar'}</button>
        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#6B7280' }}>
          Ja tem conta? <button type="button" onClick={() => setShowSignUp(false)} style={{ background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>Entrar</button>
        </p>
      </form>
    </div>
  )
}
