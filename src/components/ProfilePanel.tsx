import { useEffect, useState, type FormEvent } from 'react'
import { supabaseClient } from '../lib/supabase'
import { getUsernameInitials } from '../lib/profile'
import '../styles/forms.css'
import './ProfilePanel.css'

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
  const [username, setUsername] = useState(initialUsername)
  const [savedUsername, setSavedUsername] = useState(initialUsername)
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<{ path: string; url: string } | null>(null)
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
      const saveError = await onUpdateUsername(username.trim())
      if (saveError) setError(saveError)
      else {
        setSavedUsername(username.trim())
        setMessage('Username updated.')
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
        <div className="profile-avatar" aria-label={`${username} profile photo`}>
          {avatar?.path === avatarPath
            ? <img src={avatar.url} alt="" />
            : <span>{getUsernameInitials(username)}</span>}
        </div>
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h2 id="profile-title">{username}</h2>
        </div>
      </header>

      <div className="profile-panel-content">
        <section className="profile-card" aria-labelledby="profile-photo-title">
          <div>
            <h3 id="profile-photo-title">Profile photo</h3>
            <p>Upload a JPEG, PNG, or WebP image up to 5 MB.</p>
          </div>
          <label className="primary-action profile-upload">
            {busy ? 'Please wait…' : 'Choose photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadAvatar(file)
                event.target.value = ''
              }}
            />
          </label>
        </section>

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
          </label>
          <button className="primary-action" type="submit" disabled={busy || username === savedUsername}>
            Save username
          </button>
        </form>

        <form className="profile-card stacked-form" onSubmit={(event) => void changePassword(event)}>
          <h3>Password</h3>
          <label className="form-field">
            <span>New password</span>
            <input
              type="password"
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
            <input
              type="password"
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
