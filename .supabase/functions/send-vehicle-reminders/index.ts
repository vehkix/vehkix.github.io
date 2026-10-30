import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const vapidSubject = Deno.env.get('VAPID_SUBJECT')!
webpush.setVapidDetails(
  vapidSubject,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const dateFields = {
  service: 'next_service_date',
  pucc: 'next_pucc_date',
  insurance: 'insurance_next_renewal_date',
  tax: 'tax_valid_upto',
  registration: 'registration_validity',
} as const

function localDate(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function localTime(timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function isQuietHour(time: string, start: string, end: string) {
  if (start === end) return false
  if (start < end) return time >= start && time < end
  return time >= start || time < end
}

function dateDifference(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function messageFor(type: string, vehicle: { name: string | null; vehicle_number: string | null }, days: number) {
  const label = vehicle.name || vehicle.vehicle_number || 'your vehicle'
  const reminder = type === 'pucc' ? 'PUCC' : type.charAt(0).toUpperCase() + type.slice(1)
  return days < 0
    ? `${reminder} for ${label} is overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}.`
    : `${reminder} for ${label} is due in ${days} day${days === 1 ? '' : 's'}.`
}

Deno.serve(async () => {
  const { data: preferences, error: preferencesError } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('enabled', true)
  if (preferencesError) return Response.json({ error: preferencesError.message }, { status: 500 })

  let sent = 0
  for (const preference of preferences ?? []) {
    const timezone = preference.timezone || 'UTC'
    const today = localDate(timezone)
    const now = localTime(timezone)
    if (now !== preference.notification_time?.slice(0, 5)
      || isQuietHour(now, preference.quiet_hours_start?.slice(0, 5), preference.quiet_hours_end?.slice(0, 5))) {
      continue
    }
    const { data: vehicles } = await supabase
      .from('user_vehicles')
      .select('id, name, vehicle_number, next_service_date, next_pucc_date, insurance_next_renewal_date, tax_valid_upto, registration_validity')
      .eq('user_id', preference.user_id)
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', preference.user_id)
    if (!subscriptions?.length) continue

    for (const vehicle of vehicles ?? []) {
      for (const type of preference.reminder_types ?? []) {
        const dueDate = vehicle[dateFields[type as keyof typeof dateFields]]
        if (!dueDate) continue
        const days = dateDifference(today, dueDate)
        const selectedDays = preference.days_before ?? []
        const shouldSend = selectedDays.includes(days)
          || (preference.repeat_mode !== 'once' && days <= Math.max(...selectedDays, 0) && days >= 0)
          || (preference.repeat_mode === 'daily_until_complete' && days < 0)
        if (!shouldSend) continue

        const { data: existing } = await supabase
          .from('vehicle_reminder_deliveries')
          .select('id')
          .eq('user_id', preference.user_id)
          .eq('vehicle_id', vehicle.id)
          .eq('reminder_type', type)
          .eq('due_date', dueDate)
          .eq('days_before', days)
          .eq('delivery_date', today)
          .maybeSingle()
        if (existing) continue

        const payload = JSON.stringify({
          title: 'Vehkix vehicle reminder',
          body: messageFor(type, vehicle, days),
          tag: `vehkix-${vehicle.id}-${type}-${today}`,
          url: '/',
        })
        for (const subscription of subscriptions) {
          try {
            await webpush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, payload)
            sent += 1
          } catch (error) {
            if (error instanceof webpush.WebPushError && [404, 410].includes(error.statusCode)) {
              await supabase.from('push_subscriptions').delete().eq('id', subscription.id)
            }
          }
        }
        await supabase.from('vehicle_reminder_deliveries').insert({
          user_id: preference.user_id,
          vehicle_id: vehicle.id,
          reminder_type: type,
          due_date: dueDate,
          days_before: days,
          delivery_date: today,
        })
      }
    }
  }

  return Response.json({ sent })
})
