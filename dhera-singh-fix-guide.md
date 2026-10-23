# Dhera Singh Jewellers: Instagram Chatbot and Dashboard Fix Guide

**Audience:** a Claude Code agent working in the GitHub repo `dhera-singh` (Next.js on Vercel, Supabase database).
**Prepared:** 14 Oct 2026 from the repo zip (commit 3164552), Vercel logs, Supabase schema export, Meta dashboard screenshots and Meta's current developer documentation.
**Scope of this guide:** Instagram comments and DMs, dashboard security, webhook and access-token mismatches, several products per reel, saving customer name and phone, and ice breakers. **WhatsApp is out of scope** (a separate guide follows). Do not touch the Railway app or the scraper; they are a separate prototype.
**This file contains specifications, not code.** Write the code yourself, following the repo's conventions.

Items marked **[VERIFY]** could not be confirmed from documentation and must be tested live before you rely on them.

---

## 0. Rules for the implementing agent

1. **Read the bundled Next.js docs first.** `AGENTS.md` in the repo says this Next.js (16.2.x) differs from older versions. Read the relevant pages under `node_modules/next/dist/docs/` before writing code. Known differences: `middleware.ts` is now `proxy.ts` (same level as `app`, inside `src`), and background work after a response uses the framework's `after()` helper. Confirm both in the bundled docs.
2. **The comment-to-DM flow has run for months with real customers. Do not break it.** Make changes behind small commits, deploy to a Vercel preview first, and test with a tester Instagram account before production.
3. **Do phases in order.** Phase 1 (security) goes live before anything else. Each phase ends with acceptance tests (section 9); do not start the next phase until they pass.
4. **Never print, log or commit secrets.** Show only the first 4 characters of a token when diagnosing. Never put a secret in a variable whose name starts with `NEXT_PUBLIC_`.
5. **Database changes are additive** (new tables, new nullable columns). Never drop or rename existing columns. Keep Row Level Security on and keep anonymous access denied on every table except `metal_prices` read.
6. **Do not invent Meta behaviour.** Where this guide cites a Meta page, re-read it. Where it says [VERIFY], run the test in section 9 and record the result in `CHANGELOG.md`.
7. **Ask the owner** (section 11) rather than guessing business rules.
8. Keep a `CHANGELOG.md` listing every change, every new environment variable (name only) and every new table or column.

---

## 1. System map (what exists today)

**Hosting:** Vercel project `dhera-singh-v1.5` (host `dhera-singh-v15.vercel.app`, Hobby plan, function maximum duration 5 minutes). Meta's callback URL points to `https://dhera-singh-v15.vercel.app/api/webhook`.

**Routes (`src/app/api/`):** `webhook` (Instagram events), `add-product`, `update-prices`, `add-context`, `human-reply`, `dashboard-stats`, `cleanup`, `test`. Pages: `/` (dashboard, four tabs), `/privacy`.

**Libraries (`src/lib/`):** `anthropic.ts` (intent detection, product lookup, replies, one Claude call for shop questions), `price-calculator.ts`, `supabase.ts` (public and service-role clients), `auth.ts` (admin key check).

**Supabase tables:** `products`, `metal_prices`, `company_info`, `conversations`, `processed_events`, `sender_rate_limits`, `message_buffer`, `recent_replies` (unused), `admin_config`. All have RLS with a `service_role_all` policy; `metal_prices` also has anonymous read.

**Environment variable names found in code:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `INSTAGRAM_PAGE_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ADMIN_SECRET_KEY`, `NEXT_PUBLIC_ADMIN_KEY`, `NEXT_PHASE` (build). Vercel also holds `NEXT_PUBLIC_APP_URL`.

**Current live behaviour:**
- A comment on a reel whose link exists in `products.instagram_link` gets a public reply ("check your DM") and one private reply (DM) containing only the price.
- DMs are received by the server (confirmed in logs on 14 Oct) but the DM handler is commented out, so nothing is processed.
- Prices: `metal_prices` (updated by hand in the dashboard) x weight, plus making percent, stone, diamond and polki values, or `fixed_price`; stored in `products.calculated_price`.
- Phone numbers are not captured in any structured way; they sit inside raw message text.

---

## 2. Findings register

Severity: **C** critical, **H** high, **M** medium, **L** low. The "Fix" column points to a phase in section 6.

### 2.1 Security

| ID | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| S1 | C | The admin key is sent from browser code as `NEXT_PUBLIC_ADMIN_KEY`, so it is public. Anyone can call `dashboard-stats` (last 20 conversations including any phone numbers), `update-prices`, `add-product`, `add-context`, `human-reply`. | `AutomationTab.tsx`, `DashboardTab.tsx`, `UpdatePriceTab.tsx` | P1 |
| S2 | C | The dashboard page has no login. | `src/app/page.tsx` | P1 |
| S3 | H | `/api/test` has no auth, inserts a row into `conversations` on every call, and reveals which environment variables are set. | `api/test/route.ts` | P1 |
| S4 | M | The admin key is also accepted in the query string (`admin_key`), which leaks into logs and referrers, and is compared with a plain `!==`. | `lib/auth.ts` | P1 |
| S5 | C | Webhook signature check is bypassed: `verifyMetaSignature` returns `true` even when the signature is invalid, and when the secret is unset. Anyone can post fake events and trigger Claude calls and DMs. | `webhook/route.ts` lines 33-50; log "Invalid signature ... (Bypassing for testing)" | P2 |
| S6 | M | The first 2000 characters of every webhook payload (customer text, IDs) are written to logs, and the invalid-signature log prints the expected signature. | `processEvent`, `verifyMetaSignature` | P2 |
| S7 | M | `dashboard-stats` returns `select("*")` rows of `conversations` to the browser. | `dashboard-stats/route.ts` | P1 |
| S8 | M | `/privacy` lists the vendor's personal email as the shop's contact, says deletion is by email within 48 hours, and there is no Terms page. | `app/privacy/page.tsx` | P8 |
| S9 | M | Repo, Vercel team and privacy contact belong to the vendor's personal accounts. | GitHub and Vercel screenshots | P8 |

### 2.2 Webhook and subscription mismatches

| ID | Sev | Finding | Fix |
|---|---|---|---|
| W1 | H | Two login routes are in play at once. The dashboard shows **API setup with Instagram login** (Business Login for Instagram), the **Messenger** product is also added, and the code sends through a Facebook Page ID on `graph.facebook.com` (the Messenger Platform route). One route must be chosen and documented. | P2 |
| W2 | H | On 14 Oct 14:32 the server received two POSTs 0.6 s apart for one DM; one failed the signature check and one passed. Likely the same DM delivered once per subscription path, each signed with a different secret. [VERIFY] | P0, P2 |
| W3 | H | The account-level subscription (`subscribed_apps`) has never been audited for either route. | P0, P2 |
| W4 | M | Fields subscribed at app level but never used: `message_reactions`, `messaging_seen`, `message_edit`, `live_comments`, `messaging_referral`. Each one calls the function. Meta does not support account-level customisation: once an account is subscribed, the app gets every field it is subscribed to. | P2 |
| W5 | H | The DM handler loop is commented out (`handleInstagram`, lines 222-228) and the WhatsApp call is commented out in `processEvent`. | P3 |
| W6 | H | Handover mismatch: the code treats `entry.standby` like normal DMs, calls `take_thread_control` before every DM, and `pass_thread_control` to the Page Inbox for escalations, while `standby` and `messaging_handover` are unsubscribed in the dashboard. Only a Primary Receiver app may take thread control, and the bot reclaims the thread from humans on every message. | P3 |
| W7 | H | Payload-shape assumptions: comment ID is read only from `value.id` (the Facebook Login shape in Meta's examples uses `comment_id`); attachment types are incomplete (`share` is deprecated after Feb 2026; missing `ig_post`, `reel`, `ig_reel`, `story`, `ig_story`, `ephemeral`); `reply_to.story` (story replies) is ignored; `is_self`, `is_unsupported`, `is_deleted`, `quick_reply` are ignored. | P2, P3 |
| W8 | H | Meta's webhook docs say the app must be **Live** to receive webhooks, that **Advanced Access** is required for `comments`, and that **Business Verification** is required. The dashboard shows **Development**. Real customer comments reportedly work anyway; evidence must be collected (E1). | P0, P8 |
| W9 | M | Duplicate deliveries: Meta retries failed deliveries for up to 36 hours and batches up to 1000 updates per POST. An ice-breaker tap can also produce both a `messages` event and a `messaging_postbacks` event. Comments and DMs are deduplicated by ID; postbacks and cross-type duplicates are not. | P2, P6 |
| W10 | M | The handler waits for Claude, Graph calls and sleeps (3 s burst wait, 1.5 s follow-up delay) before returning 200, and handles events one after another. | P2 |
| W11 | L | The `GET` handshake accepts either `INSTAGRAM_VERIFY_TOKEN` or `WHATSAPP_VERIFY_TOKEN`. Acceptable now; separate them when WhatsApp gets its own route. | P2 |
| W12 | L | Graph version is hard-coded `v25.0`; webhook field versions in the dashboard are a mix of v25.0 and v26.0. | P2 |

### 2.3 Access tokens and identifiers

| ID | Sev | Finding | Fix |
|---|---|---|---|
| T1 | H | The token type in `INSTAGRAM_ACCESS_TOKEN` is unknown (Facebook Page token `EAA...` or Instagram User token `IGAA...`). The sending code only works with a Page token. | P0 |
| T2 | H | The token's app may differ from the app in the screenshot (App ID 901262542246515, "Dhera Singh AI Agent"). | P0 |
| T3 | H | The own-account guards compare the sender with `INSTAGRAM_PAGE_ID`, but webhook senders and `entry.id` are Instagram account IDs. The guard never matches; only text signatures prevent reply loops. | P2 |
| T4 | M | No monitoring of token validity: a Meta error 190 (token expired or revoked) would silently stop all replies. | P2 |
| T5 | M | Tokens are sent in the URL query string (`?access_token=`), which appears in logs and tracing. Use the Authorization header. | P2 |
| T6 | M | The Page token needs a specific permission set and Page task (section 5.4); none of this is checked in code or documented. | P0 |
| T7 | L | Environment names: README omits `ADMIN_SECRET_KEY`, `NEXT_PUBLIC_ADMIN_KEY`, `INSTAGRAM_PAGE_ID` semantics; Vercel still holds `WHATSAPP_*` values for a WhatsApp product that is not added to the Meta app. | P9 |

### 2.4 DMs, comments, products, leads, ice breakers

| ID | Sev | Finding | Fix |
|---|---|---|---|
| D1 | H | DMs are dropped (W5). Story replies, story mentions, shared reels or posts, and ice-breaker taps are not handled. | P3 |
| D2 | H | After a comment-to-DM reply, a follow-up DM has no product context: the context lookup only reads earlier rows with `platform = instagram_dm`, but the comment flow stores `instagram_comment`. The bot asks for the reel again. | P4 |
| D3 | M | Claude gets no conversation history and is fixed to "warm Punjabi-English"; it should mirror the customer's language. | P3 |
| D4 | M | `human-reply` only writes `human_reply` and `status` to the database; nothing is sent to the customer. | P7 |
| C1 | H | The second private reply (the phone-number ask) uses the same `comment_id`. Meta allows only one message per comment, so it always fails and no customer ever sees it. | P4, P5 |
| C2 | M | The public reply "check your DM" is posted before the private reply is attempted; if the DM fails, the public text is wrong. Non-followers receive the DM in **Message Requests**, which the public reply does not mention. | P4 |
| C3 | M | Every text comment on a known reel (even a heart or "nice") triggers a reply and DM. `recent_replies` exists but is unused, so there is no per-person cooldown. | P4 |
| C4 | M | Send helpers swallow errors: Meta error code and subcode are only logged as text, never stored or retried. | P2 |
| M1 | H | Only one product per reel is ever found (`.limit(1)` in `getProductByLink` and `checkProductExists`) although the table already allows several rows per link. | P4 |
| M2 | H | Replies ignore intent: `buildProductReply` returns only the price even for weight, purity or details questions. | P4 |
| M3 | M | Purity text is free-form but must equal `metal_prices.karat_label` (`24K`, `22K`, `18K`, `16K`, `14K`, `Silver`); a typo makes the product skip pricing silently. | P4 |
| L1 | H | No structured lead: phone is detected only if the entire message is a number, stored only as raw message text, no name, no consent record, no interest list. | P5 |
| I1 | M | No ice breakers are configured. | P6 |
| O1 | L | `recent_replies` unused; README says Claude 3.5 Sonnet while code uses `claude-sonnet-4-20250514`; model name should be an environment variable. | P9 |
---

## 3. How Meta delivers Instagram events (subscription model)

Sources: Meta's pages "Setup Webhooks Subscriptions" and "Webhooks for Instagram Messaging" (section 12).

### 3.1 Three integration components

Instagram events and sending can run through three different components. They differ in token type, host and IDs, and Meta notes that payload syntax varies slightly with the login type.

| | Business Login for Instagram | Facebook Login for Business | Instagram Messaging via Messenger Platform |
|---|---|---|---|
| Access token | Instagram User token | Facebook User or Page token | Facebook User or Page token |
| Base URL | `graph.instagram.com` | `graph.facebook.com` | `graph.facebook.com` |
| ID in the URL | Instagram account ID (or `/me`) | Facebook Page ID (or `/me`) | Facebook Page ID (or `/me`) |
| Basic permission | `instagram_business_basic` | `instagram_basic` | `instagram_basic` |
| Covers | comments, messages, handover, postbacks, ice breakers | comments, mentions, insights | messages, postbacks, handover, standby |

**This project's code** sends through `graph.facebook.com/{PAGE_ID}/messages` with a token, so it is on the Messenger Platform / Facebook Login route (Route A below). **The dashboard** exposes the webhook configuration under "API setup with Instagram login" (Route B). Both can be active on the same app. That is the root of W1.

### 3.2 Two layers of subscription (both are needed)

1. **App level.** Meta App Dashboard > Webhooks (or Instagram > API setup) > object **Instagram**: one callback URL, one verify token, and a list of fields with a version each.
2. **Account level.** An API call that enables the specific Instagram account for the app: `POST /me/subscribed_apps?subscribed_fields=...`. With a Page token, `/me` is the Page; with an Instagram User token on `graph.instagram.com`, `/me` is the Instagram account.

Meta states: **account-level webhook customisation is not supported.** If the account is subscribed to any Instagram field, the app receives notifications for every field it is subscribed to at app level. The dashboard toggles are therefore the only control over which events arrive.

### 3.3 Requirements Meta states (conflict with the current setup, see W8)

- The app must be set to **Live** to receive webhook notifications.
- **Advanced Access** is required to receive `comments` and `live_comments`.
- **Business Verification** is listed as required for all three components.
- If the app is not approved, webhooks are sent only when the person using the app has a role on it, and only for data that person owns or administers.
- The Instagram account must be **public** to receive comment or mention notifications.

The dashboard shows Development mode, yet public comments reportedly work. Treat the documentation as the safe target (Phase 8) and collect evidence (E1) before deciding how urgent that is.

### 3.4 Delivery rules

- Reply **200 OK** to every notification. Failed deliveries are retried immediately and then with decreasing frequency for **36 hours**; unacknowledged ones are dropped after that. Deduplicate.
- A POST can batch **up to 1000** updates. Handle each entry individually.
- Every POST carries `X-Hub-Signature-256: sha256=<hex>`, an HMAC-SHA256 of the **raw body** keyed by an app secret. Compute over the raw bytes, not re-serialised JSON.
- Meta's docs say "your app's App Secret" (App settings > Basic). A separate Instagram app is created under "Manage messaging & content on Instagram" and has its own ID and secret on the Business Login settings page. Which secret signs which delivery is unconfirmed [VERIFY]: accept a short allow-list of configured secrets and log which one matched (label only, never the secret).

### 3.5 Fields: what to subscribe to

| Field | Keep? | Why |
|---|---|---|
| `messages` | **Yes** | DMs, story replies, story mentions, shares, ice-breaker taps (as a message), and **echoes** of messages the account sends (`is_echo`) |
| `messaging_postbacks` | **Yes** | Ice-breaker taps arrive here with `title` and `payload` |
| `comments` | **Yes** | Comment-to-DM flow |
| `messaging_referral` | Optional | Only if `ig.me` links with a `ref` are used (attribution) |
| `standby`, `messaging_handover` | **Only if** Handover Protocol is used (Phase 3 Option 2) | Otherwise leave off |
| `message_reactions`, `messaging_seen`, `message_edit`, `live_comments`, `messaging_optins`, `message_echoes` | **No** | Not handled; each fires the function for no benefit |

### 3.6 Payload shapes the handler must accept

**Messages** (`entry[].messaging[]`): `entry.id` is the shop's Instagram account ID; `sender.id` is the customer's Instagram-scoped ID (IGSID); `message.mid`; optional `text`, `attachments[]` (type one of `image`, `video`, `audio`, `file`, `ig_post`, `ig_reel`, `reel`, `story`, `ig_story`, `story_mention`, `media`, `share` (deprecated), `ephemeral` without URL), `reply_to.story {url,id}` (story reply), `reply_to.mid` (inline reply), `quick_reply.payload`, `is_echo`, `is_self` (test message to own account), `is_unsupported`, `is_deleted`, `referral`. GIFs and stickers send no webhook.

**Postbacks** (`messaging_postbacks`): `postback {mid, title, payload}`. Meta also lists "an Icebreaker option is selected" under the `messages` field, so one tap may produce **both** a `messages` event and a postback. Treat as [VERIFY] and dedupe (Phase 6).

**Comments** (`entry[].changes[]` with `field = comments`): `value.from {id, username}`, `value.text`, `value.media {id, media_product_type}`, comment ID in `value.id` (Business Login shape) or `value.comment_id` (shape shown for Facebook Login). Accept both. There is no permalink or shortcode in the real payload; resolve the media ID through the Graph API (`permalink`), as the code already does.

### 3.7 Handover Protocol facts

- By default all messages go to the **Primary Receiver** app. Only one app may control a thread; the others see `standby` events if subscribed.
- It activates only when Page settings > Advanced Messaging has exactly one Primary and at least one Secondary Receiver.
- **Only the Primary Receiver can call Take Thread Control.** Pass Thread Control to the Page Inbox (the code uses app ID `263902037430900`) hands the thread to humans in Meta's inbox.

---

## 4. Why DMs are not read: every cause and its fix

| # | Cause | How to test | Fix | Status here |
|---|---|---|---|---|
| DM-1 | Handler disabled in code | Read `handleInstagram` | Re-enable (P3) | **Confirmed.** Logs show "1 DM/standby event(s) received" and nothing else |
| DM-2 | Event arrives as `standby`, not `messaging` | Open the log's payload; look for the `standby` key | Decide Option 1 or 2 in P3; subscribe `standby` only if Option 2 | Unknown (E2, E5) |
| DM-3 | Account not subscribed (account level) | `GET subscribed_apps` for the route in use | `POST subscribed_apps` with `messages,messaging_postbacks,comments` | Unknown (E4) |
| DM-4 | App-level field not subscribed | Dashboard field list | Toggle on | `messages`, `messaging_postbacks` are on |
| DM-5 | Instagram "Allow access to messages" is off | Instagram app > Settings > Messages and story replies > Message controls > Connected tools | Owner turns it on | Unknown |
| DM-6 | App not Live / sender has no role | Dashboard mode; test with a no-role account | Phase 8 | Dev mode shown; E1 decides |
| DM-7 | Signature rejects real deliveries | Logs show "Invalid signature" | Allow-list both app secrets (P2) | One of two POSTs failed on 14 Oct |
| DM-8 | Delivery duplicated across two subscription paths | Compare `mid` and `entry.id` of the two POSTs | Keep one route's subscription; dedupe by `mid` | Suspected |
| DM-9 | Vercel blocks Meta (deployment protection, preview URL, wrong domain) | `GET` handshake returns the challenge | Use the production domain; disable protection for `/api/webhook` | Handshake works |
| DM-10 | Account is a Creator account or not linked to a Page | Instagram account type; Page link | Business account linked to the Page (owner says Business) | Business confirmed |
| DM-11 | Sender rate limit (8 per 5 minutes per sender) blocks real users | `sender_rate_limits` rows | Raise limit for DMs, keep for comments | Low risk |
| DM-12 | Handler crashes silently | Log lines after the DM event | Add error logging with event ID (P2) | n/a until enabled |

---

## 5. Access tokens: identify, decide, maintain

### 5.1 Token types

- **Facebook Page access token** (starts `EAA`): used with `graph.facebook.com/{PAGE_ID}`. A Page token derived from a long-lived user token does not expire on a timer, but stops working if the user's password changes, the user loses the Page task, or the app permissions are removed.
- **Instagram User access token** (starts `IGAA` or similar): used with `graph.instagram.com`. Long-lived tokens last **60 days** and must be refreshed (`GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`) when at least 24 hours old and not expired.

### 5.2 Identification steps (Phase 0, E3)

1. In Vercel project settings, read the **first 4 characters** of `INSTAGRAM_ACCESS_TOKEN`. Record `EAA...` or `IGAA...`. Do not copy the token anywhere.
2. Call `GET graph.facebook.com/{version}/debug_token?input_token=<TOKEN>&access_token=<APP_ID>|<APP_SECRET>` (the app secret is on App settings > Basic). Record: `app_id`, `type` (PAGE or USER), `is_valid`, `expires_at` (0 means no expiry), `scopes`, and the target IDs in `granular_scopes` (the Page ID and Instagram account ID).
3. Compare `app_id` with **901262542246515**, and the Page ID with `INSTAGRAM_PAGE_ID`.
4. With the token, `GET /{PAGE_ID}?fields=name,instagram_business_account{id,username}`. Record the **Instagram account ID** (needed for the self-filter, T3).
5. `GET /{PAGE_ID}/subscribed_apps` (Page token) and, if an Instagram User token exists, `GET graph.instagram.com/{version}/me/subscribed_apps`. Record the subscribed fields.

### 5.3 Decision outcomes

| Outcome | Meaning | Action |
|---|---|---|
| **A** Page token, valid, `expires_at` 0, app matches | Route A (Messenger Platform / Facebook Login) | **Recommended path. Keep it.** Use Page endpoints for send, private reply, ice breakers; keep account subscription on the Page; make sure no second subscription duplicates events |
| **B** Instagram User token (`IGAA`) | Route B (Business Login) | Sending code must change to `graph.instagram.com/{version}/{IG_ACCOUNT_ID}/...`; add a 60-day refresh job and alert; Section 8 lists the equivalent endpoints |
| **C** Token invalid or expired (error 190) | Replies are failing now | Regenerate: Graph API Explorer or Business Login, select the Page and Instagram account, grant the section 5.4 permissions, exchange for a long-lived token, store in Vercel, redeploy |
| **D** `app_id` differs from the dashboard app | Production runs on another Meta app | Stop. Find the real app, then redo E4 and E6 against that app. All dashboard checks in this guide apply to the app that owns the token |

### 5.4 Permissions and tasks needed on Route A

`instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`, plus the **Human Agent** feature for manual replies after 24 hours (Phase 7). The person who generated the token must have the **MESSAGING** task on the Facebook Page linked to the Instagram account. The User Profile API (used for the customer's name) needs the same messaging permissions and works only for people who have messaged the account or tapped an ice breaker or menu.

### 5.5 Mismatch register (code vs Meta vs dashboard)

| # | Code or setup says | Meta or dashboard says | Resolution |
|---|---|---|---|
| X1 | Reads comment ID from `value.id` | Facebook Login example uses `comment_id` | Accept both |
| X2 | Compares sender to `INSTAGRAM_PAGE_ID` | `entry.id` and `recipient.id` are the Instagram account ID | Use `entry.id`, plus an optional `INSTAGRAM_ACCOUNT_ID` variable |
| X3 | Verifies with `INSTAGRAM_APP_SECRET` only | A second Instagram app secret may sign Business Login deliveries | Allow-list, log which matched |
| X4 | Sends via Page ID on `graph.facebook.com` | Dashboard configures "Instagram login" | Choose route (5.3) |
| X5 | Treats `entry.standby` as DMs | `standby` and `messaging_handover` fields are off | P3 Option 1 or 2 |
| X6 | Calls `take_thread_control` before every send | Only the Primary Receiver may | Remove, or gate on Option 2 |
| X7 | Subscribes (dashboard) to reactions, seen, edit, live comments, referral | Code ignores them | Turn off unused fields |
| X8 | Classifies attachment `share` as reel | `share` deprecated after Feb 2026; new types `ig_post`, `reel`, `ig_reel`, `story`, `ig_story` | Use the section 3.6 list |
| X9 | Story replies not handled | Arrive as `reply_to.story` on a normal message | P3 |
| X10 | `messaging_type: RESPONSE` on private replies | Meta's private-reply example sends only recipient and message | Keep if it works; drop if Meta returns error 100 |
| X11 | Comment flow stores `instagram_comment` rows; DM flow reads `instagram_dm` rows for context | Same customer, one conversation | Use `reel_context` (P4) |
| X12 | Private reply is sent twice | One message per comment | Merge into one (P4) |
| X13 | Callback is a `vercel.app` host | Must be a stable HTTPS production domain | Keep; confirm it is the production alias |
| X14 | Graph version fixed `v25.0` | Dashboard fields mix v25.0 and v26.0 | Environment variable; check Meta's changelog before bumping |
| X15 | `INSTAGRAM_VERIFY_TOKEN` and `WHATSAPP_VERIFY_TOKEN` both accepted | The dashboard verify token must equal one of them exactly | Record which one the Instagram object uses |
| X16 | Dashboard in Development mode | Meta docs: Live required | Phase 8 |
| X17 | `human-reply` marks `human_replied` | Nothing is sent to Instagram | P7 |

### 5.6 Maintenance

- Error handling for every Graph call (store `error.code`, `error_subcode`, `message`, request kind and event ID): **10** permissions (check `pages_messaging` and the Page token), **100** invalid parameter, **190** token expired or revoked (raise an alert immediately), **551** person unavailable, **613** rate limit, **1545041** messaging window closed.
- Add an authenticated health route that makes one harmless call (`GET /{PAGE_ID}?fields=id`) and reports valid or invalid, token type and days to expiry. Run it on a schedule and email the owner on failure.
- When the token is replaced: update Vercel, redeploy, run the health route, send a tester DM.
---

## 6. Implementation plan (do in order)

Each phase lists the findings it closes and ends with acceptance tests from section 9.

### Phase 0: Evidence collection (read-only, no code changes)

Write the results (no secrets, IDs shortened) into `docs/phase0-evidence.md`. Several checks need the owner's Meta, Vercel or Supabase access; ask for screenshots rather than credentials.

| # | Check | How | What it decides |
|---|---|---|---|
| E1 | Do public customers' comments really reach the bot while the app is in Development mode? | Supabase Table Editor on `conversations`: filter `platform = instagram_comment`, last 60 days, count distinct `sender_id`. Compare with the number of accounts listed under Meta App roles. | If distinct senders far exceed role holders, public delivery works today (W8 is lower urgency). If not, only testers were ever served and Phase 8 becomes urgent |
| E2 | What exactly does a DM event look like? | Vercel Logs: open the 14 Oct 14:32 POSTs, expand `entry`. Record whether the key is `messaging` or `standby`, `entry.id`, `sender.id`, `message.mid`, attachments. Compare the two POSTs. Redact before sharing | DM-2, DM-8, W2 |
| E3 | Token type, app, expiry, scopes | Section 5.2 | Route A or B (5.3) |
| E4 | Subscriptions | Section 5.2 step 5; dashboard Webhooks > Instagram object (callback URL, fields, versions); Instagram > API setup with Instagram login (account webhook toggle); Messenger settings (Page subscriptions) | DM-3, DM-8, W3 |
| E5 | Handover state | Page settings > Advanced Messaging > Handover Protocol: who is Primary and Secondary. If Primary, `GET /me/secondary_receivers` | DM-2, W6 |
| E6 | Compliance status | App Review > Permissions and Features: Standard or Advanced per permission and feature; Security Center: Business Verification status; App settings > Basic: privacy, terms, data-deletion URLs, category | W8, Phase 8 |
| E7 | Instagram account | Business type; public; Allow access to messages on; linked Page | DM-5, DM-10 |
| E8 | Vercel | Production domain; environment variable **names**; plan; Deployment Protection off for `/api/webhook`; whether Cron jobs exist; log retention | DM-9, S1, O-items |
| E9 | Supabase | RLS on all tables; count of `products` rows sharing an `instagram_link`; distinct `products.purity` values against `metal_prices.karat_label`; counts of `conversations.status` | M1, M3 |
| E10 | Handshake test | `GET` the webhook with `hub.mode=subscribe`, the verify token and a challenge on production | DM-9 |

### Phase 1: Security hotfix (closes S1, S2, S3, S4, S7)

Ship this before any feature. Goal: nobody without a staff login can read or change anything.

1. **Supabase Auth settings.** Email and password sign-in only. Turn **off** public sign-ups (Authentication settings, "allow new users to sign up"; wording may differ). Create staff users by invitation using emails the owner supplies.
2. **`staff_profiles` table** (section 7): user ID, display name, role `admin` or `agent`, active flag. Insert one row per invited user.
3. **Session handling.** Add Supabase's server-side auth package for Next.js (`@supabase/ssr`) and a helper that reads the session from cookies in route handlers and server components. Follow its current docs and the bundled Next.js docs.
4. **`/login` page.** Email and password, a clear error message, no sign-up link, no "forgot password" until the owner asks.
5. **`src/proxy.ts`.** Redirect unauthenticated **page** requests to `/login`. The matcher must exclude `/api/webhook`, `/login`, `/privacy`, `/terms`, `/data-deletion`, `/_next` and static files, because Meta calls the webhook without cookies. The proxy is a convenience only; every API route must still verify the session itself.
6. **`requireStaff` helper.** Verifies a valid session, a `staff_profiles` row and `active = true`, and an allowed role; otherwise returns 401 (not signed in) or 403 (wrong role). Replace `requireAdminKey` in `add-product`, `update-prices`, `add-context`, `human-reply`, `dashboard-stats` and `cleanup`.
   - Role rules: **admin** may do everything. **agent** may read the dashboard, read and update leads, and reply. Only admin may change prices, add products or context, delete leads, or run cleanup.
7. **Machine access.** Keep `ADMIN_SECRET_KEY` only for scheduled jobs: header `x-admin-key` only, constant-time comparison, no query-string option. If Vercel Cron is used for cleanup, follow Vercel's cron authorisation instead.
8. **Dashboard components.** Remove every use of `process.env.NEXT_PUBLIC_ADMIN_KEY` and the `x-admin-key` header from `AutomationTab`, `DashboardTab` and `UpdatePriceTab`. Same-origin fetches carry the session cookie. On 401, redirect to `/login`.
9. **Delete `src/app/api/test/route.ts`.** Add a staff-only `/api/health` that returns booleans and token validity only (never values).
10. **`dashboard-stats`.** Select only the columns the UI shows; no `select("*")`.
11. **Environment clean-up.** Remove `NEXT_PUBLIC_ADMIN_KEY` from all Vercel environments. Generate a new random `ADMIN_SECRET_KEY` (at least 32 bytes). Redeploy. Confirm the old key string no longer appears in the built client files (`.next/static`) or the browser's loaded sources.
12. **Exposure review.** Check Vercel logs and the `updated_at` of `metal_prices` and `products`, and recent `conversations`, for changes nobody recognises since the key became public. Report anything odd to the owner. The admin key never protected Meta or Anthropic keys, so those are not exposed by this issue unless E8 shows a `NEXT_PUBLIC_` secret.
13. Update the README environment section to match reality.

### Phase 2: Webhook and token hardening (closes S5, S6, W2-W4, W9-W12, T3-T5, C4)

1. **Module split.** Keep `webhook/route.ts` thin. Create modules for: signature check, Graph client (every Meta call goes through it), event normaliser, and bot logic. Do not change behaviour while splitting; commit the split separately.
2. **GET handshake.** Constant-time verify-token comparison; respond `200` with the challenge as plain text.
3. **Signature check, in two steps.**
   - Read the **raw body once**. Allow-list secrets from environment: `INSTAGRAM_APP_SECRET` and a new `META_APP_SECRET` (the Meta app's secret from App settings > Basic). Compare each in constant time.
   - **Step 2a, observe mode** (environment flag `WEBHOOK_SIGNATURE_MODE=observe`): keep processing every event, and log per POST only "matched: instagram | meta | none". Run for at least 48 hours of real traffic.
   - **Step 2b, enforce mode** once the logs show every genuine delivery matches a listed secret: reject non-matching POSTs with 401 and no processing. Remove the secret that never matched.
4. **Respond fast.** After signature and JSON parsing, return 200 immediately and do the work with the framework's `after()` helper (confirm in the bundled docs). Process entries with a small concurrency cap (for example 5), each wrapped in its own error handling that logs the event ID.
5. **Event normaliser.** Convert every raw item into a normalised event with: kind (`dm_text`, `dm_story_reply`, `dm_story_mention`, `dm_share`, `dm_attachment`, `dm_quick_reply`, `postback`, `comment`, `echo`, `ignored`), event ID (dedupe key), shop account ID (`entry.id`), sender ID, text, attachments, story reply info, timestamp and, for comments, username and media ID. Dedupe keys: DM `mid`; comment ID (read `value.id` or `value.comment_id`); postback `mid` if present, otherwise a hash of sender, timestamp and payload. Use the existing `processed_events` table, with a key prefix per kind.
6. **Self-filter.** Ignore anything where the sender (or comment author) equals `entry.id`, or where `is_echo`, `is_self` or `is_deleted` is set. Add an optional `INSTAGRAM_ACCOUNT_ID` variable as a backup. Keep the text-signature check on comments as a second guard.
7. **Graph client.** One function performs every request. Version from `META_GRAPH_VERSION` (default `v25.0`; check Meta's changelog before changing). Token in the `Authorization: Bearer` header, never in the URL. Parse errors into code, subcode, message and trace ID. Retry at most twice with backoff on 5xx and 613; never retry 10, 100, 190, 551. Record failures (status `send_failed` with the error text on the `conversations` row).
8. **Token alerting.** On error 190, set `admin_config` key `token_status` to `invalid` and show a red banner in the dashboard; optionally email the owner. The scheduled `/api/health` check updates the same key.
9. **Logging.** Replace full-payload logging with one structured line per event: kind, event ID, hashed sender, timing. No message text, no signatures, no tokens. Provide `WEBHOOK_DEBUG_PAYLOAD=true` that logs a redacted payload for a limited time.
10. **Subscription alignment (decision from E3, E4).**
    - **Route A (expected):** Page `subscribed_apps` includes the messaging fields; app-level fields match section 3.5. If E2 shows one DM arriving twice (two POSTs, different signatures), switch off the Business Login account webhook toggle (Instagram > API setup with Instagram login) or call `DELETE /me/subscribed_apps` with an Instagram token, then re-test until exactly one POST arrives per DM.
    - **Route B:** see section 8's Route B column; move all sends to `graph.instagram.com` with the Instagram account ID and add a 60-day token refresh job.
    - Turn off unused fields (W4). Record the final callback, verify token name, fields and versions in `docs/meta-config.md`.
11. **Rate limits.** Keep per-sender limits but separate buckets: comments 8 per 5 minutes, DMs 20 per 5 minutes. Make them constants.
12. Keep the `GET` handshake accepting the existing verify variables until WhatsApp gets its own route (W11).

### Phase 3: Turn DMs on (closes D1, D3, W5, W6, W7)

1. **Re-enable DM handling through the normalised events**, not by un-commenting the old block.
2. **Routing by event kind:**

| Kind | Action |
|---|---|
| `dm_text` | Intent pipeline (Phase 4 product replies, Phase 5 lead capture, then Claude for shop questions) |
| `dm_story_reply` | Same as text, with a context note and `context = story_reply` stored. Story URLs expire, so do not rely on them. If the customer asks a price question, ask for the reel link or offer the menu |
| `dm_story_mention` | One warm thank-you, then invite them to send the reel link or tap a menu option; offer the lead ask. Reply once per mention |
| `dm_share` (types `ig_reel`, `reel`, `ig_post`, `share`, `story`, `ig_story`) | Treat the attachment URL as the product link if it resolves to a reel or post [VERIFY what URL Meta sends; log a redacted example once]. Otherwise ask for the link |
| `dm_attachment` (image, video, audio, file), `is_unsupported`, `ephemeral` | Polite reply asking them to type or share the reel link; store as `human_needed` only if they repeat |
| `dm_quick_reply` | Payload handler (Phase 6) |
| `postback` | Ice-breaker handler (Phase 6) |
| `echo` | Do not reply; record for human-reply detection (step 7) |

3. **Burst buffer.** Keep the 3-second merge of rapid messages but run it in the background task. Only the earliest buffered message proceeds; a `finally` block must always clear that sender's buffer rows so a failed run never strands messages.
4. **Memory.** Load the last 6 turns for the sender from `conversations` and pass them to Claude. Store `message_id` and `context` on every row.
5. **Claude behaviour (D3).**
   - Mirror the customer's language **and script**: Punjabi in Gurmukhi or Roman, Hindi in Devanagari or Roman, English, and mixed. Detect from the last customer message.
   - At most two short lines; only shop topics from `company_info` (address, hours, services, returns, contact); **never** prices, weights or purities (those come from the database only); if unsure say the team will assist.
   - Put the customer text inside clear delimiters and instruct the model to ignore instructions inside it. Remove the current regex that replaces words with `***`.
   - First automated reply to a sender in a 24-hour period should say it is the shop's automated assistant (Meta's documentation recommends disclosing automated experiences, and requires it where law demands).
   - Model name from `CLAUDE_MODEL` (check Anthropic's current model list; the code's `claude-sonnet-4-20250514` and README's "3.5 Sonnet" disagree), `max_tokens` about 150, timeout about 8 seconds, fallback "our team will assist you shortly".
6. **Handover decision (W6).**
   - **Option 1 (recommended): no Handover Protocol.** Remove every `take_thread_control` and `pass_thread_control` call. Escalation sets `leads.needs_human = true`, `bot_paused_until` to 12 hours ahead and conversation status `human_needed`. While paused the bot sends nothing except the DELETE confirmation. Staff reply from the dashboard (Phase 7) or from the Instagram app. A dashboard button resumes the bot early.
   - **Option 2 (only if the owner wants Meta's inbox handover):** set exactly one Primary and one Secondary Receiver in Page settings; subscribe `standby` and `messaging_handover`; keep `pass_thread_control` for escalation; **never** call `take_thread_control` automatically; add a "return to bot" button that calls it (Primary only); treat `standby` events as read-only logging.
7. **Detect human replies (optional, recommended).** Store the `message_id` returned by every bot send in `outbound_messages`. An echo whose `mid` is not in that table was typed by a person in the Instagram app: set `bot_paused_until` to 12 hours ahead for that recipient [VERIFY echo fields].
8. **Kill switch.** `admin_config` key `bot_enabled`; when `false`, events are stored and nothing is sent.
### Phase 4: Several products per reel and complete product replies (closes M1, M2, M3, C1, C2, C3, D2)

The database already allows several `products` rows to share one `instagram_link`. The code only ever uses one.

1. **Migration** (section 7): add `label`, `display_order`, `reel_code`, `is_combo` to `products`; backfill `reel_code` from the shortcode in `instagram_link` (the code after `/p/`, `/reel/` or `/tv/`); index `reel_code` with `is_available`. Add **no** uniqueness on `instagram_link` or `reel_code`.
2. **Purity normalisation (M3).** In `add-product`, trim and normalise case and validate against the labels in `metal_prices` (`24K`, `22K`, `18K`, `16K`, `14K`, `Silver`); reject unknown values with a clear message. In the price calculator, compare normalised values. Show products with an unmapped purity or missing weight in a "needs attention" list in the dashboard. Report existing mismatches (E9) to the owner before changing any row.
3. **Lookup by reel.** New function returns all available products for a link, ordered by `display_order` then creation time, using the shortcode extracted from the permalink (from the comment's media permalink or from a DM link). Keep the old URL-variant match as a fallback while rows are backfilled. Use the same function for the "is this reel in our database" check.
4. **Dashboard (add product form).** After saving a product, keep the link filled so staff can add the next product to the same reel in one click. Under the form show "Products on this reel": label, weight, purity, price, order, active toggle, edit, disable. Fields: `label` ("Necklace", "Earrings", "Set"), `is_combo` ("this row is the price for the whole set"). Warn on missing weight, purity or price.
5. **First message to a commenter (one private reply only).** Build a single message within a **900-byte** budget (Instagram limits text size to roughly 1000 bytes [VERIFY]; count UTF-8 bytes, because Hindi and Punjabi characters take more than one):
   - Greeting and a short "automated assistant" note. Meta automatically adds a link to the commented post to every private reply, so do not add the reel link yourself.
   - One line per product: `n) label, purity, weight: price`. Weight is shown by default (the owner describes replies as "prices and weights"); controlled by `admin_config` key `reply_show_weight`. Making charges are hidden unless `reply_show_making` is set.
   - A combo row is shown as the set price. Never auto-sum products into a total unless a combo row exists.
   - A product with no price shows "price on request" and flags the lead `needs_human`.
   - Footer: "Reply a number for full details" and one short line inviting name and mobile number (consent wording in Phase 5).
   - If everything does not fit, include whole lines until the budget minus the footer is reached, then add "+N more: reply MORE". A single product uses the same format without numbering.
6. **Order of sending (C2).** Send the private reply **first**. Only if it succeeds, post the public reply: "Sat Shri Akal Ji 🙏 Details sent to your DM. Please also check Message Requests." (Meta delivers a private reply to the Requests folder when the person does not follow the account.) If the private reply fails, post no "check DM" text; store `send_failed` with the Meta error.
7. **Remove the second private reply (C1).** Nothing else may be sent for that comment. Further messages happen only after the customer replies, inside the 24-hour window.
8. **Cooldown and gating (C3).** Record every private reply in `reel_context`. Skip a comment if the same person already received a reply for the same reel in the last 24 hours. Skip emoji-only comments and the shop's own comments. `admin_config` key `comment_reply_mode`: `all` (default, today's behaviour) or `intent` (only comments that look like questions, such as price words or "pp"); the owner chooses.
9. **Context across comment and DM (D2).** The private reply's API response contains `recipient_id` (the customer's IGSID). Store it with the reel and product IDs in `reel_context`. DM events later use that same ID. [VERIFY that the comment's `from.id` equals the DM `sender.id` for the same person; if not, key everything on the returned `recipient_id`.] Context expires after 7 days.
10. **Follow-up replies in DM (all deterministic, database only, never Claude):**
    - A number (`1`, `2`, `#2`, "2nd", "first", Hindi and Punjabi ordinals such as pehla, dusra, teesra) selects that product.
    - "all", "sab", "saare" returns compact details for every product.
    - "more", "hor", "aur" returns the next page of the list.
    - Weight, purity or details questions apply to the selected product; with several products and none selected, reply with one compact line per product (label, purity, weight) instead of asking again.
    - Price repeats the price lines.
    - **Fix `buildProductReply` (M2)** so every requested field is actually returned: label, purity, weight, price, optional description (truncated), making only if enabled.
    - No context and a price question without a link: ask for the reel link or to comment under the reel, and show the menu.
11. **Language.** Keep all fixed replies in one dictionary file with English, Roman Punjabi and Roman Hindi variants (and Gurmukhi/Devanagari where the customer wrote in that script), so the owner can edit wording in one place.

### Phase 5: Save name and phone (closes L1; supports C1)

1. **Migrations** (section 7): `leads`, `lead_interests`, and the extra `conversations` columns.
2. **Create or update a lead on first contact of any kind** (comment, DM, ice-breaker tap, story reply or mention, share). Key: platform `instagram` and the customer's IGSID. Save `username` from the comment payload's `from.username`, `entry_point` (`comment_reel`, `dm`, `ice_breaker:<payload>`, `story_reply`, `story_mention`, `share`), `last_user_message_at`, `source_reel_code`.
3. **Instagram display name.** After the person has messaged or tapped an ice breaker, call the User Profile API once (`name`, `username`) and store `instagram_name`. It needs the messaging permissions in 5.4 and fails for people who only commented; ignore failures, never block a reply.
4. **Capture state machine** (`capture_stage`: `none`, `asked_name`, `asked_phone`, `complete`, `declined`). Triggers: the last line of the first private reply; after the bot has delivered product details in DM; the callback ice breaker; or the customer volunteers a number.
   - **Name first** ("May I know your name, ji?"), **then phone** ("And your mobile number so our team can call you? We use it only for this enquiry. Privacy: <URL>"). One ask per message. Never delay or replace a price answer.
   - Accept as a name: 2 to 40 characters, letters and spaces in Latin, Devanagari or Gurmukhi, not a question, not matching a known intent. Also parse "my name is ...", "mera naam ... hai", "ਮੇਰਾ ਨਾਮ ... ਹੈ". If it is not a name, handle it as a normal message and ask once more later.
   - **Phone parsing:** Indian mobiles (optional `+91`, `91` or `0`, spaces or hyphens, 10 digits starting 6-9) and international numbers (`+` country code, 8 to 15 digits). Extract from anywhere in a message, so "Rahul 98765 43210" fills both fields. Normalise to E.164 in `phone_e164`; keep `phone_raw`. Ignore digit strings longer than 15 and anything equal to a product ID.
   - **On success:** set `phone_consent_at`, `phone_consent_version` (the version of the consent wording shown), `phone_source = typed_in_chat`, `needs_human = true`, `contact_status = contact_requested`; reply "Thank you <name> ji 🙏 We have noted your number ending <last 3 digits>. Our team will call you. Reply DELETE any time to remove your details."
   - **Refusals** ("no", "nahi", "later") set `declined`; do not ask again for 30 days unless the customer uses the callback ice breaker. Maximum 2 asks per 7 days (`asks_count`, `last_ask_at`).
   - **Keep numbers out of chat logs:** replace the number with `[phone shared]` in `conversations.human_message` and before any text goes to Claude. The number lives only in `leads`.
5. **Interests.** Every time products are shown, insert `lead_interests` rows (lead, reel code, product, source, `shown_at`); set `selected_at` when the customer picks one.
6. **Merging comment and DM identities** uses the IGSID from the private reply response (Phase 4 step 9).
7. **DELETE and STOP keywords** in English, Hinglish, Devanagari and Gurmukhi variants. DELETE removes the lead, its interests, `reel_context`, `message_buffer` rows and the sender's `conversations` rows, then confirms. STOP clears marketing flags and stops asks.
8. **Dashboard "Leads" tab** (admin and agent): columns name, Instagram name and username (link to the profile), phone (click to copy), products asked (names), source reel, entry point, status, last message time, needs-human badge, assigned staff, notes. Filters: needs human, new, has phone, status, date range, search. Detail drawer with the conversation and interests; edit status, assignment, notes. **Export CSV** (admin only, server-side, UTF-8 with BOM so Excel shows Hindi and Punjabi correctly; log every export).
9. **Retention.** A scheduled job deletes or anonymises leads with no activity for N months (owner decides; default 12).

### Phase 6: Ice breakers (closes I1; handles W9)

Meta allows **4** questions, not shown on desktop, and requires a `default` locale entry (Facebook Login page; the Instagram Login page does not list it but adding `default` is safe). Taps arrive as `messaging_postbacks` with `title` and `payload`, which is already subscribed.

1. **Define the four questions and payloads once** in one constants file (owner approves wording; keep each short, about 50 characters [VERIFY the exact limit]):

| # | Question (default locale, English and Roman Punjabi) | Payload | Reply (deterministic) |
|---|---|---|---|
| 1 | Aaj da gold rate? / Today's gold rate | `ICE_GOLD_RATE` | `metal_prices` lines for 24K, 22K, 18K (silver if the owner wants) with the update date in IST; then "Send the reel link or comment under a reel for a design's price." If rates are older than 36 hours, add that the team will confirm |
| 2 | Reel wale design da price | `ICE_REEL_PRICE` | Ask them to comment "price" under the reel or send its link |
| 3 | Shop address te timing | `ICE_STORE_INFO` | From `company_info`: address "Adalat Bazaar, near AC Market, Patiala" and hours "10:00 am to 9:00 pm" (add these keys if missing; closed days still unknown); otherwise "our team will share" |
| 4 | Team naal gal karni hai / Call me | `ICE_CALLBACK` | Start lead capture (`asked_name`), set `needs_human` |

2. **Other locales.** Add Hindi and Punjabi versions only if their locale codes appear in Meta's supported-locale list [VERIFY]; otherwise keep the bilingual default text.
3. **Setting them.** Add an admin-only "Sync ice breakers" action that sends the constants to Meta and then reads them back to confirm (section 8 has the Route A and Route B requests). Store a hash of the definitions in `admin_config` so a change in code is visible. Include a delete action.
4. **Handling taps.** The handler maps `payload` to the replies above and records `entry_point = ice_breaker:<payload>` on the lead. Replies are free of Claude.
5. **Duplicate guard.** Meta lists ice-breaker selection under the `messages` field as well as `messaging_postbacks`, so one tap may arrive twice [VERIFY with a live tap]. Implement a short "tap lock": when a postback is handled for a sender, record `tap:<sender>:<payload>` in `processed_events`; drop any `messages` event from that sender whose text equals the postback title within 10 seconds. Keep only the dedupe the real events need.
6. **Behaviour to expect:** ice breakers appear only in a new or empty conversation, and changes can take time to show. Test with a phone, not desktop.

### Phase 7: Staff replies actually send (closes D4)

1. `human-reply` must send through the Graph client, not just save text. Compute the window from the lead's `last_user_message_at`.
   - Within 24 hours: normal message (`messaging_type RESPONSE`).
   - From 24 hours to 7 days: only if the **Human Agent** feature is approved: `messaging_type MESSAGE_TAG` with tag `HUMAN_AGENT` [VERIFY the exact Instagram request]. Meta states the tag lets a business representative manually respond within 7 days, and tagged messages may **not** contain promotions. The bot must never use it.
   - Older than 7 days: refuse with a clear message to the staff member.
2. Record `human_reply`, the staff user, status `human_replied`, and the sent message ID in `outbound_messages`. Pause the bot for that lead.
3. Show the window state per lead in the dashboard: green under 24 hours, amber 24 hours to 7 days (needs Human Agent), red closed.

### Phase 8: Compliance and ownership (closes S8, S9, W8)

1. **Rewrite `/privacy`** with the shop's details: Dhera Singh Jewellers, Adalat Bazaar, near AC Market, Patiala; email dherasinghjewellers@gmail.com; hours 10:00 to 21:00; grievance officer Angad Singh. Cover: data collected (Instagram ID, username, name, phone, messages, products asked about), purpose, AI processing by Anthropic, hosting by Vercel and Supabase, retention, rights under India's Digital Personal Data Protection Act 2023, how to delete (send DELETE in chat or email), response time, no sale of data, children under 18, grievance contact. Remove the vendor's email. Still needed from the owner: phone number, closed days, retention period, PIN code, governing-law city.
2. **Add `/terms` and `/data-deletion`** as public pages (excluded from the login proxy).
3. **Meta App settings > Basic:** Privacy Policy URL, Terms URL, User data deletion (instructions URL pointing to `/data-deletion`), contact email, 1024x1024 icon, category.
4. **Compliance track (parallel, after Phases 1-3):** Business Verification, then Live mode, then request Advanced Access for `instagram_manage_messages`, `instagram_manage_comments`, `pages_messaging` and the Human Agent feature. Screencasts must show the working, secured flow; for Human Agent show a staff member typing a reply in the dashboard.
5. **Ownership.** Transfer the repo, Vercel project (move to a plan that permits commercial use; Vercel's Hobby plan is meant for personal, non-commercial use [VERIFY]), Supabase project and Meta app admin role to shop-owned accounts; keep the vendor as collaborator.

### Phase 9: Clean-up

Update README (environment variables, architecture, auth, runbook for rotating tokens), keep `CHANGELOG.md` current, decide the fate of `recent_replies`, and let the owner shut down the unused Railway app.

---

## 7. Data model changes (additive only)

| Table | Change |
|---|---|
| `products` | add `label text`, `display_order int default 0`, `reel_code text` (indexed), `is_combo boolean default false` |
| `conversations` | add `message_id text`, `context text` (story_reply, story_mention, icebreaker, comment, dm), `error_info text`, `handled_by uuid null`; index on (`sender_id`, `created_at`) |
| `leads` (new) | `id uuid pk`, `platform text`, `platform_user_id text`, `username text`, `instagram_name text`, `name text`, `phone_e164 text`, `phone_raw text`, `phone_consent_at timestamptz`, `phone_consent_version text`, `phone_source text`, `capture_stage text default 'none'`, `asks_count int default 0`, `last_ask_at timestamptz`, `city text`, `occasion text`, `budget text`, `contact_status text default 'new'`, `assigned_to uuid null`, `notes text`, `needs_human boolean default false`, `bot_paused_until timestamptz`, `entry_point text`, `source_reel_code text`, `first_seen_at`, `last_seen_at`, `last_user_message_at`; unique (`platform`, `platform_user_id`) |
| `lead_interests` (new) | `id`, `lead_id`, `reel_code`, `product_id uuid`, `source text`, `shown_at`, `selected_at null` |
| `reel_context` (new) | `id`, `platform`, `sender_id` (IGSID), `comment_id null`, `reel_code`, `product_ids jsonb`, `page int default 0`, `shown_at`, `expires_at`; index (`platform`, `sender_id`, `shown_at` desc) |
| `outbound_messages` (new) | `message_id pk`, `platform`, `recipient_id`, `kind` (bot, human, private_reply), `created_at` |
| `staff_profiles` (new) | `user_id uuid pk` (auth user), `display_name`, `role` (admin or agent), `active boolean` |
| `admin_config` keys | `bot_enabled`, `comment_reply_mode`, `reply_show_weight`, `reply_show_making`, `token_status`, `ice_breakers_hash` |

RLS: enable on every new table with **no** anonymous policy; server code uses the service-role client. `city`, `occasion`, `budget` are optional fields the owner may fill by hand; do not ask for them in chat unless the owner enables it.

---

## 8. Meta API reference (route A and route B)

Version `v25.0` is shown; read it from configuration. Route A = Page token on `graph.facebook.com`. Route B = Instagram User token on `graph.instagram.com`. Always use `Authorization: Bearer <token>`.

| Purpose | Route A | Route B |
|---|---|---|
| Inspect token | `GET /debug_token?input_token=<T>&access_token=<APP_ID>\|<APP_SECRET>` | `GET /me?fields=user_id,username` (a valid token returns the account; also run `debug_token` on `graph.facebook.com`) |
| Find Instagram account | `GET /{PAGE_ID}?fields=name,instagram_business_account{id,username}` | `GET /me?fields=user_id,username` |
| List account subscription | `GET /{PAGE_ID}/subscribed_apps` | `GET /me/subscribed_apps` |
| Subscribe account | `POST /{PAGE_ID}/subscribed_apps?subscribed_fields=messages,messaging_postbacks` (comments are enabled through the app-level Instagram object) | `POST /me/subscribed_apps?subscribed_fields=comments,messages,messaging_postbacks` |
| Send DM | `POST /{PAGE_ID}/messages` body: `recipient {id: IGSID}`, `messaging_type RESPONSE`, `message {text}` | `POST /{IG_ID}/messages`, same body |
| Private reply | `POST /{PAGE_ID}/messages` body: `recipient {comment_id}`, `message {text}`; response has `recipient_id` and `message_id` | `POST /me/messages`, same body |
| Public comment reply | `POST /{COMMENT_ID}/replies` body `message` | same |
| Resolve media permalink | `GET /{MEDIA_ID}?fields=permalink` | same on `graph.instagram.com` |
| Set ice breakers | `POST /me/messenger_profile?platform=instagram` body: `platform instagram`, `ice_breakers [{call_to_actions [{question, payload}] (max 4), locale default}]` | `POST /{IG_ID}/messenger_profile`, same body |
| Read / delete ice breakers | `GET /me/messenger_profile?fields=ice_breakers&platform=instagram`; `DELETE` with `fields: ["ice_breakers"]` | same on `graph.instagram.com` |
| Customer name | `GET /{IGSID}?fields=name,username` | same |
| Manual reply 24 h to 7 days | send with `messaging_type MESSAGE_TAG` and `tag HUMAN_AGENT` [VERIFY] | same [VERIFY] |
| Handover (Option 2 only) | `POST /{PAGE_ID}/pass_thread_control`, `take_thread_control` (Primary only), `GET /{PAGE_ID}/thread_owner?recipient=<IGSID>` | use Instagram's handover endpoints [VERIFY] |

**Error codes to handle:** 10 permissions, 100 invalid parameter, 190 token expired or revoked, 551 person unavailable, 613 rate limit, 1545041 messaging window closed.

---

## 9. Acceptance tests

Run each on a Vercel preview with a tester Instagram account first, then on production.

**Phase 1 (security)**
1. Anonymous request to `/` redirects to `/login`; anonymous call to every `/api/*` admin route returns 401.
2. A signed-in **agent** cannot call `update-prices`, `add-product`, `add-context`, or CSV export (403).
3. `/api/test` returns 404. The old admin key string is absent from built client files.
4. The webhook handshake and `/privacy` still work without a cookie.

**Phase 2 (webhook and tokens)**
5. Handshake with the right verify token echoes the challenge; wrong token returns 403.
6. In observe mode, the log shows which secret matched for real Meta POSTs; in enforce mode a POST with a bad signature gets 401 and nothing is processed.
7. A real DM produces exactly one processing run (no duplicate from retries or double subscription).
8. The bot's own sent messages (echoes) and the shop's own comments never trigger a reply.
9. Forcing an invalid token sets `token_status = invalid` and the dashboard banner appears; restoring it clears the banner.
10. Logs contain no message text, no tokens, no signatures.

**Phase 3 (DMs)**
11. A tester's text DM gets a reply in the same language and script; the first reply of the day mentions the automated assistant.
12. A story reply, a story mention and a shared reel each get the correct handling and are stored with `context`.
13. An image or voice note gets the polite typed-reply request.
14. Rapid messages within 3 seconds produce one reply.
15. Escalation sets `needs_human`, pauses the bot, and the bot stays silent until resumed or after 12 hours.
16. With `bot_enabled = false`, events are stored and nothing is sent.

**Phase 4 (products)**
17. A reel with three products: one comment produces **one** DM listing all three with correct label, weight, purity, price; no second message is sent.
18. If the DM send fails, no "check your DM" public reply is posted and a `send_failed` row exists.
19. Replying `2` returns product 2's details; `all` returns every product; `more` pages correctly when the list exceeds 900 bytes.
20. A product without a price shows "price on request" and the lead is flagged.
21. The same person commenting twice on the same reel within 24 hours gets one reply.
22. A DM after a comment-to-DM reply keeps the reel context (no request for the link).
23. An unknown purity is rejected in the add-product form.
24. A one-product reel still works as before and matches the dashboard price.

**Phase 5 (leads)**
25. First contact creates one lead; a second contact updates it (no duplicates).
26. "Rahul 98765 43210" fills name and phone; the number is stored as `+919876543210` with consent time, version and source.
27. The number never appears in `conversations` or in the text sent to Claude.
28. "No" to the phone ask stops further asks for 30 days; the callback ice breaker restarts them.
29. DELETE removes the lead, interests, context and conversations for that sender and confirms.
30. The Leads tab shows products asked (names), filters work, and the CSV opens in Excel with Hindi and Punjabi text intact.

**Phase 6 (ice breakers)**
31. Syncing creates exactly four questions; reading them back matches the constants.
32. On a phone, a new conversation shows the four questions; each tap returns the right deterministic answer with zero Claude tokens.
33. One tap produces one reply (the tap lock works whichever events Meta sends).
34. The gold-rate answer equals the current `metal_prices` rows and shows the update date.

**Phase 7-8**
35. A staff reply at hour 5 arrives in the customer's DM; at hour 30 it is refused unless Human Agent is approved; at day 8 it is refused.
36. `/privacy`, `/terms`, `/data-deletion` are public, show the shop's details and no vendor email.

---

## 10. Rollout and rollback

1. Phase 1 to production first (hotfix), alone.
2. Phases 2 and 3 on a preview, then production in **observe** mode for signatures; move to **enforce** after 48 hours of clean logs.
3. Phase 4 and 5 behind `admin_config` flags where practical (`comment_reply_mode`, `reply_show_weight`), so a bad deploy can be softened without a code change.
4. Phase 6 ice breakers are created last; deleting them is one call.
5. Rollback: every migration is additive, so rolling back code never needs a database rollback. Keep the previous Vercel deployment promotable. Never roll back Phase 1.

---

## 11. Decisions needed from the owner (defaults in brackets)

1. Handover: Option 1, no Meta handover [recommended] or Option 2, Page Inbox.
2. Should the first message show weight? [yes] Making charges? [no]
3. Do some reels sell a set at one price? [yes, use a combo row]
4. Reply to every text comment or only question-like ones? [every text comment, with a 24-hour cooldown per person per reel]
5. Ice-breaker wording and whether to add Hindi and Punjabi versions.
6. Staff logins: names, emails, which are admins and which agents.
7. Retention period for leads [12 months], shop phone number, closed days, PIN code, governing-law city [Patiala].
8. Silver rate in the gold-rate answer? [no]
9. Who becomes owner of GitHub, Vercel, Supabase and the Meta app admin role?

---

## 12. References (Meta and Next.js)

- Setup Webhooks Subscriptions (components table, Live and Advanced Access requirements, subscribed_apps, signatures, retries): developers.facebook.com/documentation/instagram-platform/webhooks
- Webhooks for Instagram Messaging (fields, payload examples, story replies, echoes, standby): developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks
- Instagram Platform Webhook Notification Examples (comments, messages, postbacks, attachment types): developers.facebook.com/documentation/instagram-platform/webhooks/examples
- Private Replies (one message, 7 days, Page ID endpoint, Requests folder): developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies
- Ice Breakers, Instagram Login version (4 questions, endpoints, postback payload): developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/ice-breakers
- Ice Breakers, Facebook Login version (`me/messenger_profile?platform=instagram`, default locale required): developers.facebook.com/documentation/business-messaging/instagram-messaging/features/ice-breakers
- Send a Message (24-hour window, tags, Human Agent, error codes, automated-experience disclosure): developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages
- Handover Protocol (Primary and Secondary Receivers, standby, take and pass thread control): developers.facebook.com/docs/messenger-platform/handover-protocol
- User Profile API: developers.facebook.com/documentation/business-messaging/instagram-messaging/features/user-profile
- Messenger Platform and IG Messaging API Policy: developers.facebook.com/docs/messenger-platform/policy/policy-overview
- App Review for Instagram: developers.facebook.com/documentation/instagram-platform/app-review
- Next.js Proxy (formerly Middleware): nextjs.org/docs/app/getting-started/proxy and the repo's own `node_modules/next/dist/docs/`

---

*End of guide. WhatsApp setup (adding the product to the Meta app, the number choice, and the WhatsApp handler) follows in a separate guide.*
