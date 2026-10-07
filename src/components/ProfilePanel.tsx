import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabaseClient } from '../lib/supabase'
import { getUsernameInitials } from '../lib/profile'
import '../styles/forms.css'
import './ProfilePanel.css'
import PasswordInput from './PasswordInput'

interface ProfilePanelProps {
  userId: string
  initialUsername: string
  onUpdateUsername: (username: string) => Promise<string | null>
  onAvatarChanged: () => void
}

interface DeletionRequest {
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
}

function ProfilePanel({ userId, initialUsername, onUpdateUsername, onAvatarChanged }: ProfilePanelProps) {
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
        const [profileResult, deletionResult] = await Promise.all([
          client.from('profiles').select('username, avatar_path').eq('id', userId).single(),
          client.rpc('get_my_deletion_request'),
        ])
        if (!current) return
        if (profileResult.error || deletionResult.error) {
          setError('Could not load your profile. Run the latest user-account SQL in Supabase.')
          return
        }
        if (profileResult.data) {
          setUsername(profileResult.data.username)
          setSavedUsername(profileResult.data.username)
          setAvatarPath(profileResult.data.avatar_path)
        }
        const latestRequest = deletionResult.data?.[0] as DeletionRequest | undefined
        setDeletionRequest(latestRequest ?? null)
      } catch {
        if (current) setError('Could not load your profile. Check your connection and try again.')
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

  async function requestDeletion() {
    if (!supabaseClient || !window.confirm('Send an account deletion request to the administrators? Your account will remain active until they approve it.')) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const { error: requestError } = await supabaseClient.rpc('request_account_deletion')
      if (requestError) setError('Could not send your deletion request. Try again.')
      else {
        const { data, error: loadError } = await supabaseClient.rpc('get_my_deletion_request')
        if (loadError) setError('Request sent, but its status could not be loaded.')
        else {
          setDeletionRequest(data?.[0] as DeletionRequest | undefined ?? null)
          setMessage('Your request was sent to the administrators.')
        }
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
                ? 'Your deletion request is waiting for administrator review.'
                : deletionRequest?.status === 'rejected'
                  ? 'Your latest deletion request was declined. You may send another request.'
                  : 'Send a request to the administrators. Your account stays active until approved.'}
            </p>
          </div>
          <button
            className="profile-danger-action"
            type="button"
            disabled={busy || deletionRequest?.status === 'pending'}
            onClick={() => { void requestDeletion() }}
          >
            Request account deletion
          </button>
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
