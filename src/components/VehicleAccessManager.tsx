import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabaseClient } from '../lib/supabase'

interface VehicleShare {
  share_id: string
  shared_user_id: string
  username: string
  can_share: boolean
  can_edit: boolean
  can_delete: boolean
  status: 'pending' | 'accepted' | 'rejected'
}

interface Recipient {
  userId: string
  username: string
}

interface VehicleAccessManagerProps {
  vehicleId: string
  canGrantEdit: boolean
  canGrantDelete: boolean
}

async function fetchVehicleShares(vehicleId: string): Promise<VehicleShare[]> {
  if (!supabaseClient) throw new Error('Account sharing requires a connected account service.')
  const { data, error } = await supabaseClient.rpc('list_my_vehicle_shares', {
    target_vehicle_id: vehicleId,
  })
  if (error) throw error
  return (data ?? []) as VehicleShare[]
}

function VehicleAccessManager({ vehicleId, canGrantEdit, canGrantDelete }: VehicleAccessManagerProps) {
  const [shares, setShares] = useState<VehicleShare[]>([])
  const [identifier, setIdentifier] = useState('')
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [permissions, setPermissions] = useState({ canShare: false, canEdit: false, canDelete: false })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const loadShares = useCallback(async () => {
    try {
      setShares(await fetchVehicleShares(vehicleId))
      setError(null)
      setLoading(false)
    } catch {
      setError(supabaseClient
        ? 'Could not load shared accounts. Run the latest user-account setup SQL.'
        : 'Account sharing requires a connected account service.')
      setLoading(false)
    }
  }, [vehicleId])

  useEffect(() => {
    let current = true
    void fetchVehicleShares(vehicleId).then(
      (loadedShares) => {
        if (!current) return
        setShares(loadedShares)
        setError(null)
        setLoading(false)
      },
      () => {
        if (!current) return
        setError(supabaseClient
          ? 'Could not load shared accounts. Run the latest user-account setup SQL.'
          : 'Account sharing requires a connected account service.')
        setLoading(false)
      },
    )
    return () => { current = false }
  }, [vehicleId])

  async function findRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabaseClient) {
      setError('Account sharing requires a connected account service.')
      return
    }

    setBusy(true)
    setError(null)
    setStatus(null)
    setRecipient(null)
    try {
      const { data, error: lookupError } = await supabaseClient.rpc('resolve_vehicle_share_recipient', {
        recipient_identifier: identifier.trim(),
      })
      if (lookupError) {
        setError('Could not search for that account. Try again.')
      } else if (!data?.length) {
        setError('No account was found for that username or registered email.')
      } else {
        const match = data[0] as { user_id: string; username: string }
        setRecipient({ userId: match.user_id, username: match.username })
        const existingShare = shares.find((share) => share.shared_user_id === match.user_id)
        setPermissions({
          canShare: existingShare?.can_share ?? false,
          canEdit: existingShare?.can_edit ?? false,
          canDelete: existingShare?.can_delete ?? false,
        })
      }
    } catch {
      setError('Could not search for that account. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function grantAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabaseClient || !recipient) return

    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const isUpdate = shares.some((share) => share.shared_user_id === recipient.userId)
      const { error: grantError } = await supabaseClient.rpc('grant_vehicle_share', {
        target_vehicle_id: vehicleId,
        recipient_user_id: recipient.userId,
        recipient_can_share: permissions.canShare,
        recipient_can_edit: permissions.canEdit,
        recipient_can_delete: permissions.canDelete,
      })
      if (grantError) {
        setError(grantError.message.includes('cannot grant permissions')
          ? 'You cannot grant permissions you do not have.'
          : 'Could not share this vehicle. Check the permissions and try again.')
        return
      }
      setStatus(`Vehicle access ${isUpdate ? 'updated for' : 'shared with'} ${recipient.username}.`)
      setRecipient(null)
      setIdentifier('')
      setPermissions({ canShare: false, canEdit: false, canDelete: false })
      await loadShares()
    } catch {
      setError('Could not share this vehicle. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function revokeAccess(share: VehicleShare) {
    if (!supabaseClient) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const { error: revokeError } = await supabaseClient.rpc('revoke_vehicle_share', {
        target_share_id: share.share_id,
      })
      if (revokeError) {
        setError('Could not revoke this account’s access. Please try again.')
        return
      }
      setStatus(`Access removed for ${share.username}.`)
      await loadShares()
    } catch {
      setError('Could not revoke this account’s access. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function updatePermission(key: keyof typeof permissions, checked: boolean) {
    setPermissions((current) => ({ ...current, [key]: checked }))
  }

  function editShare(share: VehicleShare) {
    setIdentifier(share.username)
    setRecipient({ userId: share.shared_user_id, username: share.username })
    setPermissions({
      canShare: share.can_share,
      canEdit: share.can_edit && canGrantEdit,
      canDelete: share.can_delete && canGrantDelete,
    })
    setError(null)
    setStatus(null)
  }

  function cancelRecipientEdit() {
    setRecipient(null)
    setIdentifier('')
    setPermissions({ canShare: false, canEdit: false, canDelete: false })
  }

  return (
    <section className="vehicle-access-manager" aria-labelledby="vehicle-access-title">
      <h3 id="vehicle-access-title">Share with a user</h3>
      <p>Find an existing Vehkix user by their username or registered email address.</p>
      <form className="vehicle-access-lookup" onSubmit={recipient ? grantAccess : findRecipient}>
        <label htmlFor={`share-recipient-${vehicleId}`}>
          {recipient ? 'Selected account' : 'Username or registered email'}
        </label>
        <input
          id={`share-recipient-${vehicleId}`}
          type="text"
          autoComplete="off"
          required
          disabled={busy}
          value={identifier}
          onChange={(event) => {
            setIdentifier(event.target.value)
            setRecipient(null)
          }}
          placeholder="Username or registered email"
        />
        {!recipient ? (
          <button className="text-action" type="submit" disabled={busy || !identifier.trim()}>
            {busy ? 'Searching…' : 'Find account'}
          </button>
        ) : (
          <div className="vehicle-access-grant">
            <strong>
              {shares.some((share) => share.shared_user_id === recipient.userId)
                ? 'Update access for'
                : 'Sharing with'} {recipient.username}
            </strong>
            <div className="vehicle-access-permissions">
              <label><input type="checkbox" checked={permissions.canShare} onChange={(event) => updatePermission('canShare', event.target.checked)} /> Can share</label>
              <label><input type="checkbox" checked={permissions.canEdit} disabled={!canGrantEdit} onChange={(event) => updatePermission('canEdit', event.target.checked)} /> Can edit</label>
              <label><input type="checkbox" checked={permissions.canDelete} disabled={!canGrantDelete} onChange={(event) => updatePermission('canDelete', event.target.checked)} /> Can delete</label>
            </div>
            <button className="primary-action" type="submit" disabled={busy}>
              {busy ? 'Saving…' : shares.some((share) => share.shared_user_id === recipient.userId) ? 'Update access' : 'Grant access'}
            </button>
            <button className="text-action" type="button" disabled={busy} onClick={cancelRecipientEdit}>
              Cancel
            </button>
          </div>
        )}
      </form>
      {error && <p className="vehicle-access-message error-state" role="alert">{error}</p>}
      {status && <p className="vehicle-access-message" role="status">{status}</p>}
      <h4>Accounts you shared with</h4>
      {loading ? (
        <p className="vehicle-access-message" role="status">Loading shared accounts…</p>
      ) : shares.length ? (
        <ul className="vehicle-access-list">
          {shares.map((share) => {
            const grants = [
              share.can_share && 'share',
              share.can_edit && 'edit',
              share.can_delete && 'delete',
            ].filter(Boolean)
            return (
              <li key={share.share_id}>
                <span>
                  <strong>{share.username}</strong>
                  <small>
                    {share.status === 'pending'
                      ? 'Waiting for them to accept'
                      : `${grants.length ? `View, ${grants.join(', ')}` : 'View only'} · Accepted`}
                  </small>
                </span>
                <div className="vehicle-access-row-actions">
                  <button className="text-action" type="button" disabled={busy} onClick={() => editShare(share)}>
                    Edit permissions
                  </button>
                  <button className="text-action" type="button" disabled={busy} onClick={() => { void revokeAccess(share) }}>
                    Revoke
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="vehicle-access-message">This vehicle is not shared with anyone yet.</p>
      )}
    </section>
  )
}

export default VehicleAccessManager
