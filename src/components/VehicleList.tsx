import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { displayValue, formatDate, formatMileage, getDueMessage, getUpcomingDocuments, getVehicleName, getVehicleStatus } from '../lib/vehicle'
import type { ExistingVehicleImage, Vehicle } from '../types/vehicle'
import { vehicleFieldDefinitions, type VehicleFieldKey, type VehicleFieldSettings } from '../lib/vehicleSettings'
import type { AdminAccount } from '../types/admin'
import { createShareSections } from './vehicleShare'
import ImageWithShimmer, { ImageShimmerPlaceholder } from './ImageWithShimmer'
import './VehicleList.css'

const VehicleShareDialog = lazy(() => import('./VehicleShareDialog'))
const VehicleTransferDialog = lazy(() => import('./VehicleTransferDialog'))

interface VehicleDetailsDialogProps {
  vehicleName: string
  headerActions: ReactNode
  bottomActions: ReactNode
  children: ReactNode
  onClose: () => void
}

function VehicleDetailsDialog({
  vehicleName,
  headerActions,
  bottomActions,
  children,
  onClose,
}: VehicleDetailsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="vehicle-details-dialog"
      aria-labelledby="vehicle-details-title"
      onCancel={(event) => {
        event.preventDefault()
        onCloseRef.current()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onCloseRef.current()
      }}
    >
      <header className="vehicle-details-heading">
        <div className="vehicle-details-heading-main">
          <h2 id="vehicle-details-title">{vehicleName}</h2>
          <p>Vehicle details</p>
        </div>
        <button className="vehicle-details-close" type="button" onClick={onClose} aria-label="Close vehicle details">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
        <div className="vehicle-details-header-actions">{headerActions}</div>
      </header>
      <div className="vehicle-details-body">
        {children}
        {bottomActions && <footer className="vehicle-details-bottom-actions">{bottomActions}</footer>}
      </div>
    </dialog>
  )
}

interface VehicleDeleteConfirmProps {
  vehicleName: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

function VehicleDeleteConfirm({ vehicleName, busy, onCancel, onConfirm }: VehicleDeleteConfirmProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="vehicle-delete-dialog"
      aria-labelledby="vehicle-delete-title"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id="vehicle-delete-title">Delete vehicle?</h2>
      <p>Delete {vehicleName} and its uploaded images? This cannot be undone.</p>
      <div className="vehicle-delete-actions">
        <button className="text-action" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="vehicle-delete-confirm" type="button" disabled={busy} onClick={onConfirm}>
          {busy ? 'Deleting…' : 'Delete vehicle'}
        </button>
      </div>
    </dialog>
  )
}

interface VehicleLeaveConfirmProps {
  vehicleName: string
  ownerUsername: string
  onCancel: () => void
  onConfirm: () => Promise<string | null>
}

function VehicleLeaveConfirm({
  vehicleName,
  ownerUsername,
  onCancel,
  onConfirm,
}: VehicleLeaveConfirmProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  async function leaveSharedVehicle() {
    setBusy(true)
    setError(null)
    try {
      const leaveError = await onConfirm()
      if (leaveError) setError(leaveError)
      else setCompleted(true)
    } catch {
      setError('Could not leave this shared vehicle. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="vehicle-delete-dialog"
      aria-labelledby="vehicle-leave-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <h2 id="vehicle-leave-title">{completed ? 'Access removed' : 'Leave shared vehicle?'}</h2>
      {completed ? (
        <p role="status">You left {vehicleName}. {ownerUsername} has been notified.</p>
      ) : (
        <p>
          Leave {vehicleName} shared by {ownerUsername}? You will lose access, and the sender will be notified.
        </p>
      )}
      {error && <p className="error-state" role="alert">{error}</p>}
      <div className="vehicle-delete-actions">
        {completed ? (
          <button className="vehicle-delete-confirm" type="button" onClick={onCancel}>Done</button>
        ) : (
          <>
            <button className="text-action" type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button
              className="vehicle-leave-confirm"
              type="button"
              disabled={busy}
              onClick={() => { void leaveSharedVehicle() }}
            >
              {busy ? 'Leaving…' : 'Leave vehicle'}
            </button>
          </>
        )}
      </div>
    </dialog>
  )
}

interface VehicleListProps {
  vehicles: Vehicle[]
  query: string
  expandedVehicleId: string | null
  deleteBusy: boolean
  showOwner?: boolean
  canTransferAll?: boolean
  ownerAccounts?: AdminAccount[]
  userId: string
  fieldSettings: VehicleFieldSettings
  onToggleExpanded: (vehicleId: string) => void
  onEdit: (vehicle: Vehicle) => void
  onEditImage: (vehicle: Vehicle) => void
  onDelete: (vehicle: Vehicle) => void
  onLeaveShared?: (vehicle: Vehicle) => Promise<string | null>
  onTransferComplete: () => void
}

interface VehicleOwnerGroup {
  key: string
  username: string
  email: string | null
  vehicles: Vehicle[]
}

function groupVehiclesByOwner(vehicles: Vehicle[], accounts: AdminAccount[]): VehicleOwnerGroup[] {
  const groups = new Map<string, VehicleOwnerGroup>(accounts.map((account) => [account.id, {
    key: account.id,
    username: account.username,
    email: account.email,
    vehicles: [],
  }]))

  for (const vehicle of vehicles) {
    const key = vehicle.user_id ?? vehicle.owner_username ?? 'unknown-user'
    const group = groups.get(key) ?? {
      key,
      username: vehicle.owner_username || 'Unknown user',
      email: vehicle.owner_email ?? null,
      vehicles: [],
    }
    group.vehicles.push(vehicle)
    groups.set(key, group)
  }

  return [...groups.values()]
}

function VehicleList({
  vehicles,
  query,
  expandedVehicleId,
  deleteBusy,
  showOwner = false,
  canTransferAll = false,
  ownerAccounts = [],
  userId,
  fieldSettings,
  onToggleExpanded,
  onEdit,
  onEditImage,
  onDelete,
  onLeaveShared,
  onTransferComplete,
}: VehicleListProps) {
  const [imageIndices, setImageIndices] = useState<Record<string, number>>({})
  const [vehicleDialog, setVehicleDialog] = useState<{ vehicleId: string; mode: 'share' | 'print' } | null>(null)
  const [transferVehicleId, setTransferVehicleId] = useState<string | null>(null)
  const [deleteVehicleTarget, setDeleteVehicleTarget] = useState<{ vehicle: Vehicle; name: string } | null>(null)
  const [leaveVehicleTarget, setLeaveVehicleTarget] = useState<{ vehicle: Vehicle; name: string } | null>(null)
  const [openMenu, setOpenMenu] = useState<{ vehicleId: string; location: 'tile' | 'details' } | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuPopoverRef = useRef<HTMLDivElement>(null)
  const visibleCardFields = new Set(
    Object.values(fieldSettings)
      .filter((setting) => setting.show_in_tile || setting.show_in_highlight)
      .map((setting) => setting.field_key),
  )
  const ownerGroups: VehicleOwnerGroup[] = showOwner
    ? groupVehiclesByOwner(vehicles, ownerAccounts)
    : [{ key: 'collection', username: '', email: null, vehicles }]

  useLayoutEffect(() => {
    if (!openMenu) return

    const updatePlacement = () => {
      const trigger = menuTriggerRef.current
      const popover = menuPopoverRef.current
      if (!trigger || !popover) return

      const triggerRect = trigger.getBoundingClientRect()
      const viewportPadding = 12
      const gap = 4
      const topbar = document.querySelector<HTMLElement>('.topbar')
      const topbarRect = topbar?.getBoundingClientRect()
      const safeTop = topbarRect && topbarRect.bottom > 0 && topbarRect.top < window.innerHeight
        ? Math.max(viewportPadding, topbarRect.bottom + 8)
        : viewportPadding
      const ownerList = trigger.closest('.vehicle-owner-list')
      const ownerListTop = ownerList ? ownerList.getBoundingClientRect().top : safeTop
      const spaceAbove = Math.max(0, triggerRect.top - Math.max(safeTop, ownerListTop) - gap)
      const spaceBelow = Math.max(0, window.innerHeight - triggerRect.bottom - viewportPadding - gap)
      const naturalHeight = popover.scrollHeight
      const placeAbove = spaceBelow < naturalHeight && spaceAbove > spaceBelow
      const availableSpace = placeAbove ? spaceAbove : spaceBelow
      const maxHeight = Math.max(40, Math.min(360, availableSpace))
      const menuHeight = Math.min(naturalHeight, maxHeight)
      const top = placeAbove ? triggerRect.top - gap - menuHeight : triggerRect.bottom + gap
      const menuWidth = popover.getBoundingClientRect().width
      const left = Math.max(
        viewportPadding,
        Math.min(triggerRect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding),
      )
      setMenuPosition({ top, left, maxHeight })
    }

    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [openMenu])

  useEffect(() => {
    if (!openMenu) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node
        && !listRef.current?.contains(event.target)
        && !menuPopoverRef.current?.contains(event.target)
      ) {
        setOpenMenu(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  if (vehicles.length === 0 && (!showOwner || ownerGroups.length === 0)) {
    return (
      <p className="empty-state">
        {query.trim()
          ? <>No vehicles match “{query}”.</>
          : showOwner
            ? 'No vehicles have been added to any user account.'
            : 'Your private collection is empty.'}
      </p>
    )
  }

  return (
    <div ref={listRef} className="vehicle-list" aria-label={showOwner ? 'All user vehicles' : 'My vehicles'}>
      {ownerGroups.map((group) => (
        <section
          className={showOwner ? 'vehicle-owner-group' : undefined}
          key={group.key}
          aria-labelledby={showOwner ? `vehicle-owner-${group.key}` : undefined}
        >
          {showOwner && (
            <header className="vehicle-owner-heading">
              <div>
                <h2 id={`vehicle-owner-${group.key}`}>{group.username}</h2>
                <p>{group.email || 'Email unavailable'}</p>
              </div>
              <span>{group.vehicles.length} {group.vehicles.length === 1 ? 'vehicle' : 'vehicles'}</span>
            </header>
          )}
          <div className="vehicle-owner-list" role="list" aria-label={showOwner ? `${group.username} vehicles` : 'My vehicles'}>
            {group.vehicles.length > 0
              ? group.vehicles.map((vehicle) => renderVehicle(vehicle))
              : <p className="vehicle-owner-empty">No vehicles listed for this account.</p>}
          </div>
        </section>
      ))}
      {deleteVehicleTarget && (
        <VehicleDeleteConfirm
          vehicleName={deleteVehicleTarget.name}
          busy={deleteBusy}
          onCancel={() => setDeleteVehicleTarget(null)}
          onConfirm={() => {
            const vehicle = deleteVehicleTarget.vehicle
            setDeleteVehicleTarget(null)
            onDelete(vehicle)
          }}
        />
      )}
      {leaveVehicleTarget && onLeaveShared && (
        <VehicleLeaveConfirm
          vehicleName={leaveVehicleTarget.name}
          ownerUsername={leaveVehicleTarget.vehicle.owner_username || 'the sender'}
          onCancel={() => setLeaveVehicleTarget(null)}
          onConfirm={() => onLeaveShared(leaveVehicleTarget.vehicle)}
        />
      )}
    </div>
  )

  function renderVehicle(vehicle: Vehicle) {
        const vehicleName = getVehicleName(vehicle.company, vehicle.model)
        const detailsVehicleName = getVehicleName(
          fieldSettings.company.show_in_details ? vehicle.company : null,
          fieldSettings.model.show_in_details ? vehicle.model : null,
        )
        const status = getVehicleStatus(vehicle, visibleCardFields)
        const dueMessage = getDueMessage(vehicle, visibleCardFields)
        const visibleDocuments = getUpcomingDocuments(vehicle)
          .filter((document) => fieldSettings[document.id].show_in_details)
        const images = vehicle.images ?? []
        const carouselImages = vehicle.signed_images?.filter(
          (image): image is ExistingVehicleImage & { url: string } => Boolean(image.url),
        ) ?? images.map((url, index) => ({
          path: vehicle.image_paths?.[index] ?? String(index),
          url,
        }))
        const carouselKey = `${vehicle.id}:${vehicle.primary_image ?? ''}`
        const primaryImageIndex = Math.max(
          0,
          carouselImages.findIndex((image) => image.path === vehicle.primary_image),
        )
        const activeImageIndex = Math.min(
          imageIndices[carouselKey] ?? primaryImageIndex,
          Math.max(0, carouselImages.length - 1),
        )
        const isExpanded = expandedVehicleId === vehicle.id
        const detailsId = `details-${vehicle.id}`
        const cardValues: Partial<Record<VehicleFieldKey, ReactNode>> = {
          vehicle_title: vehicleName,
          vehicle_number: displayValue(vehicle.vehicle_number),
          company: displayValue(vehicle.company),
          model: displayValue(vehicle.model),
          year: displayValue(vehicle.year),
          taken_date: formatDate(vehicle.taken_date),
          last_service_date: formatDate(vehicle.service?.last_service_date),
          last_service_km: formatMileage(vehicle.service?.last_service_km),
          next_service_date: formatDate(vehicle.service?.next_service_date),
          next_service_km: formatMileage(vehicle.service?.next_service_km),
          next_pucc_date: formatDate(vehicle.pucc?.next_pucc_date),
          insurance_next_renewal_date: formatDate(vehicle.insurance?.next_renewal_date),
          tax_valid_upto: formatDate(vehicle.tax_valid_upto),
          registration_validity: formatDate(vehicle.registration_validity),
          last_pucc_date: formatDate(vehicle.pucc?.last_pucc_date),
          insurance_taken_date: formatDate(vehicle.insurance?.taken_date),
          rc_owner_name: displayValue(vehicle.rc_owner_name),
          chassis_no: displayValue(vehicle.chassis_no),
          engine_no: displayValue(vehicle.engine_no),
          notes: displayValue(vehicle.notes),
          owner_username: displayValue(vehicle.owner_username),
          print_timestamp: '',
          id: vehicle.id,
          uploaded_by: displayValue(vehicle.uploaded_by),
          uploaded_date: formatDate(vehicle.uploaded_date),
        }
        const tileFields = vehicleFieldDefinitions.filter((field) => (
          field.key !== 'vehicle_title'
          && field.key !== 'images'
          && field.key !== 'print_timestamp'
          && fieldSettings[field.key].show_in_tile
        ))
        const highlightedFields = vehicleFieldDefinitions.filter((field) => (
          fieldSettings[field.key].show_in_highlight
        ))
        const detailField = (key: VehicleFieldKey, label: string, value: ReactNode) => (
          fieldSettings[key].show_in_details && <div key={key}><dt>{label}</dt><dd>{value}</dd></div>
        )
        const renderVehicleMenu = () => {
          const menuOpen = openMenu?.vehicleId === vehicle.id && openMenu.location === 'tile'
          const menuId = `vehicle-menu-${vehicle.id}-tile`
          const dismissMenu = () => setOpenMenu(null)

          return (
            <div className="vehicle-menu">
              <button
                ref={menuOpen ? menuTriggerRef : null}
                className="vehicle-menu-trigger"
                type="button"
                aria-label={`More actions for ${vehicleName}`}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-controls={menuId}
                onClick={() => {
                  setMenuPosition(null)
                  setOpenMenu(menuOpen ? null : { vehicleId: vehicle.id, location: 'tile' })
                }}
              >
                <span aria-hidden="true">⋮</span>
              </button>
              {menuOpen && createPortal(
                <div
                  ref={menuPopoverRef}
                  className="vehicle-menu-popover"
                  id={menuId}
                  role="menu"
                  aria-label={`${vehicleName} actions`}
                  style={{
                    top: menuPosition?.top ?? 0,
                    left: menuPosition?.left ?? 0,
                    maxHeight: menuPosition ? `${menuPosition.maxHeight}px` : undefined,
                  }}
                >
                  {vehicle.can_edit && (
                    <button type="button" role="menuitem" onClick={() => {
                      dismissMenu()
                      onEdit(vehicle)
                    }}>
                      Edit
                    </button>
                  )}
                  {vehicle.can_share && (
                    <button type="button" role="menuitem" onClick={() => {
                      dismissMenu()
                      setVehicleDialog({ vehicleId: vehicle.id, mode: 'share' })
                    }}>
                      Share
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={() => {
                    dismissMenu()
                    setVehicleDialog({ vehicleId: vehicle.id, mode: 'print' })
                  }}>
                    PDF
                  </button>
                  {(vehicle.user_id === userId || canTransferAll) && (
                    <button type="button" role="menuitem" onClick={() => {
                      dismissMenu()
                      setTransferVehicleId(vehicle.id)
                    }}>
                      Transfer
                    </button>
                  )}
                  {vehicle.can_delete && (
                    <button
                      className="delete-action"
                      type="button"
                      role="menuitem"
                      disabled={deleteBusy}
                      onClick={() => {
                        dismissMenu()
                        setDeleteVehicleTarget({ vehicle, name: vehicleName })
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {onLeaveShared && !showOwner && vehicle.user_id !== userId && (
                    <button
                      className="leave-shared-action"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        dismissMenu()
                        setLeaveVehicleTarget({ vehicle, name: vehicleName })
                      }}
                    >
                      Leave shared vehicle
                    </button>
                  )}
                </div>,
                document.body,
              )}
            </div>
          )
        }

        return (
          <article
            className={`vehicle-row${openMenu?.vehicleId === vehicle.id ? ' menu-open' : ''}`}
            key={vehicle.id}
            role="listitem"
          >
            <header className="vehicle-card-header">
              <div className="vehicle-cover">
                {fieldSettings.images.show_in_tile && carouselImages.length > 0 ? (
                  <>
                    <ImageWithShimmer
                      key={carouselImages[activeImageIndex].url}
                      className="vehicle-cover-image"
                      src={carouselImages[activeImageIndex].url}
                      alt={`${vehicleName} vehicle`}
                      objectPosition={`${vehicle.tile_image_position_x ?? 50}% ${vehicle.tile_image_position_y ?? 50}%`}
                    />
                    {carouselImages.length > 1 && (
                      <>
                        <button
                          className="carousel-control previous"
                          type="button"
                          aria-label={`Previous ${vehicleName} image`}
                          onClick={() => setImageIndices((current) => ({
                            ...current,
                            [carouselKey]: (activeImageIndex - 1 + carouselImages.length) % carouselImages.length,
                          }))}
                        >
                          <span aria-hidden="true" />
                        </button>
                        <button
                          className="carousel-control next"
                          type="button"
                          aria-label={`Next ${vehicleName} image`}
                          onClick={() => setImageIndices((current) => ({
                            ...current,
                            [carouselKey]: (activeImageIndex + 1) % carouselImages.length,
                          }))}
                        >
                          <span aria-hidden="true" />
                        </button>
                        <span className="carousel-count" aria-live="polite">
                          {activeImageIndex + 1} / {carouselImages.length}
                        </span>
                      </>
                    )}
                  </>
                ) : fieldSettings.images.show_in_tile && vehicle.images_loading ? (
                  <ImageShimmerPlaceholder className="vehicle-cover-image" label="Loading vehicle photo" />
                ) : (
                  <span className="vehicle-cover-empty">
                    {fieldSettings.images.show_in_tile
                      ? vehicle.image_paths?.length ? 'Photos unavailable' : 'Add a vehicle photo'
                      : 'Photo hidden'}
                  </span>
                )}
              </div>
              <div className="vehicle-card-heading">
                {fieldSettings.vehicle_title.show_in_tile && <h2>{vehicleName}</h2>}
                {fieldSettings.vehicle_number.show_in_tile && (
                  <span className="vehicle-id">{displayValue(vehicle.vehicle_number)}</span>
                )}
              </div>
            </header>
            <div className="vehicle-card-content">
              <div className="vehicle-main">
                {!fieldSettings.vehicle_title.show_in_tile && (
                  <h2>{vehicleName}</h2>
                )}
                {!showOwner && vehicle.user_id !== userId && (
                  <span className="vehicle-owner">Shared by {vehicle.owner_username || 'another user'}</span>
                )}
                {showOwner && fieldSettings.owner_username.show_in_tile && (
                  <span className="vehicle-owner">Owner · {vehicle.owner_username || vehicle.user_id}</span>
                )}
              </div>
              {tileFields.length > 0 && (
                <dl className="vehicle-tile-fields">
                  {tileFields.map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{cardValues[field.key] ?? 'Not set'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {highlightedFields.length > 0 && (
                <dl className="vehicle-highlight-strip" aria-label="Highlighted vehicle information">
                  {highlightedFields.map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{cardValues[field.key] ?? 'Not set'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="vehicle-card-footer">
                <div className="status-cell">
                  <span className={`status ${status.className}`}>
                    <span className="status-dot" />{status.label}
                  </span>
                  {dueMessage && <span className={`due-countdown ${status.className}`}>{dueMessage}</span>}
                </div>
                <div className="vehicle-card-actions">
                  <button
                    className="details-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={isExpanded ? detailsId : undefined}
                    onClick={() => onToggleExpanded(vehicle.id)}
                  >
                    <span className="expand-icon" aria-hidden="true" />
                    {isExpanded ? 'Hide details' : 'View details'}
                  </button>
                  {renderVehicleMenu()}
                </div>
              </div>
            </div>
            {isExpanded && (
              <VehicleDetailsDialog
                vehicleName={vehicleName}
                onClose={() => onToggleExpanded(vehicle.id)}
                headerActions={(
                  <>
                    {vehicle.can_edit && (
                      <button
                        className="vehicle-details-action"
                        type="button"
                        onClick={() => {
                          onToggleExpanded(vehicle.id)
                          onEdit(vehicle)
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {vehicle.can_share && (
                      <button
                        className="vehicle-details-action"
                        type="button"
                        onClick={() => {
                          onToggleExpanded(vehicle.id)
                          setVehicleDialog({ vehicleId: vehicle.id, mode: 'share' })
                        }}
                      >
                        Share
                      </button>
                    )}
                    <button
                      className="vehicle-details-action"
                      type="button"
                      onClick={() => {
                        onToggleExpanded(vehicle.id)
                        setVehicleDialog({ vehicleId: vehicle.id, mode: 'print' })
                      }}
                    >
                      PDF
                    </button>
                  </>
                )}
                bottomActions={(
                  <>
                    {(vehicle.user_id === userId || canTransferAll) && (
                      <button
                        className="vehicle-details-action"
                        type="button"
                        onClick={() => {
                          onToggleExpanded(vehicle.id)
                          setTransferVehicleId(vehicle.id)
                        }}
                      >
                        Transfer vehicle
                      </button>
                    )}
                    {onLeaveShared && !showOwner && vehicle.user_id !== userId && (
                      <button
                        className="vehicle-details-action leave-shared-action"
                        type="button"
                        onClick={() => {
                          onToggleExpanded(vehicle.id)
                          setLeaveVehicleTarget({ vehicle, name: vehicleName })
                        }}
                      >
                        Leave shared vehicle
                      </button>
                    )}
                    {vehicle.can_delete && (
                      <button
                        className="vehicle-details-action delete-action"
                        type="button"
                        disabled={deleteBusy}
                        onClick={() => {
                          onToggleExpanded(vehicle.id)
                          setDeleteVehicleTarget({ vehicle, name: vehicleName })
                        }}
                      >
                        Delete vehicle
                      </button>
                    )}
                  </>
                )}
              >
              <section className="expanded-details" id={detailsId} aria-label={`${vehicleName} details`}>
              <div className="detail-group vehicle-info-group">
                <h3>Vehicle</h3>
                <dl>
                  {detailField('vehicle_title', 'Vehicle title', detailsVehicleName)}
                  {detailField('vehicle_number', 'Vehicle number', displayValue(vehicle.vehicle_number))}
                  {detailField('company', 'Make', displayValue(vehicle.company))}
                  {detailField('model', 'Model', displayValue(vehicle.model))}
                  {detailField('year', 'Year', displayValue(vehicle.year))}
                  {detailField('taken_date', 'Added to garage', formatDate(vehicle.taken_date))}
                    {showOwner && fieldSettings.owner_username.show_in_details && (
                      <div><dt>Owner</dt><dd>{vehicle.owner_username || vehicle.user_id}</dd></div>
                    )}
                  {detailField('id', 'Record ID', vehicle.id)}
                </dl>
              </div>
              {(fieldSettings.next_service_date.show_in_details || fieldSettings.next_service_km.show_in_details || fieldSettings.last_service_date.show_in_details || fieldSettings.last_service_km.show_in_details) && <div className="detail-group service-info-group">
                <h3>Service</h3>
                <dl>
                  {detailField('next_service_date', 'Next service', formatDate(vehicle.service?.next_service_date))}
                  {detailField('next_service_km', 'Next service mileage', formatMileage(vehicle.service?.next_service_km))}
                  {detailField('last_service_date', 'Last service', formatDate(vehicle.service?.last_service_date))}
                  {detailField('last_service_km', 'Last mileage', formatMileage(vehicle.service?.last_service_km))}
                </dl>
              </div>}
              {(visibleDocuments.length > 0 || fieldSettings.rc_owner_name.show_in_details || fieldSettings.chassis_no.show_in_details || fieldSettings.engine_no.show_in_details || fieldSettings.last_pucc_date.show_in_details || fieldSettings.insurance_taken_date.show_in_details) && <div className="detail-group paperwork-info-group">
                <h3>Registration &amp; documents</h3>
                <dl>
                  {getUpcomingDocuments(vehicle).map((document) => (
                    detailField(document.id, document.label, formatDate(document.date))
                  ))}
                  {detailField('rc_owner_name', 'RC owner name', displayValue(vehicle.rc_owner_name))}
                  {detailField('chassis_no', 'Chassis number', displayValue(vehicle.chassis_no))}
                  {detailField('engine_no', 'Engine number', displayValue(vehicle.engine_no))}
                  {detailField('last_pucc_date', 'Last check', formatDate(vehicle.pucc?.last_pucc_date))}
                  {detailField('insurance_taken_date', 'Policy date', formatDate(vehicle.insurance?.taken_date))}
                </dl>
              </div>}
              {fieldSettings.notes.show_in_details && <div className="detail-group notes-info-group">
                <h3>Notes</h3>
                <dl>
                  {detailField(
                    'notes',
                    'Extra notes',
                    <span className="vehicle-notes-value">{displayValue(vehicle.notes)}</span>,
                  )}
                </dl>
              </div>}
              {fieldSettings.images.show_in_details && <div className="detail-group photo-info-group">
                <header className="detail-photo-heading">
                  <h3>Photos <span>({vehicle.image_paths?.length ?? images.length})</span></h3>
                  {vehicle.can_edit && carouselImages.length > 0 && (
                    <button
                      className="detail-edit-image"
                      type="button"
                      onClick={() => {
                        onToggleExpanded(vehicle.id)
                        onEditImage(vehicle)
                      }}
                    >
                      Edit image
                    </button>
                  )}
                </header>
                {images.length > 0 ? (
                  <ul className="detail-image-grid">
                    {carouselImages.map((image, index) => (
                      <li key={image.path}>
                        <a href={image.url} target="_blank" rel="noreferrer">
                          <ImageWithShimmer
                            className="detail-image"
                            src={image.url}
                            alt={`${vehicleName}, photo ${index + 1}`}
                            loading="lazy"
                            objectPosition={image.path === vehicle.primary_image
                              ? `${vehicle.tile_image_position_x ?? 50}% ${vehicle.tile_image_position_y ?? 50}%`
                              : undefined}
                          />
                          <span>{image.path === vehicle.primary_image ? 'Primary' : `Photo ${index + 1}`}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : vehicle.image_paths?.length ? (
                  <p role="alert">
                    Photos could not be loaded. Re-run the latest user-account SQL in Supabase to apply shared-photo access policies.
                  </p>
                ) : <p>No photos have been added.</p>}
              </div>}
              {(fieldSettings.uploaded_by.show_in_details || fieldSettings.uploaded_date.show_in_details) && <div className="detail-group record-info-group">
                <h3>Record</h3>
                <dl>
                  {detailField('uploaded_by', 'Uploaded by', displayValue(vehicle.uploaded_by))}
                  {detailField('uploaded_date', 'Uploaded on', formatDate(vehicle.uploaded_date))}
                </dl>
              </div>}
              </section>
              </VehicleDetailsDialog>
            )}
              {vehicleDialog?.vehicleId === vehicle.id && (
                <Suspense fallback={<p className="empty-state" role="status">Loading sharing tools…</p>}>
                  <VehicleShareDialog
                    sections={createShareSections(vehicle, showOwner, carouselImages, fieldSettings)}
                    fileName={getVehicleName(vehicle.company, vehicle.model)}
                    userId={userId}
                    vehicleId={vehicle.id}
                    mode={vehicleDialog.mode}
                    canManageSharing={vehicle.can_share === true}
                    canGrantEdit={vehicle.can_edit === true}
                    canGrantDelete={vehicle.can_delete === true}
                    onClose={() => setVehicleDialog(null)}
                  />
                </Suspense>
              )}
              {transferVehicleId === vehicle.id && (
                <Suspense fallback={<p className="empty-state" role="status">Loading transfer form…</p>}>
                  <VehicleTransferDialog
                    vehicleId={vehicle.id}
                    vehicleName={vehicleName}
                    onClose={() => setTransferVehicleId(null)}
                    onTransferred={onTransferComplete}
                  />
                </Suspense>
              )}
          </article>
        )
  }
}

export default VehicleList
