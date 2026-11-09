import { useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../hooks/useAuth.js'
import { authErrorMessage } from '../utils/authErrorMessage.js'
import '../styles/pages.css'

export default function AuthForm({ creatingAccount = false }) {
  const { user, loading, initializing, error, clearError, signup, login, loginWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [validationError, setValidationError] = useState('')
  const [pending, setPending] = useState('')
  const busy = loading || Boolean(pending)

  async function submit(action) {
    if (busy) return
    clearError()
    setValidationError('')
    if (action === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setValidationError('Enter a valid email address.')
        return
      }
      if (!password) {
        setValidationError('Enter your password.')
        return
      }
      if (creatingAccount && password.length < 6) {
        setValidationError('Use at least 6 characters for your password.')
        return
      }
      if (creatingAccount && password !== confirmation) {
        setValidationError('Passwords do not match.')
        return
      }
    }
    setPending(action)
    try {
      if (action === 'google') await loginWithGoogle()
      else if (creatingAccount) await signup(email.trim(), password)
      else await login(email.trim(), password)
      setPassword('')
      setConfirmation('')
    } catch {
      // AuthProvider exposes Firebase errors for the alert below.
    } finally {
      setPending('')
    }
  }

  if (!initializing && user) return <Navigate to="/profile" replace />

  const message = validationError || (error ? authErrorMessage(error) : '')

  return (
    <section className="panel login-layout" aria-labelledby="login-title">
      <div className="login-introduction">
        <span className="brand-mark" aria-hidden="true">i</span>
        <p className="eyebrow">Your workspace</p>
        <h2>A home for your collection.</h2>
        <p>Keep your ideas, everyday essentials, and all the little details together.</p>
        <p className="login-aside-note">A little order. A clearer view.</p>
      </div>
      <div className="login-content" aria-busy={busy}>
        <h1 id="login-title">{creatingAccount ? 'Create account' : 'Login'}</h1>
        {message && <p className="auth-error" role="alert">{message}</p>}
        {initializing ? <p className="intro" role="status">Restoring your session…</p> : (
          <>
            <p className="intro">{creatingAccount ? 'Create your account with an email and password.' : 'Welcome back. Sign in to your account.'}</p>
            <form className="login-form" aria-label={creatingAccount ? 'Signup' : 'Login'} noValidate onSubmit={(event) => { event.preventDefault(); submit('email') }}>
              <fieldset disabled={busy}>
                <legend className="sr-only">{creatingAccount ? 'Create account' : 'Sign in'} with email</legend>
                <label htmlFor="login-email">Email</label>
                <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                <label htmlFor="login-password">Password</label>
                <input id="login-password" type="password" autoComplete={creatingAccount ? 'new-password' : 'current-password'} required minLength={creatingAccount ? 6 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} />
                {creatingAccount && <>
                  <p className="login-note">Use at least 6 characters.</p>
                  <label htmlFor="signup-confirmation">Confirm password</label>
                  <input id="signup-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
                </>}
                <button className="primary" type="submit" disabled={busy}>{pending === 'email' ? 'Please wait…' : creatingAccount ? 'Create account' : 'Sign in'}</button>
              </fieldset>
            </form>
            {!creatingAccount && <>
              <p className="auth-divider">or</p>
              <button className="auth-wide" type="button" disabled={busy} onClick={() => submit('google')}>
                {pending === 'google' ? 'Opening Google...' : 'Continue with Google'}
              </button>
            </>}
            <Link className="auth-switch" to={creatingAccount ? '/login' : '/signup'} onClick={() => { clearError(); setValidationError('') }}>
              {creatingAccount ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </Link>
          </>
        )}
        <p className="login-note">Your collection is stored in this browser and is not synced to your account.</p>
        <Link className="inline-link" to="/items">Continue to your collection <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  )
}
