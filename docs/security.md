# Security boundaries

All app reads and writes cross narrowly granted Postgres RPCs. Tables in `public` and `private` have RLS enabled and no direct end-user grants. The private schema is not exposed through PostgREST. Public functions are security invokers; private implementations use fixed empty search paths, validated `auth.uid()`, explicit active-profile checks, explicit roles and per-action rate limits. No roles are trusted from user metadata.

Publication uses an advisory transaction lock per user, row locks on current selection/market/event, a database-clock cutoff, unique user/market and user/idempotency constraints, a decimal odds comparison and an immutable payload trigger. SHA-256 binds the original values. Admins cannot mutate that payload. Settlement locks the market, retries are no-ops, overrides append old/new values and a reason. Audit updates and deletes fail even for the table owner (except deliberate schema changes).

Public snapshots never include private account records, phone numbers, emails, roles of other users, sessions or idempotency keys. Each user's notifications and preferences are selected using auth.uid(). The data operator role cannot suspend accounts and moderator cannot settle results. Suspension/deletion blocks future mutations despite still-valid tokens.

Same-origin POST checks protect app endpoints. Supabase SSR uses provider-managed cookies; they are intentionally available to the browser SDK (not HttpOnly), as required for browser OAuth, linking and OTP. Local opaque demo-session cookies are HttpOnly, SameSite=Lax, Secure in production. Demo admin is impossible in production, and all local demo mode is disabled on Vercel. Never expose a demo data directory publicly.

Local demo uses a serial connection queue so request role/identity are transaction-local and cannot bleed between concurrent requests. Production uses separate Supabase clients per request and Postgres row/advisory locks. No service role is bundled into client code.

Production auth requires Supabase Google and SMS providers, allowed callback URLs and CAPTCHA enabled in Supabase. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for the included Turnstile widget. Provider rate limits apply directly to Auth APIs. No custom password handling.

Deleting an account pseudonymizes its public profile and removes private app records, following and notifications. Production then revokes sessions and deletes the Auth record with the server-only service key; a provider failure is reported, not hidden. Published analysis remains public as part of immutable history: do not put personal information in analyses. Operators need a documented privacy-removal process for exceptional PII in retained content before launch.

Remaining launch work: final legal/operator disclosures and retention periods; licensed sports data adapter and mapping/settlement rules; remote Auth/RLS end-to-end test with actual Google/SMS; backup/restore drill; external monitoring and production load testing. Manual CSV labels do not constitute a license. Default avatars eliminate image-upload attack surface; custom upload moderation is not implemented.
