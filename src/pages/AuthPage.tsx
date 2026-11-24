import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import Logo from '../components/Logo'

type AuthMode = 'login' | 'signup' | 'forgot'

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  const apiUrl = configuredApiUrl || (import.meta.env.DEV ? 'http://localhost:4000' : '')
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!apiUrl) {
      setError('Account services are not configured yet. You can use the PDF tools without an account.')
      return
    }
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    }
    const endpoint = mode === 'signup' ? '/api/auth/register' : mode === 'forgot' ? '/api/auth/forgot-password' : '/api/auth/login'
    try {
      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to complete this request')
      if (mode === 'forgot') setSubmitted(true)
      else navigate('/dashboard')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reach the authentication service')
    }
  }
  const copy = mode === 'signup'
    ? { title: 'Create your workspace', button: 'Create account', note: 'Already have an account?', link: 'Log in', to: '/login' }
    : mode === 'forgot'
      ? { title: 'Reset your password', button: 'Send reset link', note: 'Remembered your password?', link: 'Log in', to: '/login' }
      : { title: 'Welcome back', button: 'Log in', note: 'New to Fylqen?', link: 'Create account', to: '/signup' }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="auth-card">
          <Link to="/"><Logo /></Link>
          <h1>{submitted ? 'Check your email' : copy.title}</h1>
          <p>{submitted ? 'Follow the instructions sent to your email address.' : 'Core PDF tools remain available without an account.'}</p>
          {!submitted && (
            <form className="form" onSubmit={submit}>
              {mode === 'signup' && <label className="field">Full name<input name="name" autoComplete="name" required /></label>}
              <label className="field">Email address<input type="email" name="email" autoComplete="email" required /></label>
              {mode !== 'forgot' && <label className="field">Password<input type="password" name="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required /></label>}
              <button className="button button-primary" type="submit" disabled={!apiUrl}>{copy.button}</button>
              {!apiUrl && <p role="status" style={{ color: '#777487', fontSize: 13, margin: 0 }}>Account services are unavailable until the backend is deployed. PDF tools work without an account.</p>}
              {error && <div className="error-message" role="alert">{error}</div>}
            </form>
          )}
          <p style={{ marginTop: 20, fontSize: 13 }}>{copy.note} <Link to={copy.to} style={{ color: '#7059e8', fontWeight: 700 }}>{copy.link}</Link></p>
          {submitted && <button className="button button-secondary" type="button" onClick={() => setSubmitted(false)}><ArrowLeft size={16} /> Back</button>}
        </div>
      </section>
      <aside className="auth-aside"><div><ShieldCheck size={28} /><h2 style={{ maxWidth: 420, margin: '18px 0 8px', fontSize: 32 }}>Your files stay yours.</h2><p style={{ color: '#d7d2e8', maxWidth: 420 }}>Fylqen processes documents locally by default. Cloud storage is only used when you explicitly enable it.</p></div></aside>
    </main>
  )
}
