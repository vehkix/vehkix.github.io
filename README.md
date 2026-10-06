# Vehkix

Vehkix manages each signed-in user's private vehicle collection with React, Vite, and Supabase. The interface only reads `user_vehicles`; it has no public vehicle section and no local data fallback.

Promoted administrators can switch to an admin panel for aggregate counts and management of all user-owned vehicle records and photos. The role is checked server-side by Supabase RLS.

## Supabase setup

1. Run or re-run [`supabase/user-accounts.sql`](supabase/user-accounts.sql) to add unique usernames, Auth signup handling, backfill valid Auth users and their email addresses into `profiles`, the private `user_vehicles` table with optional per-vehicle notes, RC and primary-image columns, admin-controlled vehicle field visibility, per-user print preferences, recipient-based vehicle sharing, and the private `user-vehicle-images` Storage bucket with access policies.
2. Supabase Auth enforces unique email addresses; the profiles index makes usernames unique regardless of case. Row-level security restricts vehicle records and images to their owner and explicitly authorized recipients. Vehicle owners can grant view, re-share, edit, and delete permissions independently; recipients cannot grant permissions they do not hold. Re-run the SQL after enabling sharing so image links use the shared-vehicle Storage policies.
3. To grant the first admin, create your normal account, then run this in the Supabase SQL Editor with your account email substituted. Admin access is stored in `admin_users` and enforced by RLS; it cannot be self-assigned through the client.

```sql
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('admin@example.com')
on conflict (user_id) do nothing;
```

4. Re-running the SQL migration is safe for existing vehicle rows; it adds/updates the account-sharing table, database functions, and row-level security policies.
5. `supabase/setup.sql` is legacy demo data only; it drops and recreates `public.vehicles`, which this interface no longer reads. It is not needed for the private collection app.
6. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project URL and publishable/anon key. Never expose a `service_role` key in browser code or GitHub Pages settings.

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
