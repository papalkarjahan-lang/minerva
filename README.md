# Minerva — Setup Instructions

## What this is
A live GPS dispatch tracking tool for trade businesses. Technicians share their location via their phone browser (no download required). The dispatcher sees every technician on a live map. Clients get an automatic SMS with a tracking link when the technician is 15 minutes away.

---

## Day 1: Set up accounts (do these first)

### 1. Supabase (database + backend)
1. Go to https://supabase.com
2. Sign up with GitHub
3. Create a new project named `minerva-prod`, region: Asia Pacific (Sydney)
4. Go to **SQL Editor** → paste the entire contents of `supabase_schema.sql` → click Run
5. Go to **Database → Replication** → toggle ON for `technicians` table
6. Go to **Settings → API** → copy your Project URL, anon key, and **service_role key**
   (the service role key is only used server-side by the `stripe-webhook`
   and `missed-call-webhook` functions — never put it in `.env.local` or any
   client-side code)
7. Go to **Authentication → Providers** → turn **off** "Allow new users to
   sign up" (see `SECURITY_NOTES.md` for why)

### 2. Mapbox (maps)
1. Go to https://mapbox.com → Sign up
2. Go to Tokens → copy your default public token (starts with `pk.eyJ1`)

### 3. Twilio (SMS)
1. Go to https://twilio.com → Sign up
2. Get a trial Australian number
3. Copy your Account SID and Auth Token from the Console
4. (Optional — missed-call auto-reply) Once `missed-call-webhook` is deployed
   (see "Deploy Supabase Edge Functions" below), go to your number's
   configuration page in the Twilio Console → **Voice Configuration** → set
   **"A call comes in"** to Webhook, paste
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/missed-call-webhook`,
   method `HTTP POST`. Also set the business's number in the `businesses`
   table (`twilio_number` column, E.164 format e.g. `+61412345678`) so the
   webhook can look up the right business name for the auto-reply SMS.

### 4. Stripe (billing)
1. Go to https://stripe.com/au → Sign up with your ABN
2. Create three products (all flat-rate, quantity = number of technicians):
   - **Minerva Starter**: $49/technician/month, 7-day trial
   - **Minerva Standard**: $79/technician/month, 7-day trial
   - **Minerva Pro**: $119/technician/month, 7-day trial
3. Copy the Price IDs for each
4. Copy your publishable key (pk_live_...) and secret key (sk_live_...)
5. Enable the Customer Portal under Settings → Billing → Customer Portal

---

## Day 1: Set up your local environment

```bash
# Clone or create your repo, then:
npm install

# Copy the example env file and fill in your real values
cp .env.local.example .env.local
# Edit .env.local with your Supabase, Mapbox, and Stripe keys

# Start the dev server
npm run dev
# Opens at http://localhost:5173
```

---

## Day 1: Deploy to Vercel

1. Go to https://vercel.com → Sign in with GitHub
2. Import your repository
3. Add environment variables (same as your `.env.local`)
4. Click Deploy
5. Add your custom domain under Project → Settings → Domains

---

## Deploy Supabase Edge Functions

Install the Supabase CLI first:
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set secrets (replace with your real values):
```bash
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token
supabase secrets set TWILIO_PHONE_NUMBER=+61412345678
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_PRICE_ID_STARTER=price_xxx
supabase secrets set STRIPE_PRICE_ID_STD=price_xxx
supabase secrets set STRIPE_PRICE_ID_PRO=price_xxx
supabase secrets set APP_URL=https://minervaops.com.au
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxx
```
(`ANTHROPIC_API_KEY` is only needed for the `ai-intake-chat` function — the
AI lead-triage widget embedded on a business's own website.)
(`STRIPE_WEBHOOK_SECRET` comes from Stripe Dashboard → Developers → Webhooks,
after you create the endpoint in the next step — come back and set it once
you have it.)
(You don't need to set `SUPABASE_URL` or `SUPABASE_ANON_KEY` — Supabase
injects both into every Edge Function automatically at runtime. You'll only
type those two in manually inside `.env.local`, for the frontend.)

Deploy all functions:
```bash
supabase functions deploy send-eta-sms
supabase functions deploy send-setup-sms
supabase functions deploy send-completion-sms
supabase functions deploy send-invoice-sms
supabase functions deploy create-checkout-session
supabase functions deploy sync-technician-billing
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy missed-call-webhook --no-verify-jwt
supabase functions deploy ai-intake-chat
supabase functions deploy notify-slack
supabase functions deploy calendar-feed --no-verify-jwt
supabase functions deploy nurture-stale-leads
supabase functions deploy chase-unpaid-invoices
supabase functions deploy auto-assign-technician
supabase functions deploy daily-digest
supabase functions deploy retention-checkin
supabase functions deploy reconcile-billing
supabase functions deploy check-inventory-levels
supabase functions deploy generate-growth-drafts
supabase functions deploy launch-ad-campaign
supabase functions deploy send-growth-message
supabase functions deploy check-credential-expiry
supabase functions deploy detect-wasted-trips
supabase functions deploy check-weather-risk
supabase functions deploy send-weather-reschedule-sms
supabase functions deploy send-referral-code-sms
supabase functions deploy update-technician-workload
```
(`sync-technician-billing` is called automatically by the app — from a
technician's phone on their first GPS push, and from the dispatcher when
removing a technician — to keep the Stripe subscription quantity in sync
with the number of technicians actually connected. You don't call it
manually.)

The last eighteen functions above power the autonomous-operations layer
(optional — everything else in Minerva works without them):

- **`notify-slack`** — generic internal notifier. Called by the other
  functions to post an alert to a business's own Slack channel. No-op
  (not an error) if that business hasn't set a webhook URL.
- **`calendar-feed`** — public ICS feed of a business's scheduled jobs.
  Deployed with `--no-verify-jwt` since calendar apps fetch it directly
  with no Supabase auth header (same reason as `stripe-webhook` and
  `missed-call-webhook`).
- **`nurture-stale-leads`**, **`chase-unpaid-invoices`**, **`daily-digest`**,
  **`retention-checkin`**, **`reconcile-billing`**, **`check-inventory-levels`**
  — scheduled agents, triggered by `pg_cron` (see below), not called
  manually.
- **`auto-assign-technician`** — event-driven agent, triggered by a
  Postgres trigger on job insert (see below), not called manually.
- **`generate-growth-drafts`** — scheduled agent, triggered by `pg_cron`
  (see below). **`launch-ad-campaign`** and **`send-growth-message`** are
  never scheduled — they only run when a business owner clicks
  Approve on a draft in the dispatcher's **Marketing** tab. See "Growth
  pillar (Sales & Marketing)" below.
- **`check-credential-expiry`**, **`detect-wasted-trips`**,
  **`check-weather-risk`**, **`update-technician-workload`** — scheduled
  agents, triggered by `pg_cron` (see below), not called manually.
- **`send-weather-reschedule-sms`** — click-only: sends an approved
  `weather_reschedule_drafts` row's client SMS from the dispatcher's
  **Weather** tab. Never runs on its own.
- **`send-referral-code-sms`** — fire-and-forget: called by the frontend
  the moment an invoice is marked paid, not scheduled. Invoicing itself is
  a Pro-tier-only feature (see pricing below), so in practice this only
  ever fires for Pro-tier businesses — there's no separate tier check in
  the function itself, it just can't be reached any other way.

Details on the three newest scheduled agents:
- **`retention-checkin`** (weekly) — Customer Management pillar. Finds
  clients whose last completed job was 30-60 days ago with no newer job or
  lead since, and sends one low-pressure "need anything else?" SMS. Existing-
  client relationship maintenance, not new-prospect outreach.
- **`reconcile-billing`** (daily) — Financial Automation pillar. Compares
  each Pro-tier business's live Stripe subscription quantity against the
  actual count of connected technicians, and Slack-alerts on any mismatch.
  Does **not** auto-correct billing — a human should look at *why* before
  changing what a client is charged.
- **`check-inventory-levels`** (daily) — Supply & Inventory pillar. Watches
  stock levels entered on the **Inventory** tab and Slack-alerts once per
  low-stock episode when an item drops to/below its reorder threshold.
  Minerva has no vendor accounts to actually place orders through, so this
  is alerting only, not automated purchasing.
- **`generate-growth-drafts`** (weekly, Sundays) — Sales & Marketing
  ("Growth") pillar, Pro tier only. Writes two kinds of `marketing_drafts`
  per business, never more than one unreviewed draft of each type at a
  time: an **ad campaign** (Meta ad copy + suggested daily budget targeting
  the suburb with the most completed jobs in the last 90 days) and a
  **win-back SMS** (for leads quoted 14+ days ago that never booked, pulled
  only from that business's own leads table). This function only ever
  **writes drafts** — it never spends money and never sends a message.
  Everything shows up as a pending card on the **Marketing** tab for the
  owner to Approve or Reject.
  - Approving an `ad_campaign` draft calls `launch-ad-campaign`, which uses
    the business's **own** Meta access token / ad account / Page ID (set in
    Settings) to create a campaign → ad set → creative → ad via the Meta
    Marketing API. Minerva never holds or spends from a shared ad account.
  - Approving an `outreach_sms` draft calls `send-growth-message`, which
    sends the already-written, already-reviewed message via Twilio to the
    recipients stored on that draft — existing leads only, never a
    purchased or scraped list.
  - Rejecting a draft just marks it `rejected` — nothing else happens.

Details on the six newest agents/features (added on top of everything
above — purely additive, nothing below changes any existing behaviour):
- **`check-credential-expiry`** (daily) — Licence/Ticket Expiry Guardian,
  Pro tier only. Watches `technician_credentials` (expiry dates you enter
  on the dispatcher's **Credentials** tab) and Slack-alerts the dispatcher
  at 30/14/7 days out (each threshold only fires once per credential), plus
  an urgent same-day nudge if a technician who's currently on a job has a
  credential that's expired or expiring within 3 days. Never texts the
  technician or a client, never blocks assignment — it's a heads-up, not an
  enforcement gate. Technicians also see a small read-only "expiring soon"
  banner on their own tracking page.
- **`detect-wasted-trips`** (every 15 minutes) — Wasted-Trip/No-Show Proof
  Agent. Looks for scheduled jobs where GPS shows the technician was
  genuinely on-site (within ~150m of the client address for 15+ minutes)
  but the job was never started — i.e. a no-show or a locked gate, not a
  technician who just hasn't left yet. Marks the job, texts the client a
  no-pressure reschedule prompt, and Slack-alerts the dispatcher. A running
  count shows on the **Jobs** tab.
- **`check-weather-risk`** (daily) — Weather-Risk Reschedule Agent. For
  trade types you mark as weather-sensitive (**⚙️ Settings**), checks
  tomorrow's forecast (free Open-Meteo API, no signup needed) for each
  scheduled job's location. If rain/wind/heat looks bad, it writes a
  pending draft to the dispatcher's **Weather** tab — it does **not** text
  the client itself. A human has to click **Approve & Send** for the
  reschedule SMS to actually go out (same human-approval-gate pattern as
  the Marketing tab), or **Dismiss** to ignore it. Available on every
  tier, not just Pro, since it's framed as a safety feature.
- **`update-technician-workload`** (daily) — Fair-Rotation/Burnout Guard.
  Recomputes two rolling 7-day signals per technician from existing GPS
  breadcrumbs and job data: an estimated hours-worked figure (shown next
  to their name on the dispatcher's roster) and a count of recent
  emergency-tagged jobs. If estimated hours cross 55/week, Slack-alerts the
  dispatcher once (re-alerts after 7 days if still over) — purely an
  internal nudge, never sent to the technician, never changes pay or
  scheduling automatically. The emergency-job count also feeds a **soft**
  tiebreak into `auto-assign-technician`: among comparably-close free
  technicians, one who's had fewer recent emergency callouts is preferred
  — a genuinely closer technician still wins regardless. New jobs can
  optionally be tagged **Emergency**/**Routine** on the Add Job form, and
  the AI intake widget's own urgency classification carries through
  automatically when a lead converts to a job.
- **Payroll v1** (`DispatcherView.jsx` **Payroll** tab, Pro tier, added
  2026-09-02) — no new edge function, purely client-side. Pick a date range
  and click Generate: queries `technician_locations` for that range and
  buckets hours the same way `update-technician-workload`'s rolling-week
  signal does (per calendar day, sum of max−min `recorded_at`), just
  per-technician for any custom period instead of a fixed rolling 7 days.
  Export CSV (`Technician, Estimated Hours, Days With GPS Activity, Period
  Start, Period End`) to hand to your accountant or import into payroll
  software. Deliberately does **not** calculate PAYG, superannuation, award
  rates, or a pay dollar amount — raw hours only, same scope decision as
  the rest of Minerva's compliance-risk-averse feature set (see
  SALES_CLAIMS_ACCURACY_NOTE.md-adjacent reasoning: an hours estimate is
  safe to automate, a pay calculation is not).
- **`send-weather-reschedule-sms`** / **Weather tab** — see above.
- **`send-referral-code-sms`** — Paid-Invoice Referral Loop. The moment an
  invoice is marked paid (Pro tier only, since invoicing itself is a
  Pro-tier feature), generates a short referral code for
  that invoice and texts the client a simple "share this with a friend"
  message — a single acknowledgment-tier nudge, not a marketing campaign,
  same low-stakes bar as the existing retention check-in SMS. If a future
  chat visitor mentions a referral code, the AI intake widget
  (`ai-intake-chat`) opportunistically checks it against real invoices for
  that business and, if it matches, tags the new lead as referred — never
  prompted for, never stored if it doesn't match a real code.
- **Client Self-Serve Rebooking Loop** (`TrackingView.jsx` only, no new
  function) — once a job shows "Job Complete" on the client's tracking
  link, a "Need this again?" button lets them request another booking
  directly. Writes straight into the existing `leads` pipeline (tagged
  `source: 'rebooking'`) so it shows up on the dispatcher's **Leads** tab
  like any other lead — no SMS or email sent automatically, a human still
  follows up.
- **Dispute Pack** (`/dispute/:jobId`, bonus) — a read-only, shareable
  evidence page for a single job (GPS route while on-site, checklist
  photos, materials used, invoice), opened via a **📁 Dispute Pack** link
  next to each job in the dispatcher's Recently Completed list. Built
  entirely from existing data — no new table or edge function. Same
  no-login link-based trust model as `/track/:jobId` and
  `/invoice/:invoiceId` (see `SECURITY_NOTES.md`).

### Slack integration
In the business's Dispatcher view, click **⚙️ Settings** → paste in a
Slack "Incoming Webhook" URL. Get one from your own Slack workspace:
**Slack → Settings & administration → Manage apps → search "Incoming
Webhooks" → Add to Slack → choose a channel → copy the webhook URL.**
Once saved, new leads, auto-dispatches, payment reminders, and a weekly
activity digest all post to that channel automatically. Leave it blank to
opt out — nothing else in Minerva depends on it.

### Calendar integration
In the Dispatcher view **⚙️ Settings** modal, copy the calendar
subscription link. In Google Calendar: **Other calendars → + → From
URL** → paste it. In Apple Calendar: **File → New Calendar Subscription**
→ paste it. The feed refreshes every ~15 minutes and lists all of that
business's scheduled jobs. Treat the link like a secret (see
`SECURITY_NOTES.md`) — anyone with it can see the business's job
schedule.

### Accounting export (Xero / QuickBooks)
Any business, on any tier, can export their invoices, jobs, and leads as a
CSV from the **Invoices**, **Jobs**, and **Leads** tabs (**⬇ Export CSV**)
and import into Xero, QuickBooks, or Excel — the zero-setup option, works
today for either provider, with no tier gate in the code.

There's also a real, working Xero OAuth integration (`xero-oauth-connect`,
`xero-oauth-callback`, `xero-sync-invoice` — added 2026-09-04, see "Minerva
Max batch" below), but it needs the business owner to register their own
free app at developer.xero.com first (Xero, like Intuit for QuickBooks,
requires the account holder to do this — not something that can be
completed on your behalf). Until that's done and the resulting
`XERO_CLIENT_ID`/`XERO_CLIENT_SECRET` secrets are set, the "Connect Xero"
button in Settings shows a setup message instead of connecting. No
QuickBooks/Intuit equivalent is built yet — CSV export remains the only
QuickBooks path.

### Compliance document templates
`COMPLIANCE_TEMPLATES.md` has generic starting-point templates (terms of
service, privacy notice, job sign-off, subcontractor onboarding paperwork
checklist) for the Compliance & Admin pillar. **Not legal advice** — have
a solicitor review and customize before using with real clients.

### Inventory tracking + low-stock alerts
Pro-tier businesses get an **Inventory** tab in the Dispatcher view to
track stock items (name, quantity, unit, reorder threshold, usual
supplier). The `check-inventory-levels` agent (see below) Slack-alerts
when an item drops to/below its threshold — Minerva doesn't place orders
automatically since that would require a vendor account integration that
doesn't exist yet.

### Technician onboarding checklist
Pro-tier businesses can set up a separate onboarding checklist (Dispatcher
sidebar → **🧑‍🔧 Set up technician onboarding checklist**), distinct from
the per-job completion checklist. It's shown once, before a technician's
very first "Start Tracking" tap, and gates on `technicians.
onboarding_completed_at` — never shown again after that technician
completes it once.

### Growth pillar — ad account setup (Sales & Marketing)
Pro-tier businesses that want the weekly ad-campaign drafts to be launchable
need to connect their **own** Meta ad account in **⚙️ Settings**:
1. Meta Business Suite → create (or use an existing) ad account and Page for
   the business.
2. Generate a long-lived Marketing API access token for that ad account
   (Meta Business → System Users, or the Graph API Explorer for testing).
3. In Minerva's **⚙️ Settings** modal (Pro tier), paste in the **Meta access
   token**, **ad account ID** (`act_...`), and **Facebook Page ID**.

Until these are filled in, `generate-growth-drafts` still writes ad-campaign
drafts (they're useful to review even unlaunched), but clicking **Approve &
Launch** will fail with a clear "connect an ad account" message instead of
silently doing nothing. The win-back SMS draft type doesn't need any of
this — it only needs the Twilio secrets already set above.

### Scheduled agents + auto-dispatch (pg_cron)
After deploying the functions above, go to **Supabase SQL Editor**
and run both the `AUTONOMOUS AGENTS — setup` block AND the
`FEATURE ADDENDUM` block that follows it further down
`supabase_schema.sql` (skip both if you don't want this layer — everything
else works fine without it; the addendum's `cron.schedule` calls are what
actually turn on the six newest agents, so don't stop after just the first
block). Before running either:
1. Replace `YOUR_PROJECT_REF` with your Supabase project ref (appears in
   both blocks).
2. Replace `YOUR_ANON_KEY` with your project's anon public key (same one
   already in your `.env.local` — safe to reuse here, see the comment in
   the SQL file for why; also appears in both blocks).

This enables eleven scheduled jobs — lead nurture (hourly), invoice
chasing (daily), weekly Slack digest, retention check-ins (weekly),
billing reconciliation (daily), inventory-level checks (daily), weekly
growth drafts, credential expiry checks (daily), wasted-trip detection
(every 15 min), weather-risk checks (daily), and technician workload/
burnout checks (daily) — plus one event-driven trigger (auto-dispatch —
only acts for businesses that turn it on in **⚙️ Settings**).
`launch-ad-campaign`, `send-growth-message`, and `send-weather-reschedule-sms`
are deliberately **not** part of this cron block — they only ever run from a
synchronous Approve click in the Marketing/Weather tabs. `send-referral-code-sms`
is also not in the cron block — it's called fire-and-forget by the frontend
when an invoice is marked paid.

Then in Stripe Dashboard → Developers → Webhooks, add an endpoint:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`, listening
for `checkout.session.completed` and `customer.subscription.deleted`. Without
this step, the Customer Portal cancellation link on the pricing page won't
work — the business's Stripe subscription ID never gets saved.

Then, for the missed-call auto-reply, go to the Twilio Console → **Phone
Numbers → Manage → Active Numbers** → select the business's number →
**Voice Configuration** → set "A call comes in" to Webhook:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/missed-call-webhook`
(HTTP POST). Also make sure that number is saved in the `twilio_number`
column on the matching `businesses` row, so the webhook can look up the
right business name. `--no-verify-jwt` is required here too, since Twilio's
servers call this webhook directly without a Supabase auth header (same
reason `stripe-webhook` uses it).

---

## Agent Expansion Pack (Track A) + Industrial Sector (Track B)

Two additive builds, both optional, neither changes any existing behaviour
above. Both are documented with their own standalone schema delta files (run
these in the Supabase SQL Editor same as `supabase_schema.sql` — see "Deploy
Supabase Edge Functions" for the pattern) and their own cron block.

**Track A** reorganizes the existing trade-business product into named
departments (Front Desk, Dispatch & Crew, Ledger, Watchtower, Growth — see
the labels in the Dispatcher view's job queue) and adds four genuinely new
features on top:
- **Watchtower / `verify-checklist-photos`** (every 15 min) — Claude Vision
  review of each new checklist photo against the checklist item it claims to
  satisfy, for dispute-protection accountability (not a blocker of the
  technician's own checklist completion). Falls back to
  `verification_status: 'unavailable'` if `ANTHROPIC_API_KEY` isn't set.
- **Crew Coordination accountability log** (`technician_incidents` table,
  no new function) — disputes, near-misses, or notes tied to a job/tech,
  independent of the pass/fail checklist. Not yet surfaced in the Dispatcher
  UI — currently a data layer only, add rows directly or via a future panel.
- **`winback-lost-leads`** (daily) — one autonomous re-engagement SMS for
  leads marked `lost` 14+ days ago, mirroring `nurture-stale-leads`'
  two-touch pattern.
- **`run-custom-workflows`** — general-purpose "customized via chat" agent.
  Businesses define simple trigger → condition → action rules
  (**⚙️ Settings → Custom Workflows** in the Dispatcher view) — e.g. "when a
  job completes, POST to this webhook" or "when an invoice is paid over
  $500, Slack-alert". Wired into three real trigger points: `lead.created`
  (`ai-intake-chat`), `job.completed` (`TechnicianView.jsx`), `invoice.paid`
  (`DispatcherView.jsx`). Every run is logged to `workflow_runs`. The cron
  entry for this function is a no-op tick kept for forward-compatibility —
  both supported triggers today are event-driven, not time-based.
- **Morning Meeting** — `daily-digest`'s existing weekly Slack summary is now
  grouped by department (Front Desk / Dispatch & Crew / Ledger / Watchtower)
  instead of one flat message. Same underlying data, no new function.

Schema: `supabase_schema_delta_agent_expansion.sql`. Deploy:
```bash
supabase functions deploy verify-checklist-photos
supabase functions deploy run-custom-workflows
supabase functions deploy winback-lost-leads
```

**Track B** is a new, additive **industrial sector** (`businesses.sector`,
`'trade'` or `'industrial'`) — a parallel console for heavy-equipment/B2B
site-work businesses, chosen at signup (`Onboarding.jsx`) and routed to
`/industrial/:businessId` (`IndustrialDispatcherView.jsx`) instead of
`/dispatch/:businessId`. **Honesty note**: this is a real, working data
model + alerting/logic layer — geofence math, maintenance-hours tracking,
safety-overlap detection are all functioning. It does **not** include real
external data or hardware integration (no LinkedIn/registry scraping, no
RFID/Bluetooth/drone feeds) — those endpoints are real, working ingestion
APIs with comments marking exactly where a real vendor feed would plug in.
Industrial dispatch suggestions (unlike the trade sector's
`auto-assign-technician`) are **suggest-via-Slack, never auto-commit** —
a wrong heavy-equipment dispatch is costlier to reverse than a trade
technician auto-assign.

| Function | Cadence | Role |
|---|---|---|
| `industrial-conductor` | every 15 min + on-demand | Central Conductor — suggests nearest free asset for a new lead |
| `harvest-industrial-leads` | ingestion webhook only | Bulk lead intake (`{businessId, leads: [...], source}`) |
| `enrich-industrial-leads` | daily + on-demand | Signal & Enrich — nudges Slack for leads 24h+ old missing contact data |
| `monitor-asset-telemetry` | ingestion webhook only | Telemetry — geofence-breach + maintenance-hours alerts |
| `optimize-industrial-routes` | every 30 min | Route Optimizer — nearest-free-asset suggestions for unassigned sites |
| `track-consumables` | hourly | Quartermaster — low-stock flag, once per episode |
| `detect-safety-hazards` | every 15 min | The Warden — flags overlapping human/automated on-site activity |
| `sequence-handoffs` | every 15 min | The Pacer — flags automated task-complete with no human follow-up |
| `package-client-verification` | on-demand only | The Closer — bundles checkins/telemetry/incidents into a sign-off package |
| `verify-industrial-compliance` | hourly | Sentry — 24h+ backstop escalation for unacknowledged safety incidents |

Two more industrial-relevant functions live under the `asset_intelligence`
Minerva Max add-on rather than this base track — `detect-idle-assets`
(daily) and `predict-asset-maintenance` (daily), both gated per-business
by that add-on. See the Minerva Max section below.

All 10 functions above now check `agent_functions.enabled` where
applicable and call `record_agent_run()` for health tracking (added
2026-09-05 — previously deployed/scheduled but invisible to
`test-agent-health` and the operator kill-switch; see
`DEPLOYMENT_CHECKLIST_PENDING.md`).

Schema: `supabase_schema_delta_industrial.sql`. Deploy:
```bash
supabase functions deploy industrial-conductor
supabase functions deploy harvest-industrial-leads --no-verify-jwt
supabase functions deploy enrich-industrial-leads
supabase functions deploy monitor-asset-telemetry --no-verify-jwt
supabase functions deploy optimize-industrial-routes
supabase functions deploy track-consumables
supabase functions deploy detect-safety-hazards
supabase functions deploy sequence-handoffs
supabase functions deploy package-client-verification
supabase functions deploy verify-industrial-compliance
```
(`harvest-industrial-leads` and `monitor-asset-telemetry` use
`--no-verify-jwt` since they're meant to be called by an external
ingestion source, not the Minerva frontend — same reasoning as
`stripe-webhook`/`missed-call-webhook` above. Both also require an
`X-Ingestion-Key` header matching that business's `businesses.ingestion_key`
column — see SECURITY_NOTES.md.)

Both tracks' cron schedules (10 jobs total) are in
`supabase_schema_delta_agent_cron.sql` — pre-filled with your real project
ref/anon key, same format as the existing `AUTONOMOUS AGENTS` block. Run it
once, after deploying the corresponding functions and running both delta
schema files above.

**Setup-stage personalization**: Onboarding now asks which
departments/features matter most to the business (`businesses.
feature_priorities`, different checklist per sector) — purely informational,
shown back to the business, never a feature gate.

---

## Agent Operating System — Phase 1 (infrastructure)

Phase 1 of a planned 5-phase build. This phase is infrastructure only — it
adds two new tables and one new function, and does not change the runtime
behaviour of any existing agent. Standalone schema delta files, safe to run
independently of Track A/B.

**`agent_functions`** — one row per autonomous/cron-driven edge function
(seeded from both the original agents and the Track A/B ones), tracking
`agent` grouping (`outreach` / `marketing` / `scheduling` / `research` /
`finance` / `design` / `core`), `enabled`, and run-health data
(`last_run_at`, `last_status`, `last_error`, cumulative `error_count`).

**Kill-switch — partially implemented.** Setting a row's `enabled = false`
is meant to let you disable a single misbehaving agent without a code
deploy. **Honesty note**: as of Phase 1, no edge function actually checks
its own `agent_functions.enabled` flag yet — flipping it currently does
nothing at runtime. Wiring each function to check this flag before doing
real work is a known follow-up for a later phase, not yet built.

**`agent_insights`** — a shared scratchpad any agent (or the health-check
sweep) can write an observation to (`insight_type`: `anomaly` / `pattern` /
`suggestion` / `health_alert`, etc.), optionally scoped to a `business_id`
(nullable — some insights, like a health alert about an infra function, are
cross-business and have no single owner). Intended for later phases to read
back; nothing reads it yet besides the health-check writing to it.

**`test-agent-health`** (every 15 min) — a passive self-test: it does not
invoke any other agent (most have real side effects like sending SMS or
posting to Slack, so re-running them just to "check" would itself be
risky). Instead it reads `agent_functions`' run-history and flags a
function as unhealthy if it's overdue for its known cron cadence (hand-
maintained cadence map inside the function) or its `error_count` has
crossed 5. Since there's no single business to Slack-alert for a
cross-tenant infra issue, unhealthy functions are written to
`agent_insights` (and logged) instead of posted to Slack — see the
function's own header comment for the reasoning. Deduplicated so it only
re-alerts once the function has actually run again since the last alert.

**`record_agent_run(fn_name, status, error_msg)`** — the SQL function that
feeds `agent_functions`. Wired in as a proof-of-pattern into 3 functions
this phase (`check-inventory-levels`, `chase-unpaid-invoices`,
`reconcile-billing`) — fire-and-forget on both their success and error
paths. The other 20+ autonomous functions are **not yet wired in** —
rolling that out everywhere is a follow-up, done deliberately narrow here
to avoid touching working production functions without individual review.

Schema: `supabase_schema_delta_agent_infra.sql`. Deploy/run order:
```bash
# 1. Run supabase_schema_delta_agent_infra.sql in the Supabase SQL Editor
# 2. Deploy the new function
supabase functions deploy test-agent-health
# 3. Run supabase_schema_delta_agent_infra_cron.sql in the Supabase SQL Editor
```

## Agent Operating System — Phase 2 (Outreach + Finance reasoning layer)

Phase 2 gives the **Outreach** agent (`nurture-stale-leads`,
`chase-unpaid-invoices`, `retention-checkin`, `winback-lost-leads`) and the
**Finance** agent (`reconcile-billing`, `check-credential-expiry`) real LLM
reasoning from Claude instead of fixed copy/logic-only anomaly detection —
six functions total. No schema changes were needed; this phase is code-only
and reuses the `agent_insights` table Phase 1 already created.

**No behaviour change today, by design.** `ANTHROPIC_API_KEY` is not yet
configured in production (billing isn't set up on the Anthropic Console
account this project uses), so every one of these six functions is
currently running in its fallback path — the exact fixed SMS templates and
plain-English summaries they always used. Each Claude call is wrapped so a
missing key, a failed request, or an unusable draft (empty, too long, or —
for `chase-unpaid-invoices` — missing the required dollar amount/invoice
link) falls straight back to the original hard-coded string, never blocking
or altering the send. Nothing about this phase requires the key to be live
to be safe to deploy.

**Outreach — AI-drafted copy, same voice/length as the fixed templates:**
- `nurture-stale-leads` — both the 1st and 2nd touch nurture SMS are drafted
  by Claude (lead name, urgency, business name, touch number) when a key is
  present.
- `chase-unpaid-invoices` — reminder copy is drafted by Claude using how
  many reminders have already gone out and how overdue the invoice is, so
  tone escalates (friendly → firmer) purely in wording. The escalation
  LOGIC — which invoices get touched, on what cadence — is unchanged. The
  draft is discarded in favour of the fixed template if it doesn't contain
  the exact dollar amount and invoice link.
- `retention-checkin` — check-in SMS is drafted by Claude using the
  client's last-job notes/date for light personalization.
- `winback-lost-leads` — the one-shot win-back SMS is drafted by Claude
  using the lead's original `job_description`/`urgency`.

All four also get `record_agent_run` wired in (success + error paths,
`chase-unpaid-invoices` already had it from Phase 1).

**Finance — anomaly reasoning, now actually writing to `agent_insights`:**
- `reconcile-billing` — on every Stripe-vs-local seat mismatch, in addition
  to the existing Slack alert, a row is now written to `agent_insights`
  (`agent: 'finance'`, `insight_type: 'anomaly'`, scoped to the business).
  The `summary` is a one-sentence Claude best-guess at the likely cause
  (missed technician deactivation vs double-counted GPS ping vs Stripe-side
  seat change) when a key is present, otherwise a plain-English fallback
  (`"Stripe billing count (X) does not match locally connected technicians
  (Y) for <business>."`) — the row is written either way.
- `check-credential-expiry` — every 30/14/7-day threshold crossing and
  every urgent (on-a-job-with-an-expiring/expired credential) ping now also
  writes an `agent_insights` row, with a one-sentence Claude note on what to
  check/do first when a key is present, otherwise a plain-English fallback.

This is the **first phase where any function actually writes to
`agent_insights`** — Phase 1 only had the health-check sweep writing to it;
`agent_insights` is not yet read back by anything, so these rows are purely
for later phases/humans to review directly in the table for now.

**No shared code across function folders.** Since every edge function
folder deploys independently via `supabase functions deploy <name>` with no
cross-folder imports anywhere in this codebase, the small "call Claude, fall
back gracefully" helper is duplicated inside each of the six files rather
than imported from a shared module — consistent with how this codebase
already re-implements small fetch-based helpers (e.g. `notifySlack`) per
function.

Deploy the six changed functions:
```bash
supabase functions deploy nurture-stale-leads
supabase functions deploy chase-unpaid-invoices
supabase functions deploy retention-checkin
supabase functions deploy winback-lost-leads
supabase functions deploy reconcile-billing
supabase functions deploy check-credential-expiry
```
No SQL to run for this phase — `agent_insights`/`agent_functions` and
`record_agent_run` already exist from `supabase_schema_delta_agent_infra.sql`
(Phase 1).

## Agent Operating System — Phase 3 (Marketing + Scheduling)

Phase 3 brings the **Marketing** agent (`generate-growth-drafts`,
`launch-ad-campaign`, `send-growth-message`) and the **Scheduling** agent
(`auto-assign-technician`, `detect-wasted-trips`, `check-weather-risk`,
`update-technician-workload`) up to the same health-tracking standard as
Phase 1/2 — seven functions total — and adds one genuinely new capability
to each pillar.

**`record_agent_run` wired into all seven.** Same fire-and-forget
success/error pattern as Phase 2. For `auto-assign-technician`
specifically (event-driven, multiple early-return "skipped" outcomes —
already assigned, auto-dispatch disabled, no technician available), every
early return records `status: 'ok'` — the function completing its check
and correctly choosing to do nothing is a healthy run, not an error.

**Deliberately NOT touched**: `launch-ad-campaign` and `send-growth-message`
remain callable only from a human's "Approve" click in the dispatcher's
Marketing tab — never cron, never autonomous. Only the health-tracking call
was added to these two; the human-approval trust boundary described in
`SECURITY_NOTES.md` ("Growth pillar") is unchanged. Similarly,
`auto-assign-technician`, `detect-wasted-trips`, `check-weather-risk`, and
`update-technician-workload` stay fully deterministic (geometry/threshold-
based) — no new Claude/LLM reasoning was added to any of them; only
`generate-growth-drafts` (which already had a two-pass Claude draft/review
loop from before this phase) touches Claude.

**Marketing — audience-opportunity insight**, added to
`generate-growth-drafts`: this function already computes suburb counts
from the last 90 days of completed jobs, but only ever acted on the single
top suburb for its weekly ad-campaign draft. It now also checks the
**2nd-highest** suburb by job count and, if that suburb has never had a
targeted `ad_campaign` draft in the last 90 days, writes an `agent_insights`
row (`agent: 'marketing'`, `insight_type: 'suggestion'`) — e.g. *"Waverley
is your 2nd-highest suburb by completed jobs (6 in 90 days) but has never
had a targeted ad — worth considering once you've reviewed the current
draft."* This is informational only: it does not create a second
`marketing_drafts` row and does not touch the existing "max 2 pending
drafts per business" cap. Unlike the ad/SMS copy drafts, this check makes
no Claude call, so it runs the same whether or not `ANTHROPIC_API_KEY` is
configured.

**Scheduling — job-overload heuristic (honest limitation)**, added to
`detect-wasted-trips`: the original ask was to "flag scheduling conflicts,"
but `jobs` has only a single `scheduled_time` timestamp — **no
duration/estimated_duration column anywhere in the schema**, so there is no
way to detect a true double-booking (two jobs whose time windows actually
overlap). What's implemented instead is the honest, buildable version: for
each technician, count how many `scheduled`/`active` jobs with a set
`scheduled_time` fall on the same calendar date (today or a future date —
past/backlog dates aren't scanned). If a technician has **more than 6 jobs
on one calendar date**, that's written to `agent_insights`
(`agent: 'scheduling'`, `insight_type: 'anomaly'`) as a conservative,
fixed-threshold signal that the day is probably overloaded — **not** proof
of any specific overlapping time slot. This lives inside
`detect-wasted-trips` rather than `auto-assign-technician` because it's the
only scheduling-pillar function on a tight (~15 min) cron cadence that
scans every job across every business; `auto-assign-technician` only fires
once per new job for auto-dispatch-enabled businesses, so it would miss
manually-assigned jobs. Throttled per technician+date via the new
`technicians.overload_alert_date` column so the same technician isn't
re-flagged every 15 minutes for the same day.

**One new column, one new delta file**:
`supabase_schema_delta_agent_phase3.sql` adds
`technicians.overload_alert_date` (a `date`, not a `timestamptz` — see the
file's own comments for why). Run order:
```bash
# 1. Run supabase_schema_delta_agent_phase3.sql in the Supabase SQL Editor
# 2. Deploy the seven changed functions (see below)
```

Deploy the seven changed functions:
```bash
supabase functions deploy generate-growth-drafts
supabase functions deploy launch-ad-campaign
supabase functions deploy send-growth-message
supabase functions deploy auto-assign-technician
supabase functions deploy detect-wasted-trips
supabase functions deploy check-weather-risk
supabase functions deploy update-technician-workload
```

## Agent Operating System — Phase 4 (Agent Council weekly report)

Phase 4 adds a new function, `agent-council-report`, and one new table,
`agent_council_reports`. Every Monday it reads the last 7 days of
`agent_insights` (written by the Phase 2/3 functions) and `agent_functions`
health data (written by `record_agent_run`, across every agent), and writes
one synthesis row — a weekly "state of the agents" report.

**This is a report FOR THE MINERVA OPERATOR, not for a customer.** Every
other notification in this codebase (`daily-digest`, `notify-slack`, the
Phase 2/3 Slack alerts) is scoped to one business and posted to that
business's own `slack_webhook_url`. The Agent Council report is cross-
platform — it's about the health of Minerva's own agent system across every
customer business — so it deliberately does not go through `notify-slack`
and is not attached to any single `business_id`.

**What it does:**
- Pulls all `agent_insights` created in the last 7 days (grouped by agent
  and by `insight_type`) and all `agent_functions` rows (for `error_count` /
  `last_status` / staleness context).
- If `ANTHROPIC_API_KEY` is configured, sends that data to Claude and asks
  for a three-part report: a plain-English summary of the week across
  whichever agents actually had activity (it's explicitly told not to
  invent activity for `research`/`design`, which aren't real agents yet),
  any pattern worth a human's attention, and 2-4 concrete suggestions —
  the prompt explicitly instructs Claude to ground every suggestion in the
  actual data provided and not give generic advice. `max_tokens` is capped
  at 1200 as a deliberate cost guardrail, since this runs weekly forever
  once cron'd.
- If the key is missing (still the case in production — see Phase 2's
  note on Anthropic Console billing) — or the call fails or comes back
  empty — it falls back to a plain data rollup (counts by agent, counts by
  insight type, any function with `error_count >= 5` or `last_status =
  'error'`), honestly labeled `"AI reasoning unavailable — showing raw data
  summary"` rather than pretending to be the AI version.
- A genuinely quiet week (zero insights, zero unhealthy functions) skips the
  Claude call entirely and writes a short "nothing to report" summary
  instead — this also covers a brand-new deployment with no data yet, so
  the function never throws on empty tables.
- `record_agent_run` wired in on both the success and error paths, same
  pattern as every other Phase 2/3 function.

**Known limitation — honest, not hidden: no delivery channel yet.** This
report has no Slack/email delivery in this phase. It is stored only in
`agent_council_reports` — to read it today you query the table directly
(Supabase Table Editor, or `select * from agent_council_reports order by
created_at desc limit 1`). Phase 5 is expected to add a dashboard UI to
actually display it; until then this is intentionally a storage-only
report, not a delivered one.

Schema: `supabase_schema_delta_agent_council.sql` (new
`agent_council_reports` table). Run order:
```bash
# 1. Run supabase_schema_delta_agent_council.sql in the Supabase SQL Editor
# 2. Deploy the new function
supabase functions deploy agent-council-report
# 3. Run supabase_schema_delta_agent_council_cron.sql in the Supabase SQL Editor
```

## Agent Operating System — Phase 5 (Agent Dashboard UI)

Phase 5 is the final phase of the 5-phase build. It adds a read-only
**Agents** tab to `DispatcherView.jsx` (`src/pages/DispatcherView.jsx`) —
the console every Minerva business owner already uses — that finally gives
`agent_council_reports` (storage-only since Phase 4) an actual UI, and
surfaces `agent_functions` / `agent_insights` in one place instead of
requiring a raw SQL query. No new tables, columns, or edge functions —
everything this tab reads was already created in Phases 1–4.

**Gating decision — read this before wondering why the tab isn't visible.**
`agent_functions`, `agent_insights`, and `agent_council_reports` are all
platform-wide (not scoped to `business_id` — `agent_council_reports` has no
`business_id` column at all, and the Phase 4 header comment explicitly says
that report is "FOR THE MINERVA OPERATOR, not for a customer"). Showing that
cross-tenant data by default inside a random trade business's day-to-day
dispatcher console would be confusing at best (a plumber wondering why
they're seeing "outreach agent" error counts for the whole platform) and a
quiet violation of the spirit of tenant isolation at worst — even though
(see `SECURITY_NOTES.md`) the underlying RLS policies on these three tables
are already anon-select-all, the same permissive pattern as every other
table in this app, so gating the UI doesn't change what's technically
readable at the database layer. It changes what's *shown by default*.
Given that, the tab is gated behind an explicit `?agents=1` URL query
param on the dispatch link (e.g. `/dispatch/<businessId>?agents=1`) — a
"AGENTS" tab button (labeled "Agent Ops (operator only)") only renders when
that param is present. This is intentionally lightweight (no new auth
system, no hardcoded business ID check — this app has no login at all, see
`SECURITY_NOTES.md` "The model: unguessable links, not logins") but it does
the one thing that matters here: a business owner using their normal
dispatch link never sees this tab or even knows it exists. Only someone
who's been told to append `?agents=1` (i.e. the Minerva operator, on their
own bookmarked link) sees it. This is a UX/product gate, not a security
boundary — see `SECURITY_NOTES.md` for the explicit note tying this back to
the already-accepted anon-RLS tradeoff.

**What the tab shows:**
- A summary strip: `agent_functions` counts grouped by `agent`
  (`outreach`/`marketing`/`scheduling`/`finance`/`core`), plus `research`
  and `design` shown explicitly as "0 — not yet built" (no seed rows exist
  for either yet, per Phase 1) rather than silently omitted, an unhealthy-
  function count (`error_count >= 5` or `last_status = 'error'`), and a
  count of `agent_insights` written in the last 7 days.
- The full `agent_functions` list, unhealthy rows first then alphabetical
  by agent, each with a status badge (ok=green/error=red/unknown=amber —
  same color convention as `IndustrialDispatcherView.jsx`'s `statusBadge`),
  last run time (via the existing `timeAgo` helper from `src/utils.js`),
  and error count when non-zero.
- A recent `agent_insights` feed — last 7 days, newest first, capped at 20
  rows — agent badge, insight type, summary, relative timestamp.
- The most recent `agent_council_reports` row (summary text, week range,
  functions-checked/insights-reviewed/unhealthy-count stats), or — if the
  weekly cron hasn't produced its first row yet — a plain "No report yet —
  first one lands <next Monday's date>" empty state instead of a blank
  panel.
- All three queries are lazy: they only fire the first time the tab is
  opened (`useEffect` keyed on `queueTab === 'agents'`, guarded by an
  `agentDataLoaded` flag), not on every `DispatcherView` mount — same
  instinct as the existing lazy checklist-photo/materials load in
  `toggleJobDetails`.

**Fully wired end-to-end after this phase:**
`agent_council_reports` now has a real UI (previously SQL-only). The full
Phase 1–5 loop — health tracking → insight writing → weekly synthesis →
human-readable dashboard — is complete and viewable in one place for the
first time.

**Known follow-up, deliberately not built this phase**: at the time Phase 5
shipped, this was a **read-only** dashboard — `agent_functions.enabled` (the
Phase 1 kill-switch column) wasn't read by any edge function yet, so an
enable/disable toggle would have done nothing. **This has since been built**
(2026-09-02/03, separate from Phase 5): the Agents tab now has a working
enable/disable toggle per function, and all 11 gated edge functions check
`agent_functions.enabled` at the top of every run and skip early when
disabled. See `SECURITY_NOTES.md` for the one caveat that comes with
this — `agent_functions` rows aren't `business_id`-scoped, so anyone who
knows to add `?agents=1` can disable another business's agents, not just
their own.

---

## Minerva Max batch (2026-09-04)

Six additions built from data Minerva already collects, or from self-serve
integrations with no partnership/licence gate — explicitly NOT the
escrow/invoice-financing, SOC 2 certification claim, or covert
BLE/UWB-tracking ideas discussed and declined (those require an Australian
Credit Licence, an actual third-party audit, and raise Privacy Act 1988 /
surveillance-device-law concerns respectively — see chat history, not
built). Deploy after running `supabase_schema_delta_minerva_max.sql`, then
`supabase functions deploy <name>` for each, then
`supabase_schema_delta_minerva_max_cron.sql` for the 3 cron ones.

- **Predictive maintenance** (`predict-asset-maintenance`, daily cron) —
  upgrades `monitor-asset-telemetry`'s reactive threshold check into a real
  trend projection: computes each asset's actual engine-hours-per-day
  usage rate from its last 14 days of telemetry pings, and flags any asset
  projected to cross its maintenance threshold within 7 days. Simple linear
  math on this business's own real data — not a cross-client failure model
  (not enough data volume for that to mean anything yet, and this build
  never shares one business's data with another's).
- **AI-verified → ready-to-invoice signal** (`verify-checklist-photos`
  extended, `jobs.ai_verified_at` / `invoices.ai_verified`) — once every
  checklist photo on a job has been AI-reviewed (Watchtower) and none are
  flagged, the job is marked AI-verified and the badge carries through to
  the invoice, shown to both the dispatcher and the client on
  `InvoiceView.jsx`. This is the same photo-plausibility check Watchtower
  already does, rolled up to job level — not blueprint/BIM
  cross-referencing (no BIM data source exists in this build).
- **Carbon/ESG estimate** (`estimate-job-carbon`, daily cron, new
  **Carbon Est.** tab) — chains a technician's completed-job locations for
  the day and estimates transit CO2-e using a static reference vehicle
  emissions factor. Explicitly labelled as an estimate everywhere it's
  shown: straight-line distance (not road routing), transit-only (no
  materials/embodied-carbon component, since there's no live supplier API
  to source an Environmental Product Declaration from), and the CSV export
  includes a "Factor Basis" column so the constant can be checked against
  the current published NGA Factors workbook before it's attached to a
  real tender.
- **Ghost/idle-asset detection** (`detect-idle-assets`, daily cron) —
  flags active industrial assets with no telemetry ping in 14+ days.
- **Subcontractor pool** (new **Subcontractors** tab, `subcontractors`
  table) — dispatch can assign a job to an external subcontractor
  alongside employed technicians (`jobs.assigned_subcontractor_id`,
  separate from `technician_id` so payroll/hours logic stays
  employee-only). `auto-assign-technician` now falls back to the nearest
  active subcontractor when no employed technician is free, instead of
  leaving the job unassigned.
- **Xero OAuth integration** (`xero-oauth-connect`, `xero-oauth-callback`,
  `xero-sync-invoice`, "Connect Xero" in Settings) — a real OAuth 2.0 flow
  against Xero's actual API, not a mock. Needs the business owner to
  register a free app at developer.xero.com and the operator to set
  `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET`/`SUPABASE_SERVICE_ROLE_KEY`
  secrets — until then, "Connect Xero" returns a 501 with setup
  instructions instead of pretending to connect. Tokens are stored in
  `integration_credentials`, a table deliberately NOT covered by this
  app's usual anon-all RLS policy — only `service_role` can read/write it,
  since these are real third-party credentials, unlike the rest of this
  build's demo-style data. Synced invoices land in Xero as **DRAFT**, not
  auto-sent, since Minerva has no way to know the business's preferred
  chart-of-accounts mapping beyond a best-effort default.

**On "Minerva Max" as a $500/technician/month tier**: not priced or
positioned yet. The ROI case for a premium tier should be built from real
pilot-customer before/after numbers once one of the six items above is in
front of an actual mid-market business, not from a hypothetical model.

---

## Round-2 batch (2026-09-04)

Six more additions, built end-to-end (schema + edge functions + UI). Deploy
after running `supabase_schema_delta_minerva_round2.sql`, then
`supabase functions deploy <name>` for each (`track-review-click` needs
`--no-verify-jwt`), then `supabase_schema_delta_minerva_round2_cron.sql`
for `forecast-demand`'s weekly schedule.

- **Quote-to-job AI estimator** (`draft-quote`, `send-quote-sms`, new
  **Quotes** tab, `QuoteView.jsx`) — a dispatcher describes a job in plain
  text, Claude drafts line items from the business's last 30 invoices
  (falls back to one blank editable line if AI is unavailable — same
  honest-fallback pattern as `chase-unpaid-invoices`), the dispatcher edits
  and sends. The client can Accept/Decline directly on their own quote —
  that's a status update on their own row, not an outbound message, so it
  doesn't need the Sales & Marketing human-approval gate that sending does.
- **Multi-technician job splitting** (`job_assignments` table, crew UI in
  the Jobs tab, lead/crew gating in `TechnicianView.jsx`) — a job keeps one
  "lead" (`jobs.technician_id`, unchanged, still drives payroll/GPS/hours),
  and dispatch can add extra "crew" technicians who get the same job pushed
  to their `current_job_id` (that's what makes `TechnicianView` show it to
  them at all) but only see a reduced track-only view — starting, completing,
  checklist, materials, and invoicing all stay lead-only. Crew members get a
  self-service "Leave job" button.
- **Customer review/reputation loop** (`send-review-request-sms`,
  `track-review-click` — public, `--no-verify-jwt`, records first click then
  redirects — Settings "Google review link" field, "Request review" button
  on paid invoices) — same per-message human-approval-gate discipline as
  every other Sales & Marketing send.
- **Seasonal demand forecasting** (`forecast-demand`, weekly cron, Jobs tab
  banner) — buckets each business's own job history by `client_address`
  into the last 4 weekly buckets and flags addresses where the last 2
  weeks are trending up vs the 2 weeks before. This is trend arithmetic on
  a noisy proxy for suburb (jobs has no dedicated suburb column), not a
  trained forecasting model — labelled as such in the insight text itself.
- **Emergency callout surge-pricing suggestion** (invoice builder in
  `TechnicianView.jsx`) — for jobs flagged `urgency: 'emergency'`, one tap
  adds a deterministic time-of-day/day-of-week premium as a normal
  editable/removable invoice line item. Never auto-applied, never a live
  demand model — just a starting-point suggestion the technician can edit
  or delete before sending.
- **Client portal job-history page** (`client_portal_links` table,
  `ClientHistoryView.jsx`, "View your service history" button on
  `TrackingView.jsx`'s job-complete screen) — a read-only list of a client's
  own past jobs and invoices for one business, reached via an opaque
  random-token URL (not the client's phone number) upserted once per
  business/client-phone pair so repeat visits reuse the same link.

---

## Minerva Max add-on tier (2026-09-04)

Monetization layer on top of the Minerva Max batch + Round-2 batch above —
no new features, just per-business, per-addon gating so those features are
individually salable rather than always-on freebies bundled into base
pricing. Deploy `supabase_schema_delta_minerva_max_tier.sql`, then
redeploy `forecast-demand`, `predict-asset-maintenance`,
`detect-idle-assets`, `send-review-request-sms`, `xero-sync-invoice`, and
`xero-oauth-connect` (all five now check the relevant addon flag).

- **9 add-ons** (`src/maxAddons.js` is the single source of truth for the
  catalog + prices): Emergency Surge Pricing, AI Quote Drafting, Multi-Tech
  Job Splitting, Review Request Loop, Demand Trend Alerts, Subcontractor
  Pool, Asset Intelligence (predictive maintenance + idle-asset detection),
  Carbon/ESG Estimate, Xero Sync.
- **Per-addon enable or 30-day free trial** — `businesses.max_addons` /
  `businesses.max_addon_trials` (jsonb). No bundled "Minerva Max" on/off
  switch by design — see product discussion this session on why a cold
  $300-500/mo ask doesn't convert, vs. proving value addon-by-addon first.
- **Usage-triggered upsell nudges** (new **MAX** tab in `DispatcherView`) —
  computed from this business's own data, not a generic pitch: unclaimed
  after-hours premium $ across real emergency jobs, open leads with zero
  quotes sent, paid invoices with no review requests sent, unassigned jobs
  with no subcontractor pool, etc. Each nudge is dismissible
  (`upsell_nudge_dismissals` table) so it doesn't reappear every session.
- **Gating is enforced on both ends**: the frontend hides/locks gated UI
  (`hasAddon()` from `src/maxAddons.js`), and the corresponding edge
  functions independently check the same flag server-side before doing any
  work or sending anything — so a locked feature can't be triggered by
  calling the function directly.
- **Honest scope note**: this is feature-gating + trial-tracking
  infrastructure only. It does NOT wire real Stripe billing for these
  add-ons — enabling/trialing one here just flips a flag. Real recurring
  per-addon billing needs its own explicit Stripe walkthrough (new Prices,
  subscription-item add/remove), same boundary as the base-tier Stripe
  setup.

---

## Testing checklist (Day 7 — before first client call)

Run through this on TWO real devices (your phone + your laptop):

- [ ] Open `/start` → complete onboarding form → Stripe checkout loads
- [ ] Use Stripe test card `4242 4242 4242 4242` (any future expiry, any CVV)
- [ ] Success page loads and shows dispatch link
- [ ] Technician receives setup SMS with their unique link
- [ ] Technician opens link on phone → GPS permission appears → they tap Allow
- [ ] Technician dot appears on dispatcher map at correct location
- [ ] Walk 10 metres → dot moves on dispatcher map within 15 seconds (no refresh)
- [ ] Add a test job with your home address as client address
- [ ] Walk within 2km of home address → client SMS arrives with tracking link
- [ ] Open tracking link → see technician dot → walk further → dot updates
- [ ] Tap Complete Job → job status updates to "complete" in dispatcher view
- [ ] Client receives a "job complete" SMS after Complete Job is tapped
- [ ] Turn on flight mode on the technician's phone for ~1 min while tracking →
      an "Offline - X pending" badge appears; turn flight mode back off → badge
      clears and the dispatcher map catches up with the latest position
- [ ] On the current job card, tap "Add voice note" (Chrome/Android only —
      button is hidden on browsers without Web Speech API support), speak a
      short note → transcribed text appears appended to the job's notes
- [ ] Call the business's Twilio number and let it go unanswered → caller
      receives the "missed you" auto-reply SMS

**All tiers** (no tier gate in code — works on Starter too):
- [ ] Dispatcher → "+ Add" a technician from the sidebar → they receive a setup SMS
- [ ] Jobs tab / Leads tab → Export CSV → files download with correct data

**Pro tier only** (sign up with the Pro plan to test these):
- [ ] Dispatcher → set up a completion checklist → add 2-3 items → save
- [ ] Technician → complete a job → checklist appears → "Continue" is disabled
      until every item is ticked
- [ ] Technician → after the checklist, add an invoice line item → tap
      "Send Invoice" → client receives an SMS with the invoice link
- [ ] Open the invoice link → totals (subtotal, 10% GST, total) are correct
- [ ] Dispatcher → Invoices tab → tap "Mark paid" → status updates
- [ ] Dispatcher → Assets tab → add an asset → assign it to a technician
- [ ] Have the technician open their tracking link and start tracking →
      confirm the Stripe subscription quantity updates (Stripe Dashboard →
      Subscriptions → the business's subscription → quantity)
- [ ] Dispatcher → set up a technician onboarding checklist → new technician
      opens their link and taps "Start Tracking" for the first time →
      checklist appears before tracking starts → ticking all items and
      continuing starts tracking normally → reopening the link later does
      NOT show the checklist again
- [ ] Dispatcher → Inventory tab → add an item with a reorder threshold
      above its starting quantity → confirm it's flagged "LOW STOCK"

**Autonomous layer** (only if you ran the pg_cron setup block):
- [ ] Dispatcher → Settings → paste a Slack webhook URL → save → capture a
      test lead via the intake widget → alert appears in Slack
- [ ] Dispatcher → Settings → copy calendar link → subscribe in Google/Apple
      Calendar → a scheduled job appears on the calendar
- [ ] Dispatcher → Settings → enable auto-dispatch → add a job with a free,
      connected technician nearby → job is auto-assigned within a few
      seconds (check Slack for the dispatch alert)
- [ ] Invoices tab → Export CSV → file downloads with correct totals
- [ ] `retention-checkin`, `reconcile-billing`, `check-inventory-levels`,
      `generate-growth-drafts` are scheduled agents — hard to trigger
      manually with real 30-90 day data, so verify these by invoking each
      function directly once from the Supabase Dashboard (Edge Functions →
      function → "Invoke") and confirming it returns
      `{ "success": true, ... }` with no error
- [ ] Dispatcher → Marketing tab → after `generate-growth-drafts` has run
      at least once, a draft card appears → tap Reject on one → status
      updates to REJECTED and the pending badge count drops
- [ ] Dispatcher → Settings → paste Meta access token / ad account ID /
      Page ID for a test ad account → save → approve an `ad_campaign` draft
      → confirm a PAUSED campaign appears in Meta Ads Manager for that
      ad account (do this with a real or sandbox ad account, not a live
      spending one, until you're confident in the flow)
- [ ] Approve an `outreach_sms` draft → confirm the SMS arrives on the
      test lead's phone and the draft's status updates to SENT

**Do not call a single client until every checkbox above is ticked.**

---

## File structure

```
minerva/
├── src/
│   ├── App.jsx                    # Router — all page routes
│   ├── main.jsx                   # React entry point
│   ├── index.css                  # Global styles
│   ├── supabaseClient.js          # Supabase singleton
│   ├── utils.js                   # Haversine, geocoding, PIN generator
│   └── pages/
│       ├── LandingPage.jsx        # Public marketing page
│       ├── Onboarding.jsx         # Business + technician signup, tier selection
│       ├── SuccessPage.jsx        # Post-Stripe confirmation
│       ├── DispatcherView.jsx     # Live map dashboard (owner) — jobs, leads,
│       │                          #   Pro tier: assets, invoices, checklist mgmt
│       ├── TechnicianView.jsx     # Mobile tracking page (technician) — Pro tier:
│       │                          #   completion checklist + invoice builder
│       ├── TrackingView.jsx       # Client-facing tracking link — also shows the
│       │                          #   post-job "Request this again" rebooking button
│       ├── InvoiceView.jsx        # Client-facing invoice view (Pro tier)
│       ├── IntakeAssistant.jsx    # AI lead-triage chat widget (embedded on client sites)
│       ├── DisputeView.jsx        # BONUS: read-only Dispute Pack (GPS route, photos,
│       │                          #   materials, invoice) for a single job
│       └── IndustrialDispatcherView.jsx # Track B: industrial sector console
│                                  #   (leads, sites, assets, inventory, safety, verification)
├── supabase_schema.sql            # Run this in Supabase SQL Editor first
├── supabase_schema_delta_agent_expansion.sql # Track A: workflows, incidents, photo verification, lost-lead winback
├── supabase_schema_delta_industrial.sql      # Track B: industrial sector tables
├── supabase_schema_delta_agent_cron.sql      # Cron schedules for both tracks' new functions
├── supabase/
│   └── functions/
│       ├── send-eta-sms/          # Fires the 15-min client SMS
│       ├── send-setup-sms/        # Fires technician setup SMS on onboarding
│       ├── send-completion-sms/   # Fires the "job complete" client SMS
│       ├── send-invoice-sms/      # Fires the invoice link SMS (Pro tier)
│       ├── send-job-assignment-sms/ # Fires assignment/reassignment SMS to the technician (2026-09-04)
│       ├── missed-call-webhook/   # Twilio Voice webhook: TwiML + missed-call SMS auto-reply
│       ├── create-checkout-session/ # Creates Stripe checkout (tier + quantity aware)
│       ├── sync-technician-billing/ # Syncs Stripe subscription quantity to connected technicians
│       ├── stripe-webhook/        # Handles checkout.session.completed / subscription.deleted
│       ├── ai-intake-chat/        # AI lead-triage chat backend (Claude)
│       ├── notify-slack/          # Generic Slack alert poster (internal helper)
│       ├── calendar-feed/         # Public ICS feed of scheduled jobs
│       ├── nurture-stale-leads/   # Agent: SMS nudge for leads sitting untouched (hourly) + 2nd touch at 24h
│       ├── chase-unpaid-invoices/ # Agent: payment reminder SMS for unpaid invoices (daily)
│       ├── auto-assign-technician/ # Agent: assigns nearest tech to new jobs (event-driven)
│       ├── daily-digest/          # Agent: daily Slack activity summary + "waiting on you" nudges + silent-lead/stuck-invoice escalation flags
│       ├── retention-checkin/     # Agent: post-job "need anything else?" SMS (weekly)
│       ├── reconcile-billing/     # Agent: Stripe vs local technician-count drift alert (daily)
│       ├── check-inventory-levels/ # Agent: low-stock Slack alerts (daily)
│       ├── generate-growth-drafts/ # Agent: drafts ad campaigns + win-back SMS (weekly) — WRITES ONLY
│       ├── launch-ad-campaign/    # Click-only: launches an approved ad_campaign draft via Meta API
│       ├── send-growth-message/   # Click-only: sends an approved outreach_sms draft via Twilio
│       ├── check-credential-expiry/ # Agent: licence/ticket expiry Slack alerts (daily), Pro tier
│       ├── send-review-request-sms/ # Fire-and-forget: review-request SMS + trackable link
│       ├── track-review-click/    # Public redirect: logs a review-link click, then forwards to the real review URL
│       ├── detect-wasted-trips/   # Agent: GPS-confirmed no-show detection (every 15 min)
│       ├── check-weather-risk/    # Agent: forecast-risk drafts for weather-sensitive jobs (daily) — WRITES ONLY
│       ├── send-weather-reschedule-sms/ # Click-only: sends an approved weather reschedule draft via Twilio
│       ├── send-referral-code-sms/ # Fire-and-forget: referral code + SMS on invoice paid
│       ├── update-technician-workload/ # Agent: burnout-hours + emergency-count roster signals (daily)
│       ├── verify-checklist-photos/ # Track A: Watchtower — AI photo verification (every 15 min)
│       ├── run-custom-workflows/  # Track A: general-purpose trigger→condition→action workflow agent
│       ├── winback-lost-leads/    # Track A: re-engagement SMS for leads marked lost (daily)
│       ├── draft-quote/           # Minerva Max (ai_quotes): AI-drafted quote text — WRITES ONLY
│       ├── send-quote-sms/        # Minerva Max (ai_quotes): sends an approved quote link via Twilio
│       ├── forecast-demand/       # Minerva Max (demand_forecast): weekly booking-volume projection (weekly)
│       ├── estimate-job-carbon/   # Minerva Max (carbon_estimate): daily transit CO2-e estimate per technician
│       ├── predict-asset-maintenance/ # Minerva Max (asset_intelligence): linear-projection maintenance forecast (daily)
│       ├── detect-idle-assets/    # Minerva Max (asset_intelligence): "ghost asset" no-telemetry detector (daily)
│       ├── xero-oauth-connect/    # Minerva Max: starts the Xero OAuth flow for a business
│       ├── xero-oauth-callback/   # Minerva Max: completes Xero OAuth, stores tokens
│       ├── xero-sync-invoice/     # Minerva Max: pushes a paid invoice to the business's connected Xero org
│       ├── agent-council-report/  # System: cross-agent digest of recent agent_insights (on-demand)
│       ├── test-agent-health/     # System: pings agent_functions rows vs. actual recorded runs (on-demand)
│       ├── industrial-conductor/  # Track B: Central Conductor — asset suggestion for new leads
│       ├── harvest-industrial-leads/ # Track B: bulk industrial lead ingestion webhook
│       ├── enrich-industrial-leads/  # Track B: Signal & Enrich — missing-contact-data nudge (daily)
│       ├── monitor-asset-telemetry/  # Track B: real-time asset ingestion + geofence/maintenance alerts
│       ├── optimize-industrial-routes/ # Track B: Route Optimizer — nearest-asset suggestions (every 30 min)
│       ├── track-consumables/     # Track B: Quartermaster — low-stock flag (hourly)
│       ├── detect-safety-hazards/ # Track B: The Warden — proximity-hazard sweep (every 15 min)
│       ├── sequence-handoffs/     # Track B: The Pacer — handoff-sequencing sweep (every 15 min)
│       ├── package-client-verification/ # Track B: The Closer — sign-off evidence packaging (on-demand)
│       └── verify-industrial-compliance/ # Track B: Sentry — 24h+ safety escalation backstop (hourly)
├── index.html
├── package.json
├── vite.config.js
├── COMPLIANCE_TEMPLATES.md        # Disclaimed compliance/legal doc templates
└── .env.local.example             # Copy to .env.local and fill in your values
```

---

## Pricing
- **Starter**: $49/technician/month — GPS map, ETA SMS, job start/complete
- **Standard**: $79/technician/month — everything + dispatch board, job scheduling, history
- **Pro**: $119/technician/month — everything + on-site invoicing (with client SMS + payment status
  tracking), asset tracking, and compliance checklists

Tier is chosen at signup (`Onboarding.jsx`) and drives which Stripe price is
charged (`create-checkout-session`) and which features render in the
dispatcher/technician views. Billed quantity auto-adjusts to the number of
technicians actually connected — see `sync-technician-billing` above.

- **Minerva Max add-ons**: $19-59/month each, layered on top of any tier —
  see "Minerva Max add-on tier" above. Not real Stripe-billed yet (see that
  section's honest-scope note); enabling one from the MAX tab just flips a
  flag today.

---

## Support
Built and maintained by [Your name] | [Your mobile] | [Your email]
