import { useCallback, useEffect, useRef, useState } from 'react'
import { supabaseClient } from '../lib/supabase'
import './NotificationBell.css'

interface AppNotification {
  id: number
  kind: string
  actor_username: string | null
  vehicle_id: string | null
  share_id: string | null
  vehicle_label: string | null
  deletion_request_id: string | null
  created_at: string
  read_at: string | null
}

interface NotificationBellProps {
  userId: string
  onOpenDeletionRequests: () => void
  onVehicleShareResponded: () => void
}

function getNotificationMessage(notification: AppNotification) {
  const actor = notification.actor_username || 'A user'
  const vehicle = notification.vehicle_label || 'vehicle'
  switch (notification.kind) {
    case 'vehicle_share_received': return `${actor} shared ${vehicle} with you.`
    case 'vehicle_share_sent': return `You shared ${vehicle} with ${actor}.`
    case 'vehicle_share_accepted': return `${actor} accepted your share of ${vehicle}.`
    case 'vehicle_share_rejected': return `${actor} rejected your share of ${vehicle}.`
    case 'account_deletion_requested': return `${actor} requested account deletion.`
    case 'account_deletion_rejected': return 'Your account deletion request was declined.'
    default: return 'You have a new notification.'
  }
}

function NotificationBell({ userId, onOpenDeletionRequests, onVehicleShareResponded }: NotificationBellProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [clearing, setClearing] = useState(false)

  const loadNotifications = useCallback(async (): Promise<AppNotification[]> => {
    if (!supabaseClient) return []
    try {
      const { data, error: loadError } = await supabaseClient.rpc('list_my_notifications')
      if (loadError) {
        setError('Could not load notifications. Run the latest user-account SQL in Supabase.')
        return []
      }
      setError(null)
      const loaded = (data ?? []) as AppNotification[]
      setNotifications(loaded)
      return loaded
    } catch {
      setError('Could not load notifications. Run the latest user-account SQL in Supabase.')
      return []
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadNotifications() }, 0)
    const intervalId = window.setInterval(() => { void loadNotifications() }, 30_000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(intervalId)
    }
  }, [loadNotifications, userId])

  useEffect(() => {
    if (!open) return

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function toggleNotifications() {
    const nextOpen = !open
    setOpen(nextOpen)
    if (!nextOpen) return
    const loadedNotifications = await loadNotifications()
    const unread = loadedNotifications.filter((notification) => !notification.read_at)
    const client = supabaseClient
    if (!client || unread.length === 0) return

    try {
      const results = await Promise.all(unread.map((notification) =>
        client.rpc('mark_my_notification_read', { target_notification_id: notification.id }),
      ))
      if (results.some((result) => result.error)) {
        setError('Some notifications could not be marked as read.')
      } else {
        setNotifications((current) => current.map((notification) =>
          unread.some((item) => item.id === notification.id)
            ? { ...notification, read_at: new Date().toISOString() }
            : notification,
        ))
      }
    } catch {
      setError('Some notifications could not be marked as read.')
    }
  }

  async function respond(notification: AppNotification, accept: boolean) {
    if (!supabaseClient || !notification.share_id) return
    setBusyId(notification.id)
    setError(null)
    try {
      const { error: responseError } = await supabaseClient.rpc('respond_to_vehicle_share', {
        target_share_id: notification.share_id,
        accept_share: accept,
      })
      if (responseError) {
        setError('Could not respond to this share. It may have already been handled.')
      } else {
        onVehicleShareResponded()
        await loadNotifications()
      }
    } catch {
      setError('Could not respond to this share. It may have already been handled.')
    } finally {
      setBusyId(null)
    }
  }

  function openDeletionRequests(notification: AppNotification) {
    if (supabaseClient) {
      void supabaseClient.rpc('mark_my_notification_read', {
        target_notification_id: notification.id,
      })
    }
    setOpen(false)
    onOpenDeletionRequests()
  }

  async function clearNotifications() {
    if (!supabaseClient || notifications.length === 0) return
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return

    setClearing(true)
    setError(null)
    try {
      const { error: clearError } = await supabaseClient.rpc('clear_my_notifications')
      if (clearError) {
        setError('Could not clear notifications. Run the latest user-account SQL in Supabase.')
        return
      }
      setNotifications([])
    } catch {
      setError('Could not clear notifications. Check your connection and try again.')
    } finally {
      setClearing(false)
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.read_at).length

  return (
    <div className="notification-menu" ref={menuRef}>
      <button
        className="notification-bell"
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => { void toggleNotifications() }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
        </svg>
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <section className="notification-popover" aria-label="Notifications">
          <header>
            <h2>Notifications</h2>
            <div className="notification-header-actions">
              {notifications.length > 0 && (
                <button
                  className="notification-clear"
                  type="button"
                  aria-label="Clear notifications"
                  title="Clear notifications"
                  disabled={clearing}
                  onClick={() => { void clearNotifications() }}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
                  </svg>
                </button>
              )}
              <button className="text-action" type="button" onClick={() => setOpen(false)}>Close</button>
            </div>
          </header>
          {error && <p className="notification-error" role="alert">{error}</p>}
          {notifications.length ? (
            <ul>
              {notifications.map((notification) => (
                <li key={notification.id} data-unread={!notification.read_at}>
                  <p>{getNotificationMessage(notification)}</p>
                  <time dateTime={notification.created_at}>
                    {new Date(notification.created_at).toLocaleString()}
                  </time>
                  {notification.kind === 'vehicle_share_received' && notification.share_id && (
                    <div className="notification-actions">
                      <button type="button" disabled={busyId === notification.id} onClick={() => { void respond(notification, true) }}>
                        Accept
                      </button>
                      <button type="button" disabled={busyId === notification.id} onClick={() => { void respond(notification, false) }}>
                        Decline
                      </button>
                    </div>
                  )}
                  {notification.kind === 'account_deletion_requested' && (
                    <button
                      className="text-action"
                      type="button"
                      onClick={() => openDeletionRequests(notification)}
                    >
                      Review request
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : !error ? <p className="notification-empty">You’re all caught up.</p> : null}
        </section>
      )}
    </div>
  )
}

export default NotificationBell
