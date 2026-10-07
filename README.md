# Vehkix

Vehkix manages each signed-in user's private vehicle collection with React, Vite, and Supabase. The interface only reads `user_vehicles`; it has no public vehicle section and no local data fallback.

Promoted administrators can switch to an admin panel for aggregate counts and management of all user-owned vehicle records and photos. The role is checked server-side by Supabase RLS.

Open the admin view by appending `#admin` to the site URL. It uses the same Supabase sign-in as the collection: only accounts granted admin access in `admin_users` can enter, and database access remains enforced by Supabase. This is not a separate client-side password or a security boundary based on the URL.

An administrator visiting the site without `#admin` uses the regular collection view, which only lists vehicles they own or that have been shared with them. Add `#admin` to open the admin panel directly after signing in.

The sign-in panel, admin view, vehicle list, vehicle editor, and sharing tools are loaded on demand as separate JavaScript chunks.

## Supabase setup

1. Run or re-run [`supabase/user-accounts.sql`](supabase/user-accounts.sql) in the Supabase SQL Editor to add unique usernames and availability checks, Auth signup handling, profile photos, account-deletion requests, notifications, the private `user_vehicles` table, admin-controlled vehicle field visibility, per-user print preferences, and private Storage buckets with access policies.
2. Supabase Auth enforces unique email addresses; the profiles index makes usernames unique regardless of case. Row-level security restricts vehicle records and images to their owner and explicitly authorized recipients. New vehicle shares remain pending until the recipient accepts them; rejecting a share removes access. Owners can grant view, re-share, edit, and delete permissions independently; recipients cannot grant permissions they do not hold. Vehicle owners and admins can transfer ownership to another account; transferring a vehicle revokes its existing shares.
3. To grant the first admin, create your normal account, then run this in the Supabase SQL Editor with your account email substituted. Admin access is stored in `admin_users` and enforced by RLS; it cannot be self-assigned through the client.

```sql
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('admin@example.com')
on conflict (user_id) do nothing;
```

4. Users can edit their username and password, upload a profile photo, or request account deletion from the Profile tab. Admins can review deletion requests, manage a selected user's vehicles, and delete accounts after confirmation. An administrator cannot delete their own active account or the last remaining administrator.
5. Re-running the SQL migration is safe for existing vehicle rows; it adds/updates profile, notification, sharing, and deletion-request tables, database functions, Storage policies, and row-level security policies. Existing shares stay accepted; new shares require recipient approval.
6. `supabase/setup.sql` is legacy demo data only; it drops and recreates `public.vehicles`, which this interface no longer reads. It is not needed for the private collection app.
7. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project URL and publishable/anon key. Never expose a `service_role` key in browser code or GitHub Pages settings.
8. In **Authentication > URL Configuration**, set the **Site URL** to `https://fayisdotdev.github.io/vehkix/` and add these **Redirect URLs**:
   - `https://fayisdotdev.github.io/vehkix/?password-reset=1`
   - `http://localhost:5173/?password-reset=1` for local development
   The login screen's **Forgot password?** link sends Supabase's password recovery email. Keep the recovery link in the Supabase email template (normally `{{ .ConfirmationURL }}`); the user returns to Vehkix to enter and confirm a new password. Ensure email sending is enabled in **Authentication > Providers > Email**. For production use, configure a custom SMTP provider in **Authentication > SMTP Settings** so delivery is reliable.

## GitHub Pages

The built site is published from the `gh-pages` branch at `https://fayisdotdev.github.io/vehkix/`. GitHub Actions is not used.

1. In the repository's **Settings > Pages**, set **Source** to **Deploy from a branch**, choose `gh-pages`, and choose `/(root)`.
2. Commit and push source changes to `main`, then run `npm run deploy`. It builds `docs/` and publishes it to `gh-pages`; the first run creates that branch.
3. Keep `.env` local and ignored. The Supabase URL and anon/publishable key are embedded in the built browser app, so only use the anon key protected by row-level security. Never use a `service_role` key.

## Local development

```sh
npm install
npm run dev
```

Build and lint with `npm run build` and `npm run lint`.
