# Vehkix

Vehkix manages each signed-in user's private vehicle collection with React, Vite, and Supabase. There is no public vehicle directory or local data fallback; a guest can view vehicle details only through a read-only link explicitly created by a user with sharing permission.

Promoted administrators can switch to an admin panel for aggregate counts and management of all user-owned vehicle records and photos. The role is checked server-side by Supabase RLS.

Open the admin view by appending `#admin` to the site URL. It uses the same Supabase sign-in as the collection: only accounts granted admin access in `admin_users` can enter, and database access remains enforced by Supabase. This is not a separate client-side password or a security boundary based on the URL.

An administrator visiting the site without `#admin` uses the regular collection view, which only lists vehicles they own or that have been shared with them. Add `#admin` to open the admin panel directly after signing in.

The sign-in panel, admin view, vehicle list, vehicle editor, and sharing tools are loaded on demand as separate JavaScript chunks.

Emergency contacts are available to everyone from the site footer or directly at `#emergency-contacts`. The directory separates Keralamm-priority contacts from India-wide helplines and provides tap-to-call numbers.

## Supabase setup

1. Run these files in the Supabase SQL Editor, in filename order. Re-run them in the same order when applying setup updates:
   - [`supabase/01-accounts.sql`](supabase/01-accounts.sql)
   - [`supabase/02-notifications.sql`](supabase/02-notifications.sql)
   - [`supabase/03-vehicles.sql`](supabase/03-vehicles.sql)
   - [`supabase/04-account-workflows.sql`](supabase/04-account-workflows.sql)
   - [`supabase/05-vehicle-field-settings.sql`](supabase/05-vehicle-field-settings.sql)
   - [`supabase/06-vehicle-share-preferences.sql`](supabase/06-vehicle-share-preferences.sql)
   - [`supabase/07-vehicle-sharing.sql`](supabase/07-vehicle-sharing.sql)
   - [`supabase/08-storage-policies.sql`](supabase/08-storage-policies.sql)
   - [`supabase/11-public-vehicle-sharing.sql`](supabase/11-public-vehicle-sharing.sql)
   - [`supabase/12-public-share-preferences-and-short-links.sql`](supabase/12-public-share-preferences-and-short-links.sql)
     The About page's exact user and vehicle totals use the RPC in `03-vehicles.sql`; re-run that file to install it on an existing Supabase project.
2. Supabase Auth enforces unique email addresses; the profiles index makes usernames unique regardless of case. Row-level security restricts vehicle records and images to their owner and explicitly authorized recipients. New vehicle shares remain pending until the recipient accepts them; rejecting a share removes access. Owners can grant view, re-share, edit, and delete permissions independently; recipients cannot grant permissions they do not hold. Recipients can leave an accepted share at any time, which revokes their access and notifies the sender; this requires the latest `supabase/07-vehicle-sharing.sql`. Vehicle owners and admins can transfer ownership to another account; transferring a vehicle revokes its existing shares. Users with sharing permission can also create revocable, read-only links for guests and choose exactly which shareable details and photos the links show; those field choices are saved per user. Guests cannot change the vehicle.
3. To grant the first admin, create your normal account, then run this in the Supabase SQL Editor with your account email substituted. Admin access is stored in `admin_users` and enforced by RLS; it cannot be self-assigned through the client.

```sql
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('admin@example.com')
on conflict (user_id) do nothing;
```

4. Users can edit their username and password, upload a profile photo, or schedule account deletion from the Profile tab by confirming their account email. The account is deactivated and signed out immediately; logging in again within one month reactivates the account and cancels its scheduled deletion. Supabase `pg_cron` checks every minute and permanently removes inactive requested accounts after one month. Admins can view the read-only deletion-request list and still manage accounts and vehicles from the admin directory.
   Profile photo uploads support JPEG, PNG, WebP, and HEIC/HEIF images. Re-run `supabase/08-storage-policies.sql` on an existing project to allow HEIC/HEIF uploads.
5. Re-running the SQL migration is safe for existing vehicle rows; it adds/updates profile, in-app notification, sharing, and deletion-request tables, database functions, the scheduled account-deletion purge, Storage policies, and row-level security policies. Existing shares stay accepted; new shares require recipient approval.
6. Files `supabase/09-legacy-vehicles-schema.sql` and `supabase/10-legacy-vehicles-public-read.sql` are optional and only configure the legacy public `vehicles` table; this interface does not read that table. They do not insert sample data. `supabase/optional-reset-legacy-vehicles.sql` is a separate destructive reset that permanently deletes all rows from that table. Run it only when you intentionally want to erase those rows, before running file 09.
7. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project URL and publishable/anon key. Never expose a `service_role` key in browser code.
8. To remove an existing vehicle-reminder setup, first review and manually run [`optional-remove-push-reminders.sql`](.supabase/supabase/optional-remove-push-reminders.sql) in the Supabase SQL Editor. It permanently deletes reminder preferences, push subscriptions, and reminder delivery history; it does not remove in-app notifications for vehicle sharing or account workflows. Then delete the deployed `send-vehicle-reminders` Edge Function and its `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` secrets in Supabase, remove `VITE_VAPID_PUBLIC_KEY` from Vercel, and redeploy. Existing browser push subscriptions may also be removed from each browser's site settings.
9. In **Authentication > URL Configuration**, set the **Site URL** to `https://vehkix.github.io / https://vehkix.vercel.app` and add these **Redirect URLs**:
   - `https://vehkix.github.io / https://vehkix.vercel.app?password-reset=1`
   - `https://vehkix.github.io / https://vehkix.vercel.app?email-confirmation=1`
   - `http://localhost:5173/?password-reset=1` for local development
   - `http://localhost:5173/?email-confirmation=1` for local development
     In **Authentication > Providers > Email**, enable **Confirm email**. Signup then sends a confirmation email and shows a dedicated Vehkix inbox page; the email link returns the user to that page, where the confirmed state is shown. Any email provider is accepted if its owner can open the verification email; this does not restrict signup to Gmail. Keep the confirmation/recovery links in the Supabase email templates (normally `{{ .ConfirmationURL }}`). The login screen's **Forgot password?** link also returns users to Vehkix to enter and confirm a new password. For reliable delivery, configure a custom SMTP provider in **Authentication > SMTP Settings**.

## GitHub Pages

The built site is published from the `gh-pages` branch at `https://vehkix.github.io / https://vehkix.vercel.app`. GitHub Actions is not used.

1. In the repository's **Settings > Pages**, set **Source** to **Deploy from a branch**, choose `gh-pages`, and choose `/(root)`.
2. Commit and push source changes to `main`, then run `npm run deploy`. It builds `docs/` and publishes it to `gh-pages`; the first run creates that branch.
3. Keep `.env` local and ignored. The Supabase URL and anon/publishable key are embedded in the built browser app, so only use the anon key protected by row-level security. Never use a `service_role` key.

## Local development

```sh
npm install
npm run dev
```

Build and lint with `npm run build` and `npm run lint`.
