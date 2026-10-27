import { useEffect, useState } from 'react'
import { useSharePreferences } from '../hooks/useSharePreferences'
import { supabaseClient } from '../lib/supabase'
import type { ShareSection } from './vehicleShare'

interface PublicShareLink {
  share_id: string
  field_ids: string[]
  created_at: string
}

interface VehiclePublicLinkManagerProps {
  vehicleId: string
  userId: string
  sections: ShareSection[]
}

function isPublicShareLink(value: unknown): value is PublicShareLink {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PublicShareLink>
  return typeof candidate.share_id === 'string'
    && Array.isArray(candidate.field_ids)
    && candidate.field_ids.every((fieldId) => typeof fieldId === 'string')
    && typeof candidate.created_at === 'string'
}

function publicShareUrl(shareId: string) {
  const baseUrl = import.meta.env.DEV
    ? new URL(window.location.pathname, window.location.origin)
    : new URL('https://vehkix.vercel.app/')
  const url = baseUrl
  url.searchParams.set('s', shareId)
  return url.toString()
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function VehiclePublicLinkManager({ vehicleId, userId, sections }: VehiclePublicLinkManagerProps) {
  const availableFields = sections.flatMap((section) => section.fields)
    .filter((field) => field.id !== 'print-timestamp')
  const {
    selectedFieldIds,
    updateSelection,
    loaded: preferencesLoaded,
    saveState: preferenceSaveState,
    error: preferencesError,
  } = useSharePreferences(userId, availableFields.map((field) => field.id), 'public')
  const [links, setLinks] = useState<PublicShareLink[]>([])
  const [loading, setLoading] = useState(Boolean(supabaseClient))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(supabaseClient ? null : 'Supabase is not configured.')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!supabaseClient) return

    let current = true
    const client = supabaseClient
    void (async () => {
      try {
        const { data, error: queryError } = await client.rpc(
          'list_vehicle_public_share_links',
          { target_vehicle_id: vehicleId },
        )
        if (!current) return
        if (queryError) {
          setError(`Could not load public share links: ${queryError.message}`)
          setLoading(false)
          return
        }
        if (!Array.isArray(data) || !data.every(isPublicShareLink)) {
          setError('Supabase returned an invalid list of public share links.')
          setLoading(false)
          return
        }
        setLinks(data)
        setLoading(false)
      } catch (queryError: unknown) {
        if (!current) return
        setError(`Could not load public share links: ${getErrorMessage(queryError)}`)
        setLoading(false)
      }
    })()

    return () => { current = false }
  }, [vehicleId])

  async function createLink() {
    if (!supabaseClient || selectedFieldIds.length === 0) return
    setBusy(true)
    setError(null)
    setStatus('')
    try {
      const { data, error: createError } = await supabaseClient.rpc('create_vehicle_public_share_link', {
        target_vehicle_id: vehicleId,
        selected_field_ids: selectedFieldIds,
      })
      if (createError) throw createError
      if (typeof data !== 'string') throw new Error('Supabase returned an invalid share link.')

      const createdLink: PublicShareLink = {
        share_id: data,
        field_ids: [...selectedFieldIds],
        created_at: new Date().toISOString(),
      }
      setLinks((current) => [createdLink, ...current])
      setStatus('Read-only link created. Anyone with it can view the selected details.')
    } catch (createError) {
      setError(`Could not create a public share link: ${getErrorMessage(createError)}`)
    } finally {
      setBusy(false)
    }
  }

  async function revokeLink(shareId: string) {
    if (!supabaseClient) return
    setBusy(true)
    setError(null)
    setStatus('')
    try {
      const { error: revokeError } = await supabaseClient.rpc('revoke_vehicle_public_share_link', {
        target_share_token: shareId,
      })
      if (revokeError) throw revokeError
      setLinks((current) => current.filter((link) => link.share_id !== shareId))
      setStatus('The public link has been revoked.')
    } catch (revokeError) {
      setError(`Could not revoke this public share link: ${getErrorMessage(revokeError)}`)
    } finally {
      setBusy(false)
    }
  }

  async function copyLink(shareId: string) {
    const url = publicShareUrl(shareId)
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link copied to clipboard.')
    } catch (copyError) {
      setError(`Could not copy the link. Copy it manually: ${url} (${getErrorMessage(copyError)})`)
    }
  }

  return (
    <section className="vehicle-public-links" aria-labelledby="vehicle-public-links-title">
      <h3 id="vehicle-public-links-title">Share a read-only link</h3>
      <p>Anyone with the link can view the details you select. They cannot edit, delete, or share the vehicle.</p>
      <div className="vehicle-public-link-preferences">
        <span>{selectedFieldIds.length} of {availableFields.length} selected</span>
        <button
          type="button"
          className="text-action"
          disabled={!preferencesLoaded || busy}
          onClick={() => updateSelection(() => availableFields.map((field) => field.id))}
        >
          Select all
        </button>
        <button
          type="button"
          className="text-action"
          disabled={!preferencesLoaded || busy}
          onClick={() => updateSelection(() => [])}
        >
          Clear all
        </button>
        <span role="status" aria-live="polite">
          {preferencesError
            ? 'Choices not saved'
            : !preferencesLoaded || preferenceSaveState === 'saving'
              ? 'Saving choices…'
              : 'Choices saved'}
        </span>
      </div>
      {preferencesError && <p className="vehicle-public-link-error" role="alert">{preferencesError}</p>}
      <div className="vehicle-public-link-fields">
        {sections.map((section) => {
          const fields = section.fields.filter((field) => field.id !== 'print-timestamp')
          if (fields.length === 0) return null
          return (
            <fieldset key={section.title}>
              <legend>{section.title}</legend>
              {fields.map((field) => (
                <label key={field.id}>
                  <input
                    type="checkbox"
                    checked={selectedFieldIds.includes(field.id)}
                    disabled={busy || !preferencesLoaded}
                    onChange={(event) => updateSelection((current) => (
                      event.target.checked
                        ? [...current, field.id]
                        : current.filter((fieldId) => fieldId !== field.id)
                    ))}
                  />
                  {field.label}
                </label>
              ))}
            </fieldset>
          )
        })}
      </div>
      <button
        type="button"
        className="primary-action"
        disabled={busy || loading || !preferencesLoaded || selectedFieldIds.length === 0}
        onClick={() => { void createLink() }}
      >
        {busy ? 'Working…' : 'Create read-only link'}
      </button>
      {loading && <p role="status">Loading existing links…</p>}
      {error && <p className="vehicle-public-link-error" role="alert">{error}</p>}
      {status && <p className="vehicle-public-link-status" role="status" aria-live="polite">{status}</p>}
      {links.length > 0 && (
        <ul className="vehicle-public-link-list" aria-label="Active public share links">
          {links.map((link) => (
            <li key={link.share_id}>
              <div className="vehicle-public-link-preview">
                <span>Official Vehkix read-only link</span>
                <a href={publicShareUrl(link.share_id)} target="_blank" rel="noreferrer">
                  {publicShareUrl(link.share_id).replace(/^https?:\/\//, '')}
                </a>
              </div>
              <button type="button" className="text-action" disabled={busy} onClick={() => { void copyLink(link.share_id) }}>
                Copy link
              </button>
              <button type="button" className="text-action" disabled={busy} onClick={() => { void revokeLink(link.share_id) }}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default VehiclePublicLinkManager
