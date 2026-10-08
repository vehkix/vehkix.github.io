import { useState, type FormEvent } from 'react'
import type { AuthFeedback } from '../types/auth'
import '../styles/forms.css'
import './EmailConfirmationPage.css'

interface EmailConfirmationPageProps {
  email: string
  isVerified: boolean
  onResend: (email: string) => Promise<AuthFeedback>
  onReturnToSignIn: () => void
}

function EmailConfirmationPage({
  email,
  isVerified,
  onResend,
  onReturnToSignIn,
}: EmailConfirmationPageProps) {
  const [emailAddress, setEmailAddress] = useState(email)
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)
    try {
      setFeedback(await onResend(emailAddress.trim()))
    } catch {
      setFeedback({ kind: 'error', message: 'Could not connect to the account service. Try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="email-confirmation-page" aria-labelledby="email-confirmation-title">
      <p className="eyebrow">ACCOUNT VERIFICATION</p>
      <h1 id="email-confirmation-title">
        {isVerified ? 'Email confirmed' : 'Check your inbox'}
      </h1>
      <p>
        {isVerified
          ? 'Your email address is confirmed. Your Vehkix account is ready.'
          : `We sent a confirmation link${emailAddress ? ` to ${emailAddress}` : ''}. Open it to verify your email address and activate your account.`}
      </p>
      {isVerified ? (
        <button className="primary-action" type="button" onClick={onReturnToSignIn}>
          Continue to Vehkix
        </button>
      ) : (
        <form className="email-confirmation-form" onSubmit={(event) => { void handleResend(event) }}>
          <label className="form-field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
            />
          </label>
          <button className="primary-action" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : 'Resend confirmation email'}
          </button>
          {feedback && (
            <p className={`form-feedback ${feedback.kind}`} role="status">
              {feedback.message}
            </p>
          )}
          <button className="auth-link" type="button" onClick={onReturnToSignIn}>
            Back to sign in
          </button>
        </form>
      )}
    </section>
  )
}

export default EmailConfirmationPage
