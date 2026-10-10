# Minerva — Deploy Runbook (everything queued behind the git push blocker)

Generated 2026-10-08, last refreshed 2026-10-10 against a direct
`git diff origin/main..HEAD` — this is the complete, accurate picture as of
this file's own commit, not a list reconstructed from memory. 100+ local
commits are ahead of `origin/main` as of this refresh (check `git log
--oneline origin/main..HEAD | wc -l` for the exact current count — it
keeps moving every session, don't trust a hardcoded number here), none
of them live yet: not pushed to GitHub (so Vercel hasn't built any of
the frontend changes), no SQL delta run, no edge function redeployed.

**How to use this**: once `git push origin main` actually works (see
`minerva_github_push_credential` memory for the fix — this needs you, in an
interactive terminal, once), work through the 4 phases below **in order**.
Phase order matters — some SQL deltas explicitly depend on an earlier phase
(each file's own header says so; this list just saves you from having to
open all 25 to figure out the order yourself). Re-generate this list instead
of trusting it if much more time passes and more commits stack up — it's a
snapshot, not a live view.

If this file itself hasn't been pushed yet when you read it, that's fine —
read it straight from your local checkout.

## Phase 0 — push

```bash
git push origin main
```

Vercel auto-deploys the frontend from this on its own — no separate action
needed for anything in `src/`. Everything below is the backend (Supabase)
half, which Vercel can't do for you.

## Phase 1 — SQL: base/column-adding deltas (any order, run first)

Paste each into the Supabase SQL Editor. None of these depend on each other.

- `supabase_schema_delta_business_abn.sql` — adds `businesses.abn`
- `supabase_schema_delta_invoice_refunded.sql` — adds `invoices.refunded_at`
- `supabase_schema_delta_businesses_secret_columns.sql` — **the security
  fix**: revokes anon SELECT on 3 secret-bearing columns. See its own file
  and `SECURITY_NOTES.md`'s matching entry for why this one matters most.
- `supabase_schema_delta_scale_readiness_indexes.sql` — 2 missing indexes
- `supabase_schema_delta_subscription_tier_sync_guard.sql` — **new
  2026-10-08, the billing-correctness fix**: adds
  `businesses.subscription_tier_synced_at`. See its own file and
  `BILLING_INTEGRITY_NOTES.md`'s matching entry — closes an out-of-order
  webhook-delivery gap that could silently resurrect a cancelled
  business's paid tier. `stripe-webhook` (already in Phase 3's redeploy
  list below) depends on this column existing, so run this before
  redeploying that function, not after.
- `supabase_schema_delta_checkout_hijack_guard.sql` — **new 2026-10-08,
  the security fix**: adds `businesses.checkout_token` + revokes anon
  SELECT on it. See its own file and `SECURITY_NOTES.md`'s "Residual gap
  in the 2026-09-27 checkout-hijack fix" entry. `create-checkout-session`
  (already in Phase 3's redeploy list below, and now has a `logic.ts`
  sibling for the first time) depends on this column existing, so run
  this before redeploying that function too.
- `supabase_schema_delta_addon_sector_guard.sql` — **new 2026-10-09,
  supersedes the never-deployed `..._asset_intelligence_sector_guard.sql`
  (deleted, don't look for it)**: adds 1 trigger, no new column, covering
  all 9 Minerva Max add-ons' sector restrictions instead of just
  asset_intelligence's. See its own file and `BILLING_INTEGRITY_NOTES.md`'s
  "Asset Intelligence" and "8 of 9 Max add-ons" entries — a business on
  the wrong sector could pay for an add-on that structurally can never
  work for them, in either direction. No ordering dependency on any
  function redeploy, but `update-addon-billing` (already in Phase 3's
  list) has the matching application-level fix, so deploy them together
  rather than leaving a gap between the two layers.
- `supabase_schema_delta_billing_identity_guard.sql` — **new 2026-10-09**:
  adds 1 trigger, no new column. See its own file and
  `SECURITY_NOTES.md`'s matching 2026-10-09 entry — until this runs, any
  logged-in business owner can PATCH their own `subscription_tier`/
  `max_addons` directly and get every paid feature for free, no Stripe
  charge, permanently. No ordering dependency on any function redeploy
  (pure database trigger, nothing in the edge functions or frontend
  changes).
- `supabase_schema_delta_businesses_select_scoping.sql` — **new
  2026-10-10, the single most important one on this list**: 2 policies +
  a column grant/revoke, no new column. See its own file and
  `SECURITY_NOTES.md`'s matching entry — until this runs, any logged-in
  business owner can read every OTHER business's full row (contact
  details, subscription tier, Stripe ids, payment-failed status), not
  just their own. Broader than the billing-identity gap above (that one
  was self-escalation; this one is reading every other customer's data).
  Pairs with a frontend change already committed
  (`TechnicianView.jsx`'s `businesses(*)` narrowed to an explicit field
  list) — ships with the next normal push/Vercel deploy, no separate
  action needed for that half. Run this and the billing-identity trigger
  before any real customer signs up, not after.
- `supabase_schema_delta_technician_site_assignment.sql` — **new
  2026-10-10**: 1 new column (`technicians.current_site_id`) + 3 RLS
  policies, no edge function changes. See its own file and
  `BILLING_INTEGRITY_NOTES.md`'s matching entry — without this,
  `TechnicianView.jsx`'s new industrial site card (same commit) and
  `IndustrialDispatcherView.jsx`'s new site-assignment UI (same commit)
  are both already shipped in the frontend but every read/write they do
  will silently fail RLS the moment an industrial business actually uses
  them — run this before that frontend change reaches production, not
  after. No function redeploy needed, this is a pure schema+RLS change
  paired with a frontend-only commit.
- `supabase_schema_delta_verification_package_view.sql` — **new
  2026-10-10**: 1 new anon SELECT policy on
  `client_verification_packages`, no new column. See its own file and
  `BILLING_INTEGRITY_NOTES.md`'s matching "follow-on" entry — without
  this, the new `/verification/:packageId` page
  (`VerificationPackageView.jsx`, same commit) will correctly render its
  "invalid link" error state for every real package too, since anon has
  no read access yet. Run before that frontend change reaches
  production. No function redeploy needed.
- `supabase_schema_delta_incoming_sms_webhook.sql` — **new 2026-10-11**:
  1 new table (`processed_sms_sids`), no new column. See its own file
  and `BILLING_INTEGRITY_NOTES.md`'s matching entry — needed before
  `incoming-sms-webhook` (new function, Phase 3) is deployed, since that
  function's idempotency claim will fail with a missing-table error
  otherwise. Its retention cron is a separate file, Phase 4 below.
- `supabase_schema_delta_outreach_prospects_dedup.sql` — **new
  2026-10-10**: 1 unique index on `outreach_prospects.contact_email`, no
  new column. See its own file and `OUTREACH_INTEGRITY_NOTES.md`'s
  matching entry — stops a re-imported prospect from creating a
  duplicate row that a real unsubscribe click wouldn't cover. No
  ordering dependency on any function redeploy, but `draft-outreach-batch`
  and `parse-prospect-text` (both already in Phase 3's list) now upsert
  against this constraint instead of plain-inserting, so deploy them
  together rather than leaving a gap where the constraint exists but the
  functions still assume plain insert semantics.
- `supabase_schema_delta_signup_recovery.sql` — adds
  `businesses.signup_recovery_sent_at`
- `supabase_schema_delta_new_subscriber_checkin.sql` — adds
  `businesses.founding_checkin_sent_at`
- `supabase_schema_delta_support_request_notify.sql` — adds
  `support_requests.notified_at`
- `supabase_schema_delta_enterprise_lead_notify.sql` — adds
  `big_account_targets.notified_at`
- `supabase_schema_delta_rebooking_notify.sql` — adds
  `leads.rebooking_notified_at`
- `supabase_schema_delta_trial_ending_reminder.sql` — **new 2026-10-09**:
  adds `businesses.trial_ending_reminder_sent_at`. See its own file and
  `BILLING_INTEGRITY_NOTES.md`'s matching entry — the main 7-day account
  trial had no ending-soon reminder, unlike Minerva Max add-on trials.
  `notify-trial-ending` (new function, Phase 3) depends on this column
  existing.

## Phase 2 — SQL: Agent OS registration deltas (after Phase 1, before Phase 3)

Each registers its sibling function with `agent_functions` (health tracking
+ kill-switch). Depend on Phase 1 only within their own family (e.g.
`signup_recovery_registration` doesn't strictly need `business_abn` done
first, just its own `signup_recovery.sql`) — simplest to just do all of
Phase 1 before any of these rather than tracking per-family order.

- `supabase_schema_delta_signup_recovery_registration.sql`
- `supabase_schema_delta_new_subscriber_checkin_registration.sql`
- `supabase_schema_delta_support_request_notify_registration.sql`
- `supabase_schema_delta_enterprise_lead_notify_registration.sql`
- `supabase_schema_delta_rebooking_notify_registration.sql`
- `supabase_schema_delta_trial_ending_reminder_registration.sql` — **new
  2026-10-09**
- `supabase_schema_delta_incoming_sms_webhook_registration.sql` — **new
  2026-10-11**

## Phase 3 — Edge functions: redeploy 51

**Re-generated 2026-10-10 (again)** from `git diff origin/main..HEAD
--name-only` — this list has now gone stale three times in two days
(27 → 46 → 49 → 50), each time from real same-day work landing after the
previous snapshot was written. Don't trust this number either if you're
reading it much later — regenerate the same way:
`git diff origin/main..HEAD --name-only -- supabase/functions/ | grep -E
"/(index|logic)\.ts$" | sed -E 's#supabase/functions/([^/]+)/.*#\1#' |
sort -u`, plus any function that ONLY imports a changed `_shared/` file
without its own index.ts changing (check each shared file's own commit
message/header — e.g. the `_shared/maxAddons.ts` change on 2026-10-09
only actually affected `update-addon-billing`, the one function that
calls `isAddonAvailableForSector`; the other 10 importers only call
`isAddonActive`, unaffected. Same check today for `_shared/sms.ts`'s
`buildEtaMessage` change: 17 functions import something from that file,
but only `send-eta-sms` actually calls `buildEtaMessage` — confirmed by
grepping for the specific call, not just the shared-file import — so it
alone was the addition this round, already captured by the plain
`index.ts`-diff count above since its own `index.ts` changed too).

One command per function:

```bash
npx supabase functions deploy <slug> --project-ref xiikytqxevivrupkljwc
```

**Preserve each function's existing `verify_jwt` setting** (visible in the
Supabase Dashboard → Edge Functions → that function → Details) rather than
guessing — nothing this session changed any function's auth requirement,
only internal logic, so whatever it's currently set to is still correct.
`stripe-webhook` specifically needs `--no-verify-jwt` (Stripe calls it with
no Supabase auth header) — if the CLI prompts about this or defaults
differently, explicitly pass `--no-verify-jwt` for that one only.

New functions (never deployed before, so there's no existing dashboard
setting to preserve):
- `notify-new-support-request`, `notify-new-enterprise-lead`,
  `notify-rebooking-request`, `recover-abandoned-signup`,
  `new-subscriber-checkin`, `notify-trial-ending` (2026-10-09) — all 6
  are `supabase.functions.invoke()`-style or cron-triggered, matching the
  pattern of their siblings; default `verify_jwt: true` is correct for
  all 6 unless you specifically know otherwise.
- `incoming-sms-webhook` (newest, 2026-10-11) is a different shape —
  **needs `--no-verify-jwt`**, same as its sibling `missed-call-webhook`:
  Twilio calls it directly with no Supabase auth header. Also needs its
  own Twilio Console setup per business (README.md's Twilio section,
  step 5) before it does anything — deploying it alone doesn't wire
  anything up.

Full list (alphabetical):

```
agent-council-report
ai-intake-chat
auto-assign-technician
chase-unpaid-invoices
check-credential-expiry
check-inventory-levels
check-weather-risk
client-support-chat
create-checkout-session
create-invoice-payment-intent
daily-digest
detect-idle-assets
detect-safety-hazards
detect-wasted-trips
draft-outreach-batch
draft-quote
enrich-industrial-leads
estimate-job-carbon
flag-abandoned-signups
followup-outreach
forecast-demand
generate-growth-drafts
incoming-sms-webhook
industrial-conductor
new-subscriber-checkin
notify-addon-trial-ending
notify-new-enterprise-lead
notify-new-support-request
notify-rebooking-request
notify-trial-ending
nurture-stale-leads
optimize-industrial-routes
outreach-unsubscribe
parse-prospect-text
predict-asset-maintenance
reconcile-billing
reconcile-technician-state
recover-abandoned-signup
respond-to-quote
retention-checkin
send-eta-sms
send-outreach-batch
sequence-handoffs
stripe-webhook
technician-login
track-consumables
update-addon-billing
update-technician-workload
verify-checklist-photos
voice-intake-agent
winback-lost-leads
```

After each deploy, a quick OPTIONS smoke test is good practice (matches
this project's own established habit per `SECURITY_NOTES.md`):

```bash
curl -i -X OPTIONS "https://xiikytqxevivrupkljwc.supabase.co/functions/v1/<slug>"
```

Expect `200`, not a `5xx` — a `BOOT_ERROR`/503 here means something broke in
that specific deploy and is worth investigating before moving to the next
one, not something to push through.

## Phase 4 — SQL: cron schedules (after Phase 3 — these need the function to already exist)

- `supabase_schema_delta_signup_recovery_cron.sql` — needs
  `recover-abandoned-signup` deployed first
- `supabase_schema_delta_new_subscriber_checkin_cron.sql` — needs
  `new-subscriber-checkin` deployed first
- `supabase_schema_delta_trial_ending_reminder_cron.sql` — **new
  2026-10-09**, needs `notify-trial-ending` deployed first
- `supabase_schema_delta_incoming_sms_webhook_cron.sql` — **new
  2026-10-11**, different dependency shape from the other 3: this is a
  retention-cleanup cron for `processed_sms_sids` (a raw SQL `delete`,
  same pattern as `cleanup-processed-call-sids-daily`), not one that
  calls `incoming-sms-webhook` itself — Twilio invokes that function
  directly, pg_cron never does. Only actually needs the table from
  Phase 1's `supabase_schema_delta_incoming_sms_webhook.sql`, not the
  function deployed — but no harm running it after Phase 3 along with
  the other 3, simplest to just keep all cron files together here.

The first 3 are pre-filled with the real project ref/anon key already
(per their own header comments) — no placeholder values to fill in. The
4th (`incoming_sms_webhook_cron`) needs neither — it's a pure SQL
`delete`, no HTTP call, nothing to fill in either way.
Also don't forget the 2 standalone triggers from today that have no
cron schedule of their own (they fire on `businesses` writes, not on a
timer) — `supabase_schema_delta_addon_sector_guard.sql` and
`supabase_schema_delta_billing_identity_guard.sql` — both already listed
in Phase 1, just noting here so neither gets skipped as "only a Phase 4
thing."

## Verification after all 4 phases

- `supabase_schema_delta_businesses_secret_columns.sql`'s own trailing
  comment has the exact `curl` command to confirm the security fix took
  effect (expect `42501 permission denied`, not real secret values back).
- `select name, cron, command from cron.job order by jobid;` in the SQL
  Editor — confirms all 3 new cron jobs registered with the schedule each
  file's own header documents.
- `supabase functions list` — confirms all 49 functions show `ACTIVE`,
  and spot-check a couple of version numbers moved (old version → new).

## What this file does NOT cover

The 4 bank-account-gated dashboards, the 9 Minerva Max add-on prices, the
hosting-plan check, and outreach-sending readiness (`RESEND_FROM_EMAIL`) —
all tracked separately in the
[Go-Live Checklist artifact](https://claude.ai/artifact/54Lg79b3YZ9zSJ7wUtX2rT)
and `DEPLOYMENT_CHECKLIST_PENDING.md`'s "Still outstanding" section. Those
are dashboard/account actions, independent of this file's code-deploy
sequence — can be done before, during, or after working through the 4
phases above in any order.
