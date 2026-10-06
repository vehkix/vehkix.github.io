import { useState, type FormEvent } from 'react'
import type { AuthFeedback, AuthMode, AuthValues } from '../types/auth'
import '../styles/forms.css'
import './AuthPanel.css'

export type { AuthFeedback, AuthMode, AuthValues } from '../types/auth'

interface AuthPanelProps {
  onSubmit: (mode: AuthMode, values: AuthValues) => Promise<AuthFeedback>
  onForgotPassword: (email: string) => Promise<AuthFeedback>
}

function AuthPanel({ onSubmit, onForgotPassword }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isSignUp = mode === 'sign-up'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)
    try {
      setFeedback(await onSubmit(mode, { username: username.trim(), email: email.trim(), password }))
    } catch {
      setFeedback({ kind: 'error', message: 'Could not connect to the account service. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setFeedback({ kind: 'error', message: 'Enter your email address first.' })
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      setFeedback(await onForgotPassword(email.trim()))
    } catch {
      setFeedback({ kind: 'error', message: 'Could not connect to the account service. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setFeedback(null)
  }

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-intro">
        <h2 id="auth-title">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
        <p>Your own automotive companion.</p>
      </div>
      <div className="auth-form-area">
        <div className="mode-switch" aria-label="Account access mode">
          <button type="button" aria-pressed={!isSignUp} onClick={() => changeMode('sign-in')}>
            Log in
          </button>
          <button type="button" aria-pressed={isSignUp} onClick={() => changeMode('sign-up')}>
            Sign up
          </button>
        </div>
        <form className="stacked-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <label className="form-field">
              <span>Username</span>
              <input
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]{3,32}"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. fayis_dev"
              />
              <small>3–32 letters, numbers, or underscores</small>
            </label>
          )}
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <div className="form-field">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-password-input">
              <input
                id="auth-password"
                type={passwordVisible ? 'text' : 'password'}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={isSignUp ? 8 : undefined}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
              />
              <button
                className="password-visibility-toggle"
                type="button"
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7-.4 1-1.3 2.3-2.6 3.5M6.2 6.2C3.9 7.7 2.8 9.8 2.5 12c1 2.5 4.5 7 9.5 7 1.2 0 2.3-.3 3.3-.8" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {!isSignUp && (
            <button
              className="auth-link"
              type="button"
              disabled={submitting}
              onClick={() => { void handleForgotPassword() }}
            >
              Forgot password?
            </button>
          )}
          <button className="primary-action" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Log in'}
          </button>
          {feedback && (
            <p className={`form-feedback ${feedback.kind}`} role="status">
              {feedback.message}
            </p>
          )}
        </form>
      </div>
    </section>
  )
}

export default AuthPanel