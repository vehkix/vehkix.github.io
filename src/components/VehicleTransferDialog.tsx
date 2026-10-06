import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabaseClient } from '../lib/supabase'
import '../styles/forms.css'
import './VehicleTransferDialog.css'

interface VehicleTransferDialogProps {
  vehicleId: string
  vehicleName: string
  onClose: () => void
  onTransferred: () => void
}

interface Recipient {
  userId: string
  username: string
}

function VehicleTransferDialog({
  vehicleId,
  vehicleName,
  onClose,
  onTransferred,
}: VehicleTransferDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [identifier, setIdentifier] = useState('')
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  async function findRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabaseClient) {
      setError('Account transfers require a connected account service.')
      return
    }

    setBusy(true)
    setError(null)
    setRecipient(null)
    try {
      const { data, error: lookupError } = await supabaseClient.rpc('resolve_vehicle_transfer_recipient', {
        target_vehicle_id: vehicleId,
        recipient_identifier: identifier.trim(),
      })
      if (lookupError) {
        setError('Could not search for that account. Try again.')
      } else if (!data?.length) {
        setError('No account was found for that username or registered email.')
      } else {
        const match = data[0] as { user_id: string; username: string }
        setRecipient({ userId: match.user_id, username: match.username })
      }
    } catch {
      setError('Could not search for that account. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function transferOwnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabaseClient || !recipient) return
    if (!window.confirm(
      `Transfer ${vehicleName} to ${recipient.username}? Existing shares will be revoked, and the new owner will control this vehicle.`,
    )) return

    setBusy(true)
    setError(null)
    try {
      const { error: transferError } = await supabaseClient.rpc('transfer_vehicle_ownership', {
        target_vehicle_id: vehicleId,
        recipient_user_id: recipient.userId,
      })
      if (transferError) {
        setError('Could not transfer this vehicle. The owner or an admin can transfer it to another account.')
        return
      }
      onTransferred()
      onClose()
    } catch {
      setError('Could not connect to the account service. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="vehicle-transfer-dialog"
      aria-labelledby="vehicle-transfer-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <header>
        <p className="eyebrow">TRANSFER VEHICLE</p>
        <h2 id="vehicle-transfer-title">Move {vehicleName}</h2>
        <p>Find the Vehkix account that should own this vehicle.</p>
      </header>
      <form className="vehicle-transfer-form" onSubmit={(event) => {
        if (recipient) void transferOwnership(event)
        else void findRecipient(event)
      }}>
        <label className="form-field">
          <span>{recipient ? 'Selected account' : 'Username or registered email'}</span>
          <input
            type="text"
            autoComplete="off"
            required
            disabled={busy || Boolean(recipient)}
            value={recipient?.username ?? identifier}
            onChange={(event) => {
              setIdentifier(event.target.value)
              setRecipient(null)
            }}
            placeholder="Username or registered email"
          />
        </label>
        {recipient && (
          <p className="vehicle-transfer-warning">
            Existing shares will be revoked when ownership changes.
          </p>
        )}
        {error && <p className="form-feedback error" role="alert">{error}</p>}
        <div className="vehicle-transfer-actions">
          {recipient ? (
            <button
              className="primary-action"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Transferring…' : 'Transfer ownership'}
            </button>
          ) : (
            <button className="primary-action" type="submit" disabled={busy || !identifier.trim()}>
              {busy ? 'Searching…' : 'Find account'}
            </button>
          )}
          <button className="text-action" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default VehicleTransferDialog
