# Dhera Singh Jewellers — AGENTS.md

Next.js 16.2.9 (App Router) + React 19 admin dashboard and webhook handler for Instagram comments/DMs and WhatsApp. Backend = Next.js serverless API routes; data = Supabase; intent/pricing = Anthropic Claude. Deployed on Vercel as `dhera-singh-v15`; webhook callback: `https://dhera-singh-v15.vercel.app/api/webhook`.

## Commands
- `npm run dev` — `next dev --webpack`. The `--webpack` flag is required; plain `next dev` behaves differently in this version.
- `npm run build` — `next build` (also runs typecheck via `tsc`).
- `npm run start` — `next start`
- `npm run lint` — `eslint` (flat config in `eslint.config.mjs`; extends `eslint-config-next`).
- **No `npm test` exists.** No test runner or test files are configured.

## Environment
- Create `.env.local` at the root (`.env*` is gitignored). Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `INSTAGRAM_PAGE_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN`, `WHATSAPP_VERIFY_TOKEN`.
- `.env.local` already exists locally with real secrets. **Never commit, print, or log tokens/keys.** Show only the first 4 characters when diagnosing. Never put secrets in `NEXT_PUBLIC_*` variables.
- Missing `ADMIN_SECRET_KEY` makes admin routes return 500 (`src/lib/auth.ts`).

## Structure & entrypoints
- `src/app/page.tsx` — dashboard (tabs: `AutomationTab`, `DashboardTab`, `TipsTab`, `UpdatePriceTab` in `src/components/`)
- `src/app/privacy/page.tsx`
- `src/app/api/webhook/route.ts` — Meta webhook: `GET` verify handshake, `POST` Instagram/WhatsApp events
- `src/app/api/{add-product, dashboard-stats, human-reply, update-prices, add-context, cleanup, test}/route.ts` — admin routes
- `src/lib/supabase.ts` — public + service-role (`supabaseAdmin`) Supabase clients
- `src/lib/anthropic.ts` — Claude intent detection and replies (`runJewelleryAgent`)
- `src/lib/price-calculator.ts` — jewellery price math
- `src/lib/auth.ts` — `requireAdminKey()`: checks `x-admin-key` header or `admin_key` query param against `ADMIN_SECRET_KEY`
- Path alias `@/*` → `./src/*`

## Critical quirks (verified in code)
1. **Webhook signature check is bypassed.** `verifyMetaSignature` returns `true` even when invalid or `INSTAGRAM_APP_SECRET` is unset (logs "Bypassing for testing"). Do not rely on it.
2. **DM handler is commented out.** In `webhook/route.ts`, `handleInstagramDM` is disabled; DMs are received but not processed.
3. **Next.js 16 differs from older versions.** There is no `middleware.ts`; the bundled docs under `node_modules/next/dist/docs/` describe `proxy.ts` and the `after()` helper. Read them before adding middleware or background work.
4. **Admin auth is a single shared key**, and it is also leaked as `NEXT_PUBLIC_ADMIN_KEY` in browser components (known issue — do not copy that pattern).
5. Graph API base is hard-coded `https://graph.facebook.com/v25.0`; tokens travel in URL query strings.
6. Tables: `products`, `metal_prices`, `company_info`, `conversations`, `processed_events`, `sender_rate_limits`, `message_buffer`, `recent_replies`, `admin_config`. RLS is on everywhere; `metal_prices` allows anonymous read. Writes use the service-role client.

## Verification
- `npm run dev`, open http://localhost:3000. Test the webhook handshake with `GET /api/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>`.

## Existing instruction sources
- `CLAUDE.md` contains only `@AGENTS.md` — this file is the source of truth.
- `dhera-singh-fix-guide.md` — separate phased remediation plan (security, webhook hardening, DM flow, leads, ice breakers). It is a task plan, not repo convention; its proposed code does not exist yet.
