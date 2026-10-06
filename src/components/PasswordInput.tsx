import { useState, type InputHTMLAttributes } from 'react'
import '../styles/forms.css'

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement>

function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-input-wrapper">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
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
  )
}

export default PasswordInput
