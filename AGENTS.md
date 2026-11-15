# Dhera Singh Jewellers — AGENTS.md

Next.js 16.2.9 (App Router) + React 19 admin dashboard and webhook handler for Instagram comments/DMs and WhatsApp. Backend = Next.js serverless API routes; data = Supabase; intent/pricing = Anthropic Claude. Deployed on Vercel as `dhera-singh-v15`; webhook callback: `https://dhera-singh-v15.vercel.app/api/webhook`.

## Commands
- `npm run dev` — `next dev --webpack`. The `--webpack` flag is required; plain `next dev` behaves differently in this version.
- `npm run build` — `next build` (also runs typecheck via `tsc`).
- `npm run start` — `next start`
- `npm run lint` — `eslint` (flat config in `eslint.config.mjs`; extends `eslint-config-next`).
- **No `npm test` exists.** No test runner or test files are configured.

## Environment
- Create `.env.local` at the root (`.env*` is gitignored). Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `INSTAGRAM_PAGE_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `SESSION_SECRET` (signs staff login cookies; `auth-custom.ts` has a hardcoded dev fallback, so it **must** be set in production).
- `.env.local` already exists locally with real secrets. **Never commit, print, or log tokens/keys.** Show only the first 4 characters when diagnosing. Never put secrets in `NEXT_PUBLIC_*` variables.
- `ADMIN_SECRET_KEY` is only for the legacy cron path (`requireAdminKey()` / `requireCronOrAdmin()`, header `x-admin-key`); if unset those return 500. Dashboard/admin API routes use staff sessions instead (see Staff auth below).

## Structure & entrypoints
- `src/app/page.tsx` — dashboard (tabs: `AutomationTab`, `DashboardTab`, `TipsTab`, `UpdatePriceTab` in `src/components/`)
- `src/app/privacy/page.tsx`
- `src/app/api/webhook/route.ts` — Meta webhook: `GET` verify handshake, `POST` Instagram/WhatsApp events
- `src/app/api/{add-product, dashboard-stats, human-reply, update-prices, add-context, cleanup, test}/route.ts` — admin routes
- `src/lib/supabase.ts` — public + service-role (`supabaseAdmin`) Supabase clients
- `src/lib/anthropic.ts` — Claude intent detection and replies (`runJewelleryAgent`)
- `src/lib/price-calculator.ts` — jewellery price math
- `src/lib/auth.ts` — `requireStaff(request, roles?)` guards API routes (verifies the `staff_session` cookie); also legacy `requireAdminKey()` / `requireCronOrAdmin()` for cron
- `src/lib/auth-custom.ts` — `login()`, `verifySession()`, session cookie + `staff_sessions` storage, bcrypt helpers
- `src/lib/login-rate-limit.ts` — brute-force limiter on `login_attempts` (fails open if the table is missing)
- `src/proxy.ts` — redirects unauthenticated page requests to `/login`
- `src/app/api/{auth/login, auth/logout, me, staff}/route.ts` — sign in/out, current user, admin-only staff list/add
- `src/sql/` — one-off SQL to run in the Supabase SQL editor (`auth-schema.sql`, `login-attempts.sql`)
- Path alias `@/*` → `./src/*`

## Critical quirks (verified in code)
1. **Webhook signature check is bypassed.** `verifyMetaSignature` returns `true` even when invalid or `INSTAGRAM_APP_SECRET` is unset (logs "Bypassing for testing"). Do not rely on it.
2. **DM handler is commented out.** In `webhook/route.ts`, `handleInstagramDM` is disabled; DMs are received but not processed.
3. **Next.js 16 differs from older versions.** There is no `middleware.ts`; the bundled docs under `node_modules/next/dist/docs/` describe `proxy.ts` and the `after()` helper. Read them before adding middleware or background work.
4. **Staff auth (email + password).** `staff_profiles` has **no `id` or `email` column** — the key is `user_id` and the login email is `username` (stored lowercase). `user_id` has a FOREIGN KEY to Supabase `auth.users(id)`, so adding staff = create an Auth user, then a `staff_profiles` row with a bcrypt `password_hash`; admins do this from the dashboard **Staff** tab (`POST /api/staff`). Login uses `staff_profiles.password_hash` only — the Auth user's own password is unused. Roles: `admin` | `agent`. Don't reintroduce Supabase Auth cookie checks (`@supabase/ssr` is no longer used by any code). Never commit real passwords, including in SQL comments.
5. Graph API base is hard-coded `https://graph.facebook.com/v25.0`; tokens travel in URL query strings.
6. Tables: `products`, `metal_prices`, `company_info`, `conversations`, `processed_events`, `sender_rate_limits`, `message_buffer`, `recent_replies`, `admin_config`, `staff_profiles`, `staff_sessions`, `login_attempts`. RLS is on everywhere; `metal_prices` allows anonymous read. Writes use the service-role client. `admin_config` has only `key`, `value` (text) and `created_at` — **no `updated_at`**; upserting one fails silently because supabase-js returns the error instead of throwing (`api/health/route.ts` still does this).
7. Ice breakers: stored on Instagram, not in the Meta app dashboard. Default wording is in `src/lib/webhook/ice-breakers.ts`; edits made in the Automation tab are saved in `admin_config.ice_breakers_questions` and only reach Instagram on **Sync** (`POST /api/ice-breakers/sync`); `DELETE /api/ice-breakers` removes them from Instagram and keeps the saved wording. `payload` values are fixed (`bot-logic.ts` replies by payload), only the question text is editable.

## Verification
- `npm run dev`, open http://localhost:3000. Test the webhook handshake with `GET /api/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>`.

## Existing instruction sources
- `CLAUDE.md` contains only `@AGENTS.md` — this file is the source of truth.
- `dhera-singh-fix-guide.md` — separate phased remediation plan (security, webhook hardening, DM flow, leads, ice breakers). It is a task plan, not repo convention; its proposed code does not exist yet.
