# Minerva — Deploy Runbook (everything queued behind the git push blocker)

Generated 2026-10-08, from a direct `git diff origin/main..HEAD` — this is the
complete, accurate picture as of this file's own commit, not a list
reconstructed from memory. 73 local commits are ahead of `origin/main`, none
of them live yet: not pushed to GitHub (so Vercel hasn't built any of the
frontend changes), no SQL delta run, no edge function redeployed.

**How to use this**: once `git push origin main` actually works (see
`minerva_github_push_credential` memory for the fix — this needs you, in an
interactive terminal, once), work through the 4 phases below **in order**.
Phase order matters — some SQL deltas explicitly depend on an earlier phase
(each file's own header says so; this list just saves you from having to
open all 16 to figure out the order yourself). Re-generate this list instead
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

## Phase 3 — Edge functions: redeploy all 27

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

New functions this session (never deployed before, so there's no existing
dashboard setting to preserve):
- `notify-new-support-request`, `notify-new-enterprise-lead`,
  `notify-rebooking-request`, `recover-abandoned-signup`,
  `new-subscriber-checkin` — all 5 are `supabase.functions.invoke()`-style
  or cron-triggered, matching the pattern of their siblings; default
  `verify_jwt: true` is correct for all 5 unless you specifically know
  otherwise.

Full list (alphabetical):

```
agent-council-report
ai-intake-chat
auto-assign-technician
check-credential-expiry
client-support-chat
create-invoice-payment-intent
daily-digest
detect-safety-hazards
draft-outreach-batch
draft-quote
followup-outreach
generate-growth-drafts
industrial-conductor
new-subscriber-checkin
notify-new-enterprise-lead
notify-new-support-request
notify-rebooking-request
parse-prospect-text
reconcile-billing
recover-abandoned-signup
respond-to-quote
sequence-handoffs
stripe-webhook
technician-login
update-addon-billing
update-technician-workload
verify-checklist-photos
voice-intake-agent
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

Both files are pre-filled with the real project ref/anon key already (per
their own header comments) — no placeholder values to fill in.

## Verification after all 4 phases

- `supabase_schema_delta_businesses_secret_columns.sql`'s own trailing
  comment has the exact `curl` command to confirm the security fix took
  effect (expect `42501 permission denied`, not real secret values back).
- `select name, cron, command from cron.job order by jobid;` in the SQL
  Editor — confirms both new cron jobs registered with the schedule each
  file's own header documents.
- `supabase functions list` — confirms all 27 functions show `ACTIVE`, and
  spot-check a couple of version numbers moved (old version → new).

## What this file does NOT cover

The 4 bank-account-gated dashboards, the 9 Minerva Max add-on prices, the
hosting-plan check, and outreach-sending readiness (`RESEND_FROM_EMAIL`) —
all tracked separately in the
[Go-Live Checklist artifact](https://claude.ai/artifact/54Lg79b3YZ9zSJ7wUtX2rT)
and `DEPLOYMENT_CHECKLIST_PENDING.md`'s "Still outstanding" section. Those
are dashboard/account actions, independent of this file's code-deploy
sequence — can be done before, during, or after working through the 4
phases above in any order.
