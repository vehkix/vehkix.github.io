import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabaseClient } from '../lib/supabase'
import { getUsernameInitials } from '../lib/profile'
import '../styles/forms.css'
import './ProfilePanel.css'
import PasswordInput from './PasswordInput'

interface ProfilePanelProps {
  userId: string
  accountEmail: string
  initialUsername: string
  onUpdateUsername: (username: string) => Promise<string | null>
  onAvatarChanged: () => void
  onDeletionConfirmed: () => Promise<string | null>
  onSignOut: () => Promise<string | null>
}

interface DeletionRequest {
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  requested_at: string
}

interface AccountVehicleShare {
  share_id: string
  vehicle_id: string
  vehicle_label: string
  username: string
  direction: 'shared_by_you' | 'shared_with_you'
  status: 'pending' | 'accepted' | 'rejected'
}

function ProfilePanel({
  userId,
  accountEmail,
  initialUsername,
  onUpdateUsername,
  onAvatarChanged,
  onDeletionConfirmed,
  onSignOut,
}: ProfilePanelProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState(initialUsername)
  const [savedUsername, setSavedUsername] = useState(initialUsername)
  const [availability, setAvailability] = useState<{
    candidate: string
    status: 'checking' | 'available' | 'taken' | 'error'
  } | null>(null)
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<{ path: string; url: string } | null>(null)
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null)
  const [deletionEmail, setDeletionEmail] = useState('')
  const [showDeletionConfirmation, setShowDeletionConfirmation] = useState(false)
  const [vehicleShares, setVehicleShares] = useState<AccountVehicleShare[]>([])
  const [vehicleSharesLoading, setVehicleSharesLoading] = useState(true)
  const [vehicleSharesError, setVehicleSharesError] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const usernameAvailability = availability?.candidate === username.trim()
    ? availability.status
    : 'idle'

  useEffect(() => {
    const candidate = username.trim()
    if (
      candidate === savedUsername
      || !/^[A-Za-z0-9_]{3,32}$/.test(candidate)
      || !supabaseClient
    ) {
      return
    }

    const client = supabaseClient
    let current = true
    const timeoutId = window.setTimeout(() => {
      setAvailability({ candidate, status: 'checking' })
      void (async () => {
        try {
          const { data, error: checkError } = await client.rpc('is_my_username_available', {
            candidate_username: candidate,
          })
          if (current) {
            setAvailability({
              candidate,
              status: checkError ? 'error' : data ? 'available' : 'taken',
            })
          }
        } catch {
          if (current) setAvailability({ candidate, status: 'error' })
        }
      })()
    }, 350)

    return () => {
      current = false
      window.clearTimeout(timeoutId)
    }
  }, [savedUsername, username])

  useEffect(() => {
    if (!supabaseClient) return
    let current = true
    const client = supabaseClient

    async function loadProfile() {
      try {
        const [profileResult, deletionResult, sharesResult] = await Promise.all([
          client.from('profiles').select('username, avatar_path').eq('id', userId).single(),
          client.rpc('get_my_deletion_request'),
          client.rpc('list_my_account_vehicle_shares'),
        ])
        if (!current) return
        if (profileResult.error || deletionResult.error) {
          setError('Could not load your profile. Run the latest user-account SQL in Supabase.')
          setVehicleSharesError('Could not load vehicle sharing details.')
          setVehicleSharesLoading(false)
          return
        }
        if (profileResult.data) {
          setUsername(profileResult.data.username)
          setSavedUsername(profileResult.data.username)
          setAvatarPath(profileResult.data.avatar_path)
        }
        const latestRequest = deletionResult.data?.[0] as DeletionRequest | undefined
        setDeletionRequest(latestRequest ?? null)
        if (sharesResult.error) {
          setVehicleSharesError('Could not load vehicle sharing details. Run the latest vehicle-sharing SQL.')
        } else {
          setVehicleShares((sharesResult.data ?? []) as AccountVehicleShare[])
          setVehicleSharesError(null)
        }
        setVehicleSharesLoading(false)
      } catch {
        if (current) {
          setError('Could not load your profile. Check your connection and try again.')
          setVehicleSharesError('Could not load vehicle sharing details. Check your connection and try again.')
          setVehicleSharesLoading(false)
        }
      }
    }

    void loadProfile()
    return () => { current = false }
  }, [userId])

  useEffect(() => {
    if (!supabaseClient || !avatarPath) return
    let current = true
    void Promise.resolve(supabaseClient.storage
      .from('user-profile-images')
      .createSignedUrl(avatarPath, 60 * 60 * 24))
      .then(({ data, error: signedUrlError }) => {
        if (!current) return
        if (signedUrlError) {
          setError('Could not load your profile photo from Supabase Storage.')
          return
        }
        setAvatar({ path: avatarPath, url: data.signedUrl })
      })
      .catch(() => {
        if (current) setError('Could not load your profile photo from Supabase Storage.')
      })
    return () => { current = false }
  }, [avatarPath])

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const cleanedUsername = username.trim()
      const saveError = await onUpdateUsername(cleanedUsername)
      if (saveError) {
        setError(saveError)
        if (saveError.toLowerCase().includes('already in use')) {
          setAvailability({ candidate: cleanedUsername, status: 'taken' })
        }
      }
      else {
        setUsername(cleanedUsername)
        setSavedUsername(cleanedUsername)
        setMessage('Username updated.')
        setAvailability(null)
      }
    } catch {
      setError('Could not update your username. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabaseClient) {
      setError('Supabase is not configured.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const { error: passwordError } = await supabaseClient.auth.updateUser({ password: newPassword })
      if (passwordError) setError('Could not update your password. Check the new password and try again.')
      else {
        setNewPassword('')
        setConfirmPassword('')
        setMessage('Password updated.')
      }
    } catch {
      setError('Could not connect to the account service. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadAvatar(file: File) {
    if (!supabaseClient) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photos must be 5 MB or smaller.')
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)
    const client = supabaseClient
    try {
      const path = `${userId}/${crypto.randomUUID()}`
      const { error: uploadError } = await client.storage
        .from('user-profile-images')
        .upload(path, file, { contentType: file.type })
      if (uploadError) {
        setError('Could not upload your profile photo. Check the Supabase storage setup.')
        return
      }

      const { error: saveError } = await client.rpc('update_my_avatar_path', { new_avatar_path: path })
      if (saveError) {
        await client.storage.from('user-profile-images').remove([path])
        setError('Could not save your profile photo.')
        return
      }
      let cleanupMessage: string | null = null
      if (avatarPath) {
        const { error: cleanupError } = await client.storage
          .from('user-profile-images')
          .remove([avatarPath])
        if (cleanupError) cleanupMessage = 'The new photo is active, but the previous photo could not be removed.'
      }
      setAvatarPath(path)
      onAvatarChanged()
      setMessage(cleanupMessage ?? 'Profile photo updated.')
    } catch {
      setError('Could not connect to Supabase Storage. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAvatar() {
    if (!supabaseClient || !avatarPath) return

    setBusy(true)
    setError(null)
    setMessage(null)
    const client = supabaseClient
    try {
      const { error: updateError } = await client.rpc('update_my_avatar_path', {
        new_avatar_path: null,
      })
      if (updateError) {
        setError('Could not remove your profile photo. Try again.')
        return
      }

      const previousAvatarPath = avatarPath
      setAvatarPath(null)
      setAvatar(null)
      onAvatarChanged()

      try {
        const { error: removeError } = await client.storage
          .from('user-profile-images')
          .remove([previousAvatarPath])
        if (removeError) {
          setError('Your profile photo was removed, but its stored image could not be deleted.')
        } else {
          setMessage('Profile photo removed.')
        }
      } catch {
        setError('Your profile photo was removed, but its stored image could not be deleted.')
      }
    } catch {
      setError('Could not connect to the account service. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabaseClient) return
    if (deletionEmail.trim().toLowerCase() !== accountEmail.trim().toLowerCase()) {
      setError('Enter the email address associated with your account to confirm deletion.')
      return
    }

    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const { error: requestError } = await supabaseClient.rpc('request_account_deletion', {
        confirmation_email: deletionEmail.trim(),
      })
      if (requestError) {
        setError(requestError.message.includes('confirmation email')
          ? 'Enter the email address associated with your account to confirm deletion.'
          : 'Could not schedule account deletion. Try again.')
      } else {
        setDeletionRequest({ status: 'pending', requested_at: new Date().toISOString() })
        setMessage('Your account will be permanently deleted within 1 month if you do not log in again.')
        const signOutError = await onDeletionConfirmed()
        if (signOutError) setError(signOutError)
        else setShowDeletionConfirmation(false)
      }
    } catch {
      setError('Could not connect to the account service. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="profile-panel" aria-labelledby="profile-title">
      <header className="profile-panel-heading">
        <div className="profile-avatar-control">
          <button
            className="profile-avatar"
            type="button"
            aria-label={avatarPath ? 'Change profile photo' : 'Add profile photo'}
            title={avatarPath ? 'Click to change your profile photo' : 'Click to add a profile photo'}
            disabled={busy}
            onClick={() => avatarInputRef.current?.click()}
          >
            {avatar?.path === avatarPath
              ? <img src={avatar.url} alt="" />
              : <span>{getUsernameInitials(savedUsername)}</span>}
            <span className="profile-avatar-edit" aria-hidden="true">Edit</span>
          </button>
          <input
            ref={avatarInputRef}
            className="profile-photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void uploadAvatar(file)
              event.target.value = ''
            }}
          />
          {avatarPath && (
            <button
              className="profile-remove-photo"
              type="button"
              disabled={busy}
              onClick={() => { void removeAvatar() }}
            >
              Remove photo
            </button>
          )}
        </div>
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h2 id="profile-title">{savedUsername}</h2>
        </div>
      </header>

      <div className="profile-panel-content">
        <form className="profile-card stacked-form" onSubmit={(event) => void saveUsername(event)}>
          <h3>Username</h3>
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
            />
            <small>3–32 letters, numbers, or underscores</small>
            {username.trim() !== savedUsername && username.trim().length >= 3 && /^[A-Za-z0-9_]{3,32}$/.test(username.trim()) && (
              <small className={`username-availability ${usernameAvailability}`} role="status" aria-live="polite">
                {usernameAvailability === 'checking' && 'Checking username…'}
                {usernameAvailability === 'available' && 'Username is available.'}
                {usernameAvailability === 'taken' && 'That username is already taken.'}
                {usernameAvailability === 'error' && 'Could not check username availability.'}
              </small>
            )}
          </label>
          <div className="username-actions">
            <button
              className="primary-action"
              type="submit"
              disabled={busy || username.trim() === savedUsername || usernameAvailability !== 'available'}
            >
              Save username
            </button>
            <button
              className="text-action"
              type="button"
              disabled={busy || username === savedUsername}
              onClick={() => {
                setUsername(savedUsername)
                setError(null)
                setMessage(null)
                setAvailability(null)
              }}
            >
              Reset
            </button>
          </div>
        </form>

        <form className="profile-card stacked-form" onSubmit={(event) => void changePassword(event)}>
          <h3>Password</h3>
          <label className="form-field">
            <span>New password</span>
            <PasswordInput
              autoComplete="new-password"
              minLength={8}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <label className="form-field">
            <span>Confirm new password</span>
            <PasswordInput
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Enter it again"
            />
          </label>
          <button className="primary-action" type="submit" disabled={busy}>
            Update password
          </button>
        </form>

        <section className="profile-card profile-delete-card" aria-labelledby="profile-delete-title">
          <div>
            <h3 id="profile-delete-title">Delete account</h3>
            <p>
              {deletionRequest?.status === 'pending'
                ? 'Your account is scheduled for deletion in one month. Log in again before then to cancel the request.'
                : deletionRequest?.status === 'rejected'
                  ? 'Your latest deletion request was declined. You may schedule deletion again.'
                  : deletionRequest?.status === 'cancelled'
                    ? 'Your previous deletion request was cancelled because you logged in again.'
                    : 'Confirm your account email to schedule deletion. Logging in again within one month cancels it.'}
            </p>
          </div>
          {deletionRequest?.status !== 'pending' && !showDeletionConfirmation && (
            <button
              className="profile-danger-action"
              type="button"
              disabled={busy}
              onClick={() => {
                setDeletionEmail('')
                setError(null)
                setShowDeletionConfirmation(true)
              }}
            >
              Delete account
            </button>
          )}
          {deletionRequest?.status !== 'pending' && showDeletionConfirmation && (
            <form className="profile-delete-confirm" onSubmit={(event) => void requestDeletion(event)}>
              <label className="form-field">
                <span>Confirm your account email</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={deletionEmail}
                  onChange={(event) => setDeletionEmail(event.target.value)}
                  placeholder={accountEmail || 'Email address'}
                  disabled={busy}
                />
              </label>
              <button className="profile-danger-action" type="submit" disabled={busy}>
                Confirm account deletion
              </button>
              <button
                className="text-action"
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowDeletionConfirmation(false)
                  setDeletionEmail('')
                }}
              >
                Cancel
              </button>
            </form>
          )}
        </section>

        <section className="profile-card profile-signout-card" aria-labelledby="profile-signout-title">
          <div>
            <h3 id="profile-signout-title">Sign out</h3>
            <p>Sign out of your Vehkix account on this device.</p>
          </div>
          <button className="text-action" type="button" disabled={busy} onClick={() => { void onSignOut() }}>
            Sign out
          </button>
        </section>

        <section className="profile-card profile-sharing-card" aria-labelledby="profile-sharing-title">
          <h3 id="profile-sharing-title">Vehicle sharing</h3>
          {vehicleSharesError ? (
            <p className="profile-sharing-message error-state" role="alert">{vehicleSharesError}</p>
          ) : vehicleSharesLoading ? (
            <p className="profile-sharing-message" role="status">Loading vehicle sharing…</p>
          ) : (
            <>
              <div className="profile-sharing-group">
                <h4>Shared by you</h4>
                {vehicleShares.filter((share) => share.direction === 'shared_by_you').length > 0 ? (
                  <ul className="profile-sharing-list">
                    {vehicleShares.filter((share) => share.direction === 'shared_by_you').map((share) => (
                      <li key={share.share_id}>
                        <strong>{share.vehicle_label}</strong>
                        <span>With {share.username} · {share.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="profile-sharing-message">You haven’t shared any vehicles yet.</p>}
              </div>
              <div className="profile-sharing-group">
                <h4>Shared with you</h4>
                {vehicleShares.filter((share) => share.direction === 'shared_with_you').length > 0 ? (
                  <ul className="profile-sharing-list">
                    {vehicleShares.filter((share) => share.direction === 'shared_with_you').map((share) => (
                      <li key={share.share_id}>
                        <strong>{share.vehicle_label}</strong>
                        <span>From {share.username} · {share.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="profile-sharing-message">No vehicles have been shared with you.</p>}
              </div>
            </>
          )}
        </section>

      </div>

      {(error || message) && (
        <p className={`form-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}
    </section>
  )
}

export default ProfilePanel
