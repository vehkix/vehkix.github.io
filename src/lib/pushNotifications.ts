import { supabaseClient } from './supabase'
import vehkixMark from '../../images/logo/vehkix-mark-color.png'

export const reminderTypes = ['service', 'pucc', 'insurance', 'tax', 'registration'] as const
export type ReminderType = typeof reminderTypes[number]
export type RepeatMode = 'once' | 'daily_until_due' | 'daily_until_complete'

export interface NotificationPreferences {
  enabled: boolean
  reminder_types: ReminderType[]
  days_before: number[]
  repeat_mode: RepeatMode
  notification_time: string
  timezone: string
  quiet_hours_start: string
  quiet_hours_end: string
}

export const defaultNotificationPreferences: NotificationPreferences = {
  enabled: false,
  reminder_types: [...reminderTypes],
  days_before: [30, 14, 7, 1],
  repeat_mode: 'daily_until_due',
  notification_time: '09:00',
  timezone: 'Asia/Kolkata',
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const key = value.trim()
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(key)) {
    throw new Error('VITE_VAPID_PUBLIC_KEY must be a base64url-encoded public key without quotes or internal whitespace.')
  }
  const unpaddedKey = key.replace(/=+$/, '')
  const padding = '='.repeat((4 - unpaddedKey.length % 4) % 4)
  let bytes: Uint8Array<ArrayBuffer>
  try {
    const base64 = (unpaddedKey + padding).replace(/-/g, '+').replace(/_/g, '/')
    const decoded = window.atob(base64)
    bytes = new Uint8Array(new ArrayBuffer(decoded.length))
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index)
    }
  } catch (error) {
    throw new Error(
      'VITE_VAPID_PUBLIC_KEY is not valid base64url. Copy the VAPID public key, not the private key.',
      { cause: error },
    )
  }
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error('VITE_VAPID_PUBLIC_KEY must decode to a 65-byte P-256 public key. Copy the VAPID public key, not the private key.')
  }
  return bytes
}

function matchesApplicationServerKey(currentKey: ArrayBuffer | null, expectedKey: Uint8Array) {
  if (!currentKey) return false
  const currentBytes = new Uint8Array(currentKey)
  return currentBytes.length === expectedKey.length
    && currentBytes.every((byte, index) => byte === expectedKey[index])
}

export function pushSupport() {
  return 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

export async function registerPushSubscription(userId: string) {
  if (!supabaseClient) throw new Error('Supabase is not configured.')
  if (!pushSupport()) throw new Error('This browser does not support push notifications.')
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) throw new Error('Push notifications are not configured yet. Add VITE_VAPID_PUBLIC_KEY.')
  const expectedKey = urlBase64ToUint8Array(vapidKey)

  const permission = await window.Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  const previousEndpoint = subscription?.endpoint
  if (subscription && !matchesApplicationServerKey(subscription.options.applicationServerKey, expectedKey)) {
    await subscription.unsubscribe()
    subscription = null
  }
  try {
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKey,
    })
  } catch (error) {
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    throw new Error(
      `The browser push service could not create a subscription (${details}). Check that the browser can reach its push service, and verify that Vercel's VITE_VAPID_PUBLIC_KEY matches Supabase's VAPID_PUBLIC_KEY.`,
      { cause: error },
    )
  }
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('The browser returned an incomplete push subscription.')
  }

  const { error } = await supabaseClient.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)

  if (previousEndpoint && previousEndpoint !== json.endpoint) {
    const { error: cleanupError } = await supabaseClient
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', previousEndpoint)
    if (cleanupError) {
      console.error('Could not remove the previous push subscription.', cleanupError)
    }
  }
}

export async function removeCurrentPushSubscription(userId: string) {
  if (!supabaseClient || !pushSupport()) return
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  const { error } = await supabaseClient
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
  if (error) throw new Error(error.message)
}

export async function showTestNotification() {
  if (!pushSupport() || window.Notification.permission !== 'granted') {
    throw new Error('Enable browser notifications first.')
  }
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!registration) throw new Error('Push service is not registered on this device.')
  await registration.showNotification('Vehkix test notification', {
    body: 'Your vehicle reminders are ready on this device.',
    icon: vehkixMark,
    badge: vehkixMark,
    tag: 'vehkix-test',
  })
}
