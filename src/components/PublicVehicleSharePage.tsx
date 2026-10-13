import { useEffect, useState } from 'react'
import brandWordmark from '../../images/logo/vehkix-wordmark-color-transparent.png'
import { formatDate, formatMileage } from '../lib/vehicle'
import { supabaseClient } from '../lib/supabase'
import ImageWithShimmer from './ImageWithShimmer'
import './PublicVehicleSharePage.css'

interface PublicShareData {
  vehicle_name: string
  field_ids: string[]
  field_values: Record<string, string | number>
  image_paths: string[]
}

interface PublicShareView extends PublicShareData {
  image_urls: { path: string; url: string }[]
}

const fieldLabels: Record<string, string> = {
  'vehicle-title': 'Vehicle title',
  'vehicle-number': 'Vehicle number',
  make: 'Make',
  model: 'Model',
  year: 'Year',
  'taken-date': 'Added to garage',
  owner: 'Vehicle owner',
  'record-id': 'Record ID',
  'next-service-date': 'Next service',
  'next-service-mileage': 'Next service mileage',
  'last-service-date': 'Last service',
  'last-service-mileage': 'Last mileage',
  next_pucc_date: 'PUCC renewal',
  insurance_next_renewal_date: 'Insurance renewal',
  tax_valid_upto: 'Tax valid up to',
  registration_validity: 'Registration valid up to',
  'last-pucc': 'Last PUCC check',
  'policy-date': 'Policy date',
  'rc-owner': 'RC owner name',
  'chassis-number': 'Chassis number',
  'engine-number': 'Engine number',
  notes: 'Notes',
  'uploaded-by': 'Uploaded by',
  'uploaded-on': 'Uploaded on',
}

function isPublicShareData(value: unknown): value is PublicShareData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PublicShareData>
  return typeof candidate.vehicle_name === 'string'
    && Array.isArray(candidate.field_ids)
    && candidate.field_ids.every((fieldId) => typeof fieldId === 'string')
    && candidate.field_values !== null
    && typeof candidate.field_values === 'object'
    && !Array.isArray(candidate.field_values)
    && Object.values(candidate.field_values).every((fieldValue) => (
      typeof fieldValue === 'string' || typeof fieldValue === 'number'
    ))
    && Array.isArray(candidate.image_paths)
    && candidate.image_paths.every((path) => typeof path === 'string')
}

function formatFieldValue(fieldId: string, value: string | number) {
  if (
    fieldId.endsWith('-date')
    || fieldId.endsWith('_date')
    || fieldId.endsWith('_upto')
    || fieldId === 'registration_validity'
    || fieldId === 'last-pucc'
    || fieldId === 'policy-date'
    || fieldId === 'uploaded-on'
  ) {
    return formatDate(String(value))
  }
  if (fieldId.endsWith('-mileage')) return formatMileage(Number(value))
  return String(value)
}

function PublicVehicleSharePage({ token }: { token: string }) {
  const [share, setShare] = useState<PublicShareView | null>(null)
  const [loading, setLoading] = useState(Boolean(supabaseClient))
  const [error, setError] = useState<string | null>(
    supabaseClient ? null : 'Vehicle sharing is unavailable because Supabase is not configured.',
  )
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    if (!supabaseClient) return

    let current = true
    const client = supabaseClient
    async function loadShare() {
      const { data, error: queryError } = await client.rpc('get_vehicle_public_share_by_token', {
        share_token: token,
      })
      if (!current) return
      if (queryError) {
        setError('This link is invalid, has been revoked, or is temporarily unavailable.')
        setLoading(false)
        return
      }
      const result = Array.isArray(data) ? data[0] : null
      if (!isPublicShareData(result)) {
        setError('This link is invalid, has been revoked, or is no longer available.')
        setLoading(false)
        return
      }

      const imageResults = await Promise.all(result.image_paths.map(async (path) => {
        const { data: signedData, error: signedError } = await client.storage
          .from('user-vehicle-images')
          .createSignedUrl(path, 5 * 60)
        return signedError || !signedData?.signedUrl
          ? null
          : { path, url: signedData.signedUrl }
      }))
      if (!current) return
      setImageError(imageResults.some((image) => image === null))
      setShare({
        ...result,
        image_urls: imageResults.filter((image): image is { path: string; url: string } => image !== null),
      })
      setLoading(false)
    }

    void loadShare().catch(() => {
      if (!current) return
      setError('Could not load this shared vehicle. Please try again later.')
      setLoading(false)
    })

    return () => { current = false }
  }, [token])

  return (
    <main className="public-vehicle-share">
      <a className="public-share-brand" href={window.location.pathname} aria-label="Vehkix home">
        <img src={brandWordmark} alt="Vehkix" />
      </a>
      {loading && <p className="empty-state" role="status">Loading shared vehicle…</p>}
      {error && <p className="empty-state error-state" role="alert">{error}</p>}
      {share && (
        <article className="public-share-card">
          <header>
            <p className="eyebrow">READ-ONLY VEHICLE SHARE</p>
            <h1>{share.vehicle_name}</h1>
            <p>Shared details only. To manage this vehicle, sign in and ask its owner to grant your account access.</p>
          </header>
          {share.field_ids.some((fieldId) => fieldId.startsWith('photo-')) && share.image_urls.length > 0 && (
            <section className="public-share-photos" aria-label="Shared vehicle photos">
              {share.image_urls.map(({ path, url }, index) => (
                <a key={path} href={url} target="_blank" rel="noreferrer">
                  <ImageWithShimmer
                    key={url}
                    className="public-share-image"
                    src={url}
                    alt={`${share.vehicle_name}, photo ${index + 1}`}
                    loading="lazy"
                    onError={() => setImageError(true)}
                  />
                </a>
              ))}
            </section>
          )}
          {imageError && <p className="public-share-image-error" role="status">Some photos could not be loaded.</p>}
          <dl className="public-share-fields">
            {share.field_ids.map((fieldId) => {
              const value = share.field_values[fieldId]
              const label = fieldLabels[fieldId]
              if (value === undefined || !label) return null
              return (
                <div key={fieldId}>
                  <dt>{label}</dt>
                  <dd>{formatFieldValue(fieldId, value)}</dd>
                </div>
              )
            })}
          </dl>
          <p className="public-share-readonly-note">This page is view-only. Editing requires the owner to grant access to your signed-in Vehkix account.</p>
        </article>
      )}
    </main>
  )
}

export default PublicVehicleSharePage
