-- Optional, destructive cleanup for vehicle-reminder push notification data.
-- Review before running. This permanently deletes saved preferences,
-- browser push subscriptions, and reminder delivery history.
-- In-app notifications for vehicle shares and account workflows are preserved.

begin;

drop table if exists public.vehicle_reminder_deliveries;
drop table if exists public.push_subscriptions;
drop table if exists public.notification_preferences;

commit;
