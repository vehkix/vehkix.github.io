import { useState, type FormEvent } from 'react'
import type { AuthFeedback } from '../types/auth'
import '../styles/forms.css'
import './AuthPanel.css'

interface PasswordRecoveryPanelProps {
  onUpdatePassword: (password: string) => Promise<AuthFeedback>
}

function PasswordRecoveryPanel({ onUpdatePassword }: PasswordRecoveryPanelProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (password !== confirmPassword) {
      setFeedback({ kind: 'error', message: 'The passwords do not match.' })
      return
    }

    setSubmitting(true)
    try {
      setFeedback(await onUpdatePassword(password))
    } catch {
      setFeedback({ kind: 'error', message: 'Could not connect to the account service. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-panel" aria-labelledby="password-recovery-title">
      <div className="auth-intro">
        <h2 id="password-recovery-title">Choose a new password</h2>
        <p>Set a new password for your Vehkix account.</p>
      </div>
      <div className="auth-form-area">
        <form className="stacked-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <label className="form-field">
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Enter the password again"
            />
          </label>
          <button className="primary-action" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : 'Update password'}
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

export default PasswordRecoveryPanel
