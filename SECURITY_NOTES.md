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
  - **Fixed 2026-09-05**: this field (and `meta_access_token`) was
    previously *also* reachable through the four client-facing, no-login
    pages — `TrackingView.jsx`, `InvoiceView.jsx`, `DisputeView.jsx`, and
    `QuoteView.jsx` all fetched the full `businesses(*)` row (only ever
    displaying `.name`) alongside the job/invoice/quote data those pages
    exist to show. That widened the trust boundary from "anyone with the
    *dispatch* link" (staff) to "anyone with a *client* tracking/invoice/
    quote/dispute link" (any external customer), which was never the
    intent. All four now select `businesses(name)` only.

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

## Added 2026-09-10: outreach engine — Minerva's own sales pipeline, same click-only rule

`outreach_prospects` is Minerva's own client-acquisition pipeline (not a
client's leads — see `supabase_schema_delta_outreach_engine.sql`). Same
non-negotiable boundary as the Growth pillar above, applied to Minerva's
own outbound: `draft-outreach-batch` and `followup-outreach` fully
automate writing personalized emails and follow-ups, but only ever write
`status='drafted'` rows. `send-outreach-batch` is the ONLY function that
calls `send-email` for a prospect, and it hard-filters to
`status='approved'` server-side — a bug in the admin console UI cannot
cause an unreviewed email to go out, because the function itself
re-enforces the filter regardless of what it's asked to send. No RLS
anon/authenticated policy grants access beyond `admin_users` (mirrors
`support_requests`' scoping) — every write outside the admin console goes
through an edge function using `SUPABASE_SERVICE_ROLE_KEY`.

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

  **Regression found and fixed 2026-09-07**: the "read exclusively from
  DispatcherView" claim for `subcontractors` turned out to be wrong —
  `auto-assign-technician`'s subcontractor-fallback dispatch code (added in
  a later commit, after this pass shipped) also does a plain anon-key
  `SELECT` on this table. Since no anon SELECT policy was left on
  `subcontractors`, RLS default-denied every one of those reads, silently
  returning zero rows — meaning subcontractor-pool fallback dispatch has
  been non-functional (never suggests/assigns a subcontractor even when
  one is genuinely free and the add-on is active) since this pass went
  live, with no error anywhere to surface it. Fixed via
  `supabase_schema_delta_subcontractors_select_fix.sql` — restores an open
  anon SELECT policy on `subcontractors`. This doesn't reduce security
  below what already existed: INSERT/UPDATE/DELETE on this table were
  already fully anon-open the whole time, so an anon caller could already
  read data back via a write's return value regardless. Lesson for future
  scoping passes: re-check "read exclusively by X" claims after any later
  commit touches the same table, not just at audit time.

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

## Known: react-router-dom CVE-2025-68470 (moderate, not exploitable here)

`npm audit` flags `react-router-dom@6.30.6` for two advisories: an open
redirect via backslash in `<Link>`/`useNavigate` when the target is
user-controlled, and an arbitrary-constructor-injection bug in SSR
hydration. Neither applies to this app: there is no SSR (plain Vite SPA),
and the only `useNavigate()` call in the whole codebase
(`TrackingView.jsx`, after a successful rebooking submission) navigates to
a server-generated token (`/client/${data.token}`), never to a
user-supplied string. The fix requires a v6→v7 major upgrade (breaking
router API changes) — not worth the regression risk to close a vector this
app doesn't have. Revisit if a future feature ever calls `navigate()` or
renders `<Link to=...>` with a user-supplied path.

## Fixed 2026-09-08: xero-oauth-connect forged-callback CSRF

`xero-oauth-connect` previously accepted any `businessId` query param with
no ownership check at all — a raw public Edge Function URL, so the
client-side `RequireBusinessAuth.jsx` route guard never protected it.
Anyone who knew or guessed a `businessId` could hit the URL directly with
their own Xero account and link their own Xero org's credentials to a
victim business, letting that attacker's `xero-sync-invoice` calls read/
receive that business's invoice data. Now requires a real Supabase Auth
`Authorization: Bearer <token>` proving the caller owns (or auto-claims,
same rule as `RequireBusinessAuth.jsx`) the target business before
returning the Xero authorize URL — enforced server-side in the function
itself, not just in the React route. `DispatcherView.jsx`'s "Connect Xero"
control changed from a static unauthenticated `<a href>` to a fetch call
carrying the session token, since a redirect-only flow can't attach a
header.

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

## Fixed 2026-09-14: RLS read/write-scoping, pass 2

All 52 background edge functions migrated from `SUPABASE_ANON_KEY` to
`SUPABASE_SERVICE_ROLE_KEY` (server-side only, never exposed to a
browser — this changes nothing observable, since none of them relied on
RLS to restrict their own already-fully-trusted cross-business behavior).
That unblocked two real, previously-open gaps documented above under
"Phase 2 priority" and "Agent Operating System Phase 1":

- **`agent_functions` / `agent_insights` / `agent_council_reports`**
  (Minerva's own platform-wide operator data — `agent_functions` has no
  `business_id` column at all) are no longer anon-select/anon-update.
  Previously, anyone with the anon key — extractable from the live site
  by anyone, not just a business owner — could read every function's
  health status and cross-business insights, and could flip any
  function's `enabled` kill-switch off **for the entire platform**, not
  just their own business, since the DispatcherView "Agent Ops" tab's
  `?agents=1` gate was UX-only, not a security boundary (as its own code
  comment already said). Now requires the caller to be a real logged-in
  Supabase Auth user present in `admin_users` — see pass 1's header for
  how to add one. See `supabase_schema_delta_rls_scoping_v2.sql`.
- **`marketing_drafts`** (confirmed by grep to have zero technician/
  public reader, only the owner-authed DispatcherView Growth tab) is now
  scoped to `auth.uid() = businesses.owner_user_id` for SELECT/UPDATE,
  same pattern as pass 1's `assets`/`subcontractors`.

Still open after pass 2: `jobs`, `technicians`, `leads`, `invoices`,
`technician_locations`, `checklist_templates`, `checklist_photos`,
`job_materials`, `inventory_items`, `technician_credentials`,
`businesses`, `roi_proposals`, all `industrial_*` tables. Each has a
genuine anonymous technician (PIN, no `auth.uid()`) or public client-
facing reader (tracking/invoice/quote/dispute/proposal links) that would
break if scoped today. Closing that gap needs a real technician auth
session tied to their PIN — a separate, larger, scoped project (frontend
+ schema + every technician-facing edge function), deliberately not
attempted blind alongside this pass.

## Fixed 2026-09-14: real technician authentication + RLS write-scoping, pass 3

The blocker called out immediately above — "technicians authenticate via
PIN (no Supabase auth session at all)" — is now fixed, which unblocks
write-scoping (not read-scoping, see below) on the technician-facing
tables that pass 1/2 had to leave open.

**What changed:**
- `technicians.auth_user_id` (nullable uuid, FK to `auth.users`) — added
  by `supabase_schema_delta_technician_auth_v1.sql`.
- New edge function `technician-login`: takes the same PIN the technician
  has always used, looks up their `technicians` row (service_role), and —
  on first-ever login — creates a synthetic Supabase Auth user for them
  (`tech-<technician.id>@technicians.minerva.internal`, `email_confirm:
  true`, never a real inbox, never emailed anywhere) and links its id back
  onto `auth_user_id`. Every login (first or subsequent) then calls
  `admin.generateLink({type: 'magiclink'})` and hands the resulting
  `token_hash` back over HTTPS — no email is ever sent, since the address
  can't receive one anyway. `TechnicianView.jsx` calls this once on mount,
  then `supabase.auth.verifyOtp({token_hash, type: 'magiclink'})` client-
  side to mint the actual session. **The PIN itself hasn't changed at
  all** — same SMS link, same `?pin=...` UX, same no-password flow. The
  PIN is now a one-time exchange credential instead of being the entire
  security model; `auth.uid()` exists for every request after that first
  exchange, same as `owner_user_id` has always existed for dispatcher
  sessions.
- `supabase_schema_delta_technician_auth_rls_v1.sql`: WRITE policies
  (INSERT/UPDATE/DELETE) on `technicians`, `jobs`, `technician_locations`,
  `invoices`, `checklist_photos`, `job_materials`, `technician_credentials`,
  `technician_incidents`, `job_assignments`, and `inventory_items` are no
  longer `anon ... using (true)`. Each now requires either the business
  owner (`auth.uid() = businesses.owner_user_id`) or the authenticated
  technician actually on that job/row (`auth.uid() = technicians.auth_user_id`,
  joined through `jobs.technician_id` or `job_assignments`). Before this,
  literally anyone with the anon key — extractable from any browser's JS
  bundle by anyone, not just a real technician — could forge checklist
  photos/materials/invoices for jobs that were never theirs, move any
  technician's live GPS pin, deactivate any technician on the platform, or
  drain arbitrary inventory, across every business, not just one.

**Deliberately NOT touched — SELECT stays anon `using (true)` on most of
these tables**, because `TrackingView.jsx`/`DisputeView.jsx`/`InvoiceView.jsx`
(the public, no-login client-facing pages) read `technicians`, `jobs`,
`technician_locations`, `invoices`, `checklist_photos`, and `job_materials`
by bare unguessable id with no auth of any kind — narrowing SELECT there
would break those real features, not just tighten a gap, and none of them
have (or should have) a login. Confirmed by grep of all three files before
deciding this, not assumed. `technician_credentials`, `job_assignments`,
and `inventory_items` are NOT read by any of those three pages, so their
SELECT was scoped down too (owner or the technician themselves).

## Fixed 2026-09-14: RLS read/write-scoping, pass 4

Closed the "still open" list right above, now that technician auth
(pass 3) exists to lean on. Confirmed every call site by grep before
writing `supabase_schema_delta_rls_scoping_v3.sql` — nothing assumed.

- **`checklist_templates`**: SELECT was anon `using (true))`; now
  owner-or-technician (business-scoped — this table has no job_id, so
  it's checked against `technicians.business_id`, not a specific job).
  INSERT/UPDATE (DispatcherView's checklist setup) are owner-only.
  Technician reads now run under the real session from pass 3, not a
  bare PIN match — confirmed the technician-side fetch in
  `TechnicianView.jsx` happens after `verifyOtp()`, so `auth.uid()` is
  already present by the time it runs.
- **`leads`**: SELECT/UPDATE were anon `using (true)`; now owner-only
  (DispatcherView is the only browser reader/writer of either). INSERT
  stays anon — `TrackingView.jsx`'s client-rebooking flow
  (unguessable job-id link, no login) is a real, intentional public
  writer, same reasoning as `checklist_photos`/`invoices` in pass 3.
- **`businesses`**: UPDATE was anon `using (true)` (a prior fix,
  `businesses_update_policy.sql`, to unblock owner/admin features that
  were silently no-op'ing). Now: `owner_user_id = auth.uid()`, OR a
  one-time claim (`owner_user_id is null` and the logged-in user's JWT
  email matches `contact_email` — this is `RequireBusinessAuth.jsx`'s
  existing pilot-business auto-claim, now enforced instead of merely
  trusted), OR `admin_users` membership (AdminConsole's tier override,
  same pattern as `agent_functions` in pass 2). SELECT/INSERT
  deliberately untouched — `IntakeAssistant.jsx`/`SuccessPage.jsx` read a
  business by unguessable id pre-login, `Onboarding.jsx` inserts one at
  signup pre-login. Every edge function that writes `businesses` already
  used service_role, so this changes nothing for background jobs.
- **8 `industrial_*` tables** (`industrial_assets`,
  `asset_telemetry_events`, `industrial_leads`, `site_projects`,
  `site_checkins`, `safety_incidents`, `consumables_items`,
  `client_verification_packages`): each had one blanket
  `anon all ... using (true) with check (true)` policy. Confirmed by
  grep that `IndustrialDispatcherView.jsx` (owner-authenticated, same
  `RequireBusinessAuth` wrapper as DispatcherView) is the only browser
  reader/writer of any of them — no public page reads these by
  unguessable link. All 8 now use a single owner-only `for all` policy.
  `monitor-asset-telemetry`/`harvest-industrial-leads` (the real external
  ingestion endpoints) already run on service_role + a shared
  `X-Ingestion-Key` header, unaffected. Every other writer (idle-asset
  detection, safety-hazard detection, lead enrichment, etc.) was already
  service_role too.
- **`roi_proposals`**: checked live via `pg_policies` rather than
  trusting the `.sql` delta files — it only ever had a SELECT policy
  (anon, unguessable link; every write is `generate-roi-proposal`,
  service_role). Nothing to change.

**Bug caught by live-testing this delta before shipping it**: the new
`businesses` UPDATE policy's `admin_users` EXISTS check threw
`permission denied for table admin_users` for the plain `anon` role
instead of cleanly denying, because pass 1 had only ever granted
`admin_users` SELECT to `authenticated` (every prior table that
referenced it was already authenticated-only, so `anon` never hit that
branch). Fixed by also granting `admin_users` SELECT to `anon` — safe,
since `admin_users`' own row policy (`auth.uid() = user_id`) still
returns zero rows for a logged-out request either way; this only turns
an error into a clean deny.

Live-tested end-to-end before and after the fix: real owner-email claim
on the one live pilot business succeeded; the same request replayed with
a bare anon key (no session) and with a mismatched-email authenticated
user were both cleanly denied (empty array, no error); `leads`
SELECT/`industrial_assets` SELECT with a bare anon key returned empty;
`leads` INSERT with a bare anon key still succeeds exactly as
`TrackingView.jsx` calls it (no `.select()` chained, so it uses
`return=minimal` — confirmed this doesn't hit the new owner-only SELECT
policy on the returned row, which only surfaces if a caller explicitly
asks for the row back). All test rows/sessions created for this were
deleted immediately after; the one live business row was reverted to its
original `name`.

Nothing left open from the original pass-1/2/3 lists — every table
flagged across all three passes has now been through this audit.

**Correction, pass 5 (below)**: this claim turned out to be about
coverage of the *known* lists only — pass 5 found 8 more tables that had
never been on any list at all, in any pass, ever.

## Fixed 2026-09-14: RLS read/write-scoping, pass 5 — the unaudited-8, found by querying live instead of trusting any list

Passes 1-4 all worked from a specific list of tables flagged as "still
open" in this doc. This pass instead queried `pg_tables`/`pg_policies`
directly for every RLS-enabled table's actual policy shape, independent
of any list — and found 8 tables that had **never been mentioned in any
previous pass or in this doc at all**: `quotes`, `review_requests`,
`corrective_actions`, `custom_workflows`, `workflow_runs`,
`client_portal_links`, `compliance_packages`, `carbon_estimates`. All 8
still had their original single blanket
`anon all ... using (true) with check (true)` policy from whichever delta
first created them — not a regression, just never audited by any prior
pass. Confirmed every real caller of each via grep of `src/` and
`supabase/functions/` before writing `supabase_schema_delta_rls_scoping_v4.sql`:

- **`quotes`**: the one genuine public/anon caller is `QuoteView.jsx`
  (unguessable quote-id link, no login) — reads the quote and updates its
  `status` (accept/decline), same "unguessable link is the bearer token"
  model as `invoices`. SELECT/UPDATE stay anon `using (true)`. INSERT is
  dropped entirely — `draft-quote` and `send-quote-sms` are both
  service_role, nothing in the browser ever inserts a quote directly.
  DELETE was unused, dropped too.
- **`review_requests`**: DispatcherView (owner) only ever SELECTs.
  `send-review-request-sms` and `track-review-click` are both
  service_role — even the "public" click-through is a redirect the
  browser follows to an edge function, not a direct table write from the
  browser's own anon key. Scoped to owner-select-only.
- **`corrective_actions`**: DispatcherView and IndustrialDispatcherView
  (both owner-authenticated) are the only browser callers
  (select/insert/update). Scoped to owner-all (`for all`).
- **`custom_workflows`**: DispatcherView (owner) only, all 4 operations.
  `run-custom-workflows` only reads, via service_role. Scoped to
  owner-all.
- **`workflow_runs`**: DispatcherView (owner) SELECT-only (read-only run
  history). `run-custom-workflows` INSERTs via service_role. Scoped to
  owner-select-only.
- **`compliance_packages`**: DispatcherView (owner) SELECT + UPDATE
  (`sent_at`/`sent_to`, when the dispatcher marks a package sent).
  `generate-compliance-package` INSERTs via service_role. No public
  reader — unlike the superficially similar `client_verification_
  packages`/`roi_proposals`, this one is never shown to the client via a
  link. Scoped to owner-select-and-update.
- **`carbon_estimates`**: DispatcherView (owner) SELECT-only.
  `estimate-job-carbon` INSERTs via service_role. Scoped to
  owner-select-only.
- **`client_portal_links`**: genuinely public — `TrackingView.jsx`
  upserts (insert-or-update, unguessable job-id page, no login) and
  `ClientHistoryView.jsx` reads by the link's own opaque `token`. Postgres
  `ON CONFLICT` upsert needs both INSERT and UPDATE privilege, so
  SELECT/INSERT/UPDATE all stay anon `using (true)` — same
  unguessable-link model as `invoices`/`quotes`. Only DELETE (never used)
  was dropped.

None of these 8 tables are touched by `TechnicianView.jsx` at all
(confirmed by grep), so no technician-side carve-out was needed for any
of them, unlike `checklist_templates`/`leads`/etc. in pass 4.

**A second, more severe bug found live-testing this pass, unrelated to
any RLS policy**: anon SELECT on `corrective_actions` returned a hard
Postgres `permission denied for table corrective_actions` (42501)
instead of a clean RLS deny. Checking `information_schema.role_table_grants`
confirmed `corrective_actions` had **never had any base GRANT
(SELECT/INSERT/UPDATE/DELETE) to `anon` or `authenticated` at all**, since
its creation on 2026-09-12 — the delta that created it enabled RLS and
added the old blanket policy, but never ran the matching `grant ... to
anon, authenticated, service_role` that every sibling delta (e.g.
`compliance_packages`) does. Practical impact: the entire
corrective-actions feature, in both DispatcherView and
IndustrialDispatcherView, has been completely broken for all browser
access — pre-login and post-login — since 2026-09-12, unrelated to
anything changed in this pass or any RLS policy at all. Every other
newly-touched table in this pass was checked against the same query and
found to have its grants intact; this gap was isolated to
`corrective_actions` only. Fixed live with
`grant select, insert, update, delete on corrective_actions to anon,
authenticated, service_role;`, now included directly in
`supabase_schema_delta_rls_scoping_v4.sql`. Retested: anon SELECT now
returns a clean `[]`; a service_role insert+delete round-trip confirmed
the table is fully functional again.

Live-tested end-to-end: `quotes` public accept/decline flow (service_role
creates a test quote → anon SELECT succeeds → anon UPDATE `status`
succeeds → anon direct INSERT correctly denied `42501`); `workflow_runs`
anon SELECT returns clean `[]`; `corrective_actions` anon SELECT (before
and after the grant fix, see above). All test rows created for this were
deleted immediately after via service_role.

**Lesson for future passes**: don't trust a prior pass's "nothing left
open" closing line at face value — it can only ever be as complete as the
list it started from. Querying `pg_tables`/`pg_policies` directly, with
no assumed list, is what surfaced these 8 gaps that four separate
passes had all missed. Worth doing again periodically, and worth a
one-time systematic check of `information_schema.role_table_grants`
across every RLS-enabled table (not just the ones touched so far) to see
if any other table has the same silent-grant-gap bug `corrective_actions`
had.

## Fixed 2026-09-14: missing base GRANTs on `roi_proposals` / `big_account_targets` / `outreach_prospects` — same bug class, worse blast radius

Pass 5's `corrective_actions` discovery (missing `anon`/`authenticated`
grant) raised an obvious question: is that a one-off, or a bug class? Ran
a systematic query cross-referencing every RLS policy's (role, command)
against `information_schema.role_table_grants` for every RLS-enabled
table, independent of any list. Found 3 more tables with the same class
of gap — but this time on `service_role`, the key every backend edge
function trusts completely, not just `anon`. Confirmed live: a direct
`service_role` REST call to SELECT `outreach_prospects` or
`big_account_targets` returned a 403 `permission denied`, not data.

Confirmed via grep of the real callers:

- **`roi_proposals`**: `generate-roi-proposal` does
  `.insert({...}).select().single()` via `service_role` — needed INSERT
  *and* SELECT (the chained `.select()` triggers an implicit RETURNING
  under the caller's own role), neither ever granted. Separately,
  `AdminConsole.jsx`'s pipeline view reads this table as a real logged-in
  `authenticated` session, which also had zero grant (only `anon`, for
  the public `ProposalView.jsx` link, was ever granted). Net effect:
  proposal generation has been silently failing since this table was
  created, and the admin console's proposal column has been erroring for
  any logged-in admin the whole time.
- **`big_account_targets`**: `generate-roi-proposal` also reads
  (`.select('stage')`) and updates (auto-advance to `proposal_sent`) this
  table via `service_role` — neither was ever granted, so the pipeline
  auto-advance has silently never worked.
- **`outreach_prospects`**: `parse-prospect-text`, `draft-outreach-batch`,
  `followup-outreach`, and `send-outreach-batch` all need
  SELECT/INSERT/UPDATE via `service_role` — none were ever granted, so
  Minerva's own outreach engine (see "Added 2026-09-10" above) has been
  completely non-functional at the database layer since creation,
  independent of RLS policy correctness, with no error visible anywhere
  except inside each cron function's own invocation logs.

Fixed via `supabase_schema_delta_service_role_grants_fix.sql`. None of
these are security regressions — `anon` access is unaffected either way
(`roi_proposals`' anon SELECT was already correctly scoped;
`big_account_targets`/`outreach_prospects` were never anon-reachable at
all, confirmed by grep, so no anon grant was added). This purely restores
the backend's own trusted access to its own tables. Live-tested the exact
failure mode after fixing: a real `service_role`
`insert({...}).select().single()` against `roi_proposals` (matching
`generate-roi-proposal`'s exact call shape) now succeeds and returns the
row; test row deleted immediately after (via a temporary DELETE grant,
revoked again right after cleanup, since no real code path ever deletes
from this table).

**Lesson**: a missing base GRANT is invisible to RLS policy review,
`pg_policies` inspection, or an OPTIONS smoke test — it only ever
surfaces as a runtime 403 on the exact table/role/command combination
that's missing, and only when something actually tries it. The
`corrective_actions` find made this worth checking everywhere at once
instead of table-by-table as gaps happen to get noticed.

## Added 2026-09-14: public `/enterprise` inbound lead form — new anon INSERT on `big_account_targets`

`big_account_targets` (added 2026-09-10) was operator-only end to end: every
row entered by hand in `AdminConsole.jsx`'s "Big Accounts" tab, no public
writer at all. The new `/enterprise` marketing page lets a multi-van fleet,
FM company, council, or strata manager self-submit a lead directly, so this
adds a narrowly-scoped second INSERT policy
(`supabase_schema_delta_enterprise_inbound.sql`) rather than opening the
table up generally:

- SELECT/UPDATE stay admin-only, completely unchanged — a public submitter
  can never read this table back, including their own row.
- The new policy's `with check` forces `stage = 'researching'` and blocks
  `next_action`/`next_action_date` from being set on insert — the two
  fields that represent the operator's own internal working state. A
  public submission can create a new row but can never fast-forward the
  pipeline stage or inject fake internal notes-to-self.
- No DELETE grant added for anyone (there wasn't one before this either —
  confirmed live, cleanup of test rows during this change required a
  temporary `grant delete ... to service_role`, immediately revoked after).
- Live-tested before shipping: a legitimate anon insert (no `stage`
  specified) succeeds; the same insert with `stage: 'closed_won'` is
  correctly rejected by the RLS policy itself (`42501`, row-level security
  violation, not a grant error); anon SELECT is still a hard permission
  error (no grant exists), same as before — never returns data.

No auto-reply or automated proposal is triggered by this form — a real
person reviews and follows up by hand, same as every other row in this
pipeline. The page's copy is written to never imply a response-time SLA,
since none exists in code.

## Added 2026-09-14: public `/contact` marketing page

New standalone, unauthenticated `/contact` page (distinct from the
in-app `ContactSupportModal.jsx`) inserts into `support_requests` with
`business_id: null`, same shape/columns as the existing modal. No new
policy or grant needed — `support_requests` already has an anon INSERT
policy (`with check (true)`) and base grant from
`supabase_schema_delta_support_requests.sql`. SELECT on this table stays
`admin_users`-only (pass 1, above), so a contact-page submitter cannot
read back other people's messages. Same trust tier as every other
anon-insert-only table in this doc.

## Fixed 2026-09-23: missing base GRANT on `voice_call_sessions` — same bug class, re-running the periodic check

The "worth doing again periodically" note at the end of the pass-5 grant
discovery above hadn't been re-run since 2026-09-14, despite ~10 tables
added in later rounds. Re-ran it: cross-referenced
`information_schema.role_table_grants` for `service_role` against every
RLS-enabled public table. Found `voice_call_sessions` (created alongside
`voice-intake-agent`, a later-round phone-intake feature) had **zero**
grant to `service_role` at all — only the implicit
`REFERENCES`/`TRIGGER`/`TRUNCATE` every role gets. `voice-intake-agent`'s
own header comment says it uses the service_role admin client
specifically *because* this table has no anon policy — but the actual
GRANT to let that client read/write it was never run. Every real call
would `42501` on the upsert, the select, and the update inside the
function — the entire phone-booking flow had been non-functional at the
database layer since creation, independent of and undetectable by any
RLS policy review, `pg_policies` inspection, or OPTIONS smoke test (same
lesson as `corrective_actions`/`roi_proposals` above).

Also checked (via the same cross-reference) `rate_limit_counters` and
`admin_users`, both of which likewise show zero `service_role` grants —
confirmed these are **not** bugs: `rate_limit_counters` is only ever
touched via `check_rate_limit()`, a `SECURITY DEFINER` function owned by
`postgres` (runs with the owner's own privileges regardless of caller,
verified live via `pg_proc`); `admin_users` is never queried directly by
any `service_role` edge function, only referenced inside RLS
`USING`-clause subqueries evaluated under the calling `anon`/
`authenticated` role, which already has its own grant from pass 1/4.

Fixed via `supabase_schema_delta_voice_call_sessions_grant_fix.sql` —
`grant select, insert, update on voice_call_sessions to service_role`
(no `delete`, since the code never deletes from this table — matches
its actual call shape rather than a blanket grant). Live-tested with
real `service_role` REST calls matching the function's exact operations
(upsert → `201`, select → `200`, update → `204`); a delete attempt
correctly still gets `403` since it was deliberately not granted. Test
row deleted afterward via the Management API connection (not
`service_role`, which can't).

## Fixed 2026-09-23: unrestricted file size/type on public storage buckets

`checklist-photos` and `credential-documents` (both `public: true`,
anon-writable per "The model" above) were created with
`file_size_limit = null` and `allowed_mime_types = null` — no
server-side restriction at all. The `accept="image/*"` /
`accept="image/*,application/pdf"` attributes on their upload
`<input type="file">` elements (`TechnicianView.jsx`,
`DispatcherView.jsx`) are browser UI hints only; a direct call to the
Storage API using the anon key (extractable from any browser's JS
bundle, same trust tier as everything else in this doc) could upload a
file of any type or unbounded size, immediately servable back over a
public URL. Set real limits matching actual usage — `checklist-photos`:
15 MB, image MIME types only; `credential-documents`: 20 MB, images +
`application/pdf`. Applied via
`supabase_schema_delta_storage_bucket_limits.sql`. Live-tested with real
anon-key REST calls: a valid JPEG still uploads (`200`); a `text/plain`
upload now correctly gets `415 invalid_mime_type`. Not a new trust
boundary — same "anyone with the anon key" model as always — just
closes an unbounded-size/arbitrary-file-type exposure within that
existing boundary.

## Added 2026-09-08: embeddable widget (`public/widget.js`)

New surface: a client can now paste `<script src=".../widget.js"
data-business-id="...">` into their own website to render a chat bubble
that opens `/intake/:businessId` in an iframe. Trust boundary is
unchanged from the existing plain-link flow (same public intake page,
same `businessId`-is-the-only-secret model above) — the widget doesn't
grant the host page any new access, it just loads an iframe. The iframe
is sandboxed to `allow-scripts allow-same-origin` only (no
allow-top-navigation, allow-popups, or allow-forms), so it can't navigate
or pop anything up on the host page itself. Nothing here changes the RLS
posture described above; the intake flow was already reachable by anyone
who has (or guesses) a businessId, embed or not.
