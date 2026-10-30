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

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0))
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

  const permission = await window.Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const registration = await navigator.serviceWorker.register('/sw.js')
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  })
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
