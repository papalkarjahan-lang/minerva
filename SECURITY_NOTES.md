# Minerva — Security Model & Known Tradeoffs

Read this before onboarding your first real client. It explains what protects
customer data today, what doesn't, and when to fix it.

## The model: unguessable links, not logins

Minerva has zero login screens by design — that's core to the "20-minute
setup on a screen share" pitch. Access to a business's data is controlled
entirely by possession of an unguessable URL or PIN:

- **Dispatcher board** (`/dispatch/:businessId`) — businessId is a random
  UUIDv4 (122 bits of randomness, not sequential, not guessable by brute force)
- **Client tracking link** (`/track/:jobId`) — same, a random UUIDv4. Now
  also carries the Client Self-Serve Rebooking Loop button (shown once the
  job is complete) — this only lets the link-holder write a new `leads`
  row for themselves (name/phone/suburb are pre-filled from that job, not
  freely editable), it doesn't grant any read access beyond what the link
  already had.
- **Dispute Pack link** (`/dispute/:jobId`, bonus feature) — same trust
  tier as the tracking link: a random UUIDv4, read-only, no login. Whoever
  holds it can see that job's GPS route, checklist photos, materials used,
  and invoice. Same rule as everywhere else in this doc — hand it to
  whoever the dispute is with directly, don't post it publicly.
- **Technician setup link** (`/tech?pin=...`) — an 8-character random
  alphanumeric PIN (~1e12 combinations)
- **Calendar feed link** (`/functions/v1/calendar-feed?businessId=...`) —
  same random UUIDv4 as the dispatcher board. Anyone with it can see that
  business's job schedule (client names, addresses, times). Same rule as
  above: never post it publicly, hand it to the business owner privately.
- **Slack webhook URL** (`businesses.slack_webhook_url`) — not one of our
  links, but the same trust tier: it's a secret the business owner pastes
  in from their own Slack workspace (Settings modal). Anyone who obtains
  it can post arbitrary messages to that business's Slack channel. It's
  scoped to one workspace only (not a Minerva-wide credential). Like every
  other field on the `businesses` row, it's readable by anyone with the
  dispatch link (same anon-select-all RLS policy) and pre-fills the
  Settings modal input when reopened — so it inherits the dispatch link's
  trust boundary rather than adding a new one.

- **Inventory items / checklist templates (incl. onboarding)** — same rule
  again: `inventory_items` (stock levels, supplier names) and
  `checklist_templates` (both `type='completion'` and `type='onboarding'`)
  use the same anon-select/insert/update-all RLS policy pattern as every
  other business-scoped table. Nothing new here, just confirming the
  Supply & Inventory and Human Coordination pillars don't introduce a
  different trust boundary than the rest of the app.
- **`technician_credentials`** (licence/ticket expiry dates + optional
  document photo/PDF) and the **`credential-documents`** storage bucket —
  same anon-select/insert/update/delete pattern as every other
  business-scoped table/bucket in this app. Anyone with the dispatch link
  can see a technician's licence numbers and expiry dates and any uploaded
  document; no new trust boundary, just more of the same one.
- **`weather_reschedule_drafts`** — same pattern again: readable/writable
  by anyone with the dispatch link. These rows only ever hold a job
  reference and a forecast summary, no new PII.
- **`invoices.referral_code`** / **`leads.referred_by_code`** — a 6-character
  code, not a secret in the security sense (it's designed to be shared by
  the client themselves), but note it's scoped per-business at the
  matching step in `ai-intake-chat` — a code from Business A's invoice can
  never mark a lead as referred at Business B.
- **Meta access token** (`businesses.meta_access_token`) — same trust tier
  as `slack_webhook_url`: a secret the business owner pastes in from their
  own Meta Business account (Settings modal), readable by anyone with the
  dispatch link. Anyone who obtains it can spend from that business's own
  ad account, but **not** from any other business's account or a shared
  Minerva account — Minerva never holds a master ad credential, only ever
  stores and uses each business's own token. `marketing_drafts.recipients`
  (phone numbers for win-back SMS) follows the same rule as every other
  client PII on this app.

## Track A / Track B — new trust-boundary notes

- **`custom_workflows.action_target`** (webhook URL) — when
  `action_type='webhook'`, `run-custom-workflows` POSTs the trigger payload
  to whatever URL is stored on that row, with no allowlist. This is
  intentional (that's the point of a general-purpose automation agent) but
  means: (1) anyone with the dispatch link can create a workflow that
  exfiltrates lead/job/invoice payload data to an arbitrary URL — same trust
  tier as the dispatch link itself, nothing new added, but worth naming
  explicitly since it's an active data-egress path rather than a passive
  read; (2) `run-custom-workflows` does not validate the target URL is
  reachable/safe (no SSRF protection against internal/private IP ranges) —
  acceptable for a small number of trusted pilot clients pasting their own
  webhook URLs, revisit before opening this to self-serve signups.
- **Fixed 2026-09-02: `harvest-industrial-leads` and `monitor-asset-telemetry`
  now validate a per-business shared secret.** Both are still deployed with
  `--no-verify-jwt` (same reasoning as `stripe-webhook` / `missed-call-webhook`)
  so an external ingestion source can call them without a Supabase auth
  header, but each request must now also send an `X-Ingestion-Key` header
  matching that business's `businesses.ingestion_key` value (a random UUID,
  auto-generated on the column via `supabase_schema_delta_industrial.sql`).
  A request with a missing or wrong key gets a 401 before any row is
  written. This closes the previously-documented gap where anyone who
  discovered the URL could insert leads or asset telemetry for any
  `businessId`/`assetId` they guessed or already knew — that write path no
  longer relies solely on the UUID being unguessable. No UI to view/rotate
  the key exists yet (it's a plain column, readable via the same anon
  `businesses` select as everything else) — a real vendor integration
  should read it via the dashboard/DB directly for now, and rotating it is
  a manual `update businesses set ingestion_key = gen_random_uuid()::text
  where id = '...'`.
- **Industrial sector tables** (`industrial_leads`, `industrial_assets`,
  `site_projects`, `site_checkins`, `safety_incidents`,
  `consumables_items`, `client_verification_packages`) use the same
  anon-select/insert/update-all RLS pattern as every trade-sector table —
  no new trust boundary, just more tables inheriting the existing one.
  `businesses.sector` and `businesses.feature_priorities` are likewise
  plain columns on the already-anon-readable `businesses` row.

## Growth pillar — why spend/send is click-only, never autonomous

`generate-growth-drafts` runs weekly and fully autonomously, but it only
ever **writes** rows to `marketing_drafts` with `status='pending'` — it
cannot spend money or send a message by itself. Turning a pending draft
into a real ad campaign (`launch-ad-campaign`) or an outbound SMS
(`send-growth-message`) requires a synchronous, in-the-moment click from
the business owner on the Marketing tab. Both of those functions are
deliberately **not** wired into `pg_cron` or any other automated trigger —
they exist only as callable endpoints a human hits via "Approve." This is
the one pillar where the product intentionally keeps a human in the loop
on every dollar spent and every message sent, even though the copywriting
and targeting analysis that leads up to that click is fully automated.

This means: **anyone who has the link has full access to that business's
dispatch board** (see every client's name/phone/address, every technician's
live GPS position, and can add/reassign jobs). There is no password behind
it. This is a deliberate, documented tradeoff for a fast-moving MVP with a
small number of trusted pilot clients — not an accident, but also not
appropriate to scale indefinitely without revisiting.

**What this means practically for you, day to day:**
- Never post a dispatch or tracking link anywhere public (social media, a
  public support ticket, etc.)
- Send the dispatch link to the business owner privately (e.g. in the
  onboarding email/SMS), the same way you'd hand over a admin password
- If a client asks "can anyone see my technicians' locations?" — the honest
  answer is "only someone with your specific dispatch link," which is true
  as long as the link itself is treated as a secret

## What's already fixed

- Removed a policy that would have granted **any authenticated Supabase
  user** (including someone who self-registers a free account) full
  read/write access to *every* business's data, not just their own. Nothing
  in the app uses Supabase Auth sessions, so this was pure unused attack
  surface — it's been removed entirely rather than scoped.
- Technician PINs upgraded from 6-digit numeric (900,000 combinations, no
  rate limiting) to 8-character alphanumeric (~1e12 combinations).
- Business owner login (`/login`, magic-link email via Supabase Auth) +
  `businesses.owner_user_id`, gating `/dispatch/:businessId` and
  `/industrial/:businessId` behind an actual authenticated session for the
  first time (`supabase_schema_delta_owner_auth.sql`, `RequireBusinessAuth.jsx`).
- **RLS read-scoping, pass 1** (`supabase_schema_delta_rls_scoping_v1.sql`,
  2026-09-05): audited every `.from(...)` call in the codebase to find
  tables read *exclusively* by the now-auth-gated DispatcherView, with no
  anonymous technician/public/background-agent reader to break. Found
  four: `assets`, `subcontractors`, `technician_incidents`,
  `upsell_nudge_dismissals` — SELECT on these now requires
  `auth.uid() = businesses.owner_user_id` for that row's business, closing
  the "anyone with the dispatch link can also just query the table
  directly" gap for these specific tables. Also added a staff-only
  `admin_users` table and scoped `support_requests` SELECT to it (was
  previously anon-select-all, meaning any anon-key holder could read every
  business's support tickets and contact details — now admin-only).
  INSERT/UPDATE/DELETE on all five tables are untouched (still open) —
  this pass is SELECT-only, deliberately. See that SQL file's header
  comment for the full reasoning on why most other tables in this schema
  can't be scoped the same way yet (technician PIN sessions and ~45
  background agent edge functions run on the anon key with no
  `auth.uid()`, and legitimately need cross-business or unauthenticated
  reads to work).

## Day-1 setup step (do this once, in Supabase Dashboard)

Go to **Authentication → Providers** and turn **off** "Allow new users to
sign up." This closes off the authenticated-role attack surface completely,
as a belt-and-suspenders measure, in case any future policy accidentally
reintroduces `auth.role() = 'authenticated'` access.

## Why full row-level tenant isolation isn't implemented yet

Supabase Realtime (used for the live GPS map) checks each subscriber against
your RLS SELECT policy before delivering a change event. Since there's no
login, the app runs entirely on the `anon` key — so RLS can't distinguish
"business A's dispatcher" from "a stranger," and can't be scoped tighter
than "you need to already know the row's id" without breaking the live map
entirely. This is a real constraint of the anon-key + no-login + Realtime
combination, not an oversight.

## Fixed: missed-call-webhook now validates Twilio's signature

`missed-call-webhook` is deployed with `--no-verify-jwt` (like
`stripe-webhook`) so Twilio's servers can call it without a Supabase auth
header. It now validates the `X-Twilio-Signature` request header before
doing anything else (HMAC-SHA1 over the request URL + sorted POST params,
keyed with `TWILIO_AUTH_TOKEN`, base64-compared against the header) —
mirroring how `stripe-webhook` validates `stripe-signature`. Requests that
fail validation (missing/forged signature) get a `403` before the function
reads any business data or sends any SMS. No action needed — this closes the
gap previously documented here; no config change required beyond the
`TWILIO_AUTH_TOKEN` secret that was already a Day-1 setup step.

## Agent Operating System Phase 1: agent_functions / agent_insights

Both new tables (`supabase_schema_delta_agent_infra.sql`) inherit the exact
same permissive-anon-RLS pattern as every other table in this schema — no
new trust boundary is introduced. Worth calling out specifically:
`agent_insights` could theoretically let any anon caller read cross-business
operational patterns (which functions are erroring, staleness, etc.) since
`business_id` is nullable and rows aren't scoped per-caller — but this is
the same class of risk already accepted project-wide (see "The model:
unguessable links, not logins" above), not a new one. **Update 2026-09-03:
the kill-switch flag on `agent_functions` (`enabled`) IS now read** — all 11
gated edge functions check `agent_functions.enabled === false` on entry and
skip early if disabled (verified via code audit). Practical implication:
anyone with a dispatch link who discovers `?agents=1` could disable another
business's automated agents (e.g. `chase-unpaid-invoices`) via the toggle in
the Agent Ops tab, since these rows aren't `business_id`-scoped — same
"anon key = full access" tradeoff as everywhere else in this doc, not a new
boundary, but worth naming now that the toggle actually does something.

**Phase 5 note**: the new read-only Agents tab in `DispatcherView.jsx`
surfaces this same already-anon-readable data (plus `agent_council_reports`,
also anon-select-all, also not `business_id`-scoped) in the UI for the
first time. Since the RLS layer was already wide open, gating at the RLS
level would have added nothing — instead the tab itself is gated behind an
explicit `?agents=1` URL param, so it doesn't render (and isn't discoverable)
in a regular business owner's dispatch link by default. This is a UX/product
decision, not a new security boundary — anyone who already knows to query
`agent_functions`/`agent_insights`/`agent_council_reports` directly via the
anon key has always been able to read them, `?agents=1` just stops a normal
business owner from stumbling into cross-tenant operational data inside
their own console. See README.md "Agent Operating System — Phase 5" for the
full reasoning.

## Phase 2 priority: before scaling past ~10-15 trusted pilot clients

Real per-owner authentication now exists (`/login`, see "What's already
fixed" above) and RLS read-scoping pass 1 has landed on the handful of
tables where it was safe to do without breaking anything. What's still
open, and still the right thing to budget before any enterprise client or
any client with sensitive commercial data:

- **The big one**: most tables (`jobs`, `technicians`, `leads`, `invoices`,
  `technician_locations`, `checklist_templates`, `inventory_items`,
  `technician_credentials`, `marketing_drafts`, all `industrial_*` tables,
  etc.) still can't be scoped to `auth.uid()` because technicians
  authenticate via PIN (no Supabase auth session at all) and ~45
  background agent edge functions run on the `anon` key and need
  cross-business reads by design. Closing this gap means either giving
  technicians a real auth session tied to their PIN, or moving background
  agents to `service_role` + scoping their queries in application code
  instead of relying on RLS — a genuine project, not a SQL delta.
- `businesses` itself is still anon-select-all (any anon-key holder can
  list every business's name/contact/tier) — same reason: too many
  legitimate anonymous readers (public intake widget, post-checkout
  success page, onboarding, background agents) to scope without breaking
  them.
- Supabase Realtime (the live GPS map) still checks subscribers against
  the SELECT policy on `technician_locations`, which is why that table in
  particular can't be tightened without also solving the technician-auth
  problem above — see the original note this replaced, still accurate.
