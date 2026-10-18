-- ============================================================
-- MINERVA — Combined Phase 1 SQL deltas (2026-10-18, updated same day
-- with a 21st delta found after the first 20 were combined)
-- All 21 base/column-adding deltas from DEPLOY_RUNBOOK_PENDING.md's
-- Phase 1, concatenated into one paste. Safe to run as a single block —
-- none of these depend on each other (verified by reading each file's
-- own header before combining). Run this ONCE. If anything errors
-- partway through, note which file's banner it was under below, fix
-- that one thing, then re-run just the remaining portion — don't
-- re-run the whole block blindly, most of these use plain 'add column'
-- without 'if not exists' and will error on a second run.
-- ============================================================

-- ============================================================
-- FROM: supabase_schema_delta_business_abn.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: businesses.abn, 2026-10-03.
-- Adds 1 new column only. Run this entire block once in the Supabase SQL
-- Editor.
--
-- What this fixes: InvoiceView.jsx already shows a GST line (Australia's
-- 10% GST) on every invoice, but nothing anywhere captures the trade
-- business's own ABN, and the invoice is titled plain "Invoice", never
-- "Tax Invoice". Under Australian GST law a taxable-supply invoice needs
-- the supplier's ABN and the words "Tax Invoice" to actually function as
-- one — without it, a client (especially a business client) can't
-- properly substantiate a GST credit claim from it. This column is
-- nullable and optional by design (not every business is GST-registered,
-- and existing businesses shouldn't be blocked from using the app while
-- they go find theirs) — InvoiceView only switches to "Tax Invoice"
-- wording and shows the ABN when it's actually been entered.
--
-- Not a substitute for checking with an accountant — the $1,000+
-- recipient-identity requirement and similar edge cases aren't attempted
-- here, see this round's commit message for exactly what is and isn't
-- covered.
-- ============================================================

alter table businesses add column abn text;


-- ============================================================
-- FROM: supabase_schema_delta_invoice_refunded.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: invoices.refunded_at, 2026-10-03.
-- Adds 1 new column only. Run this entire block once in the Supabase SQL
-- Editor.
--
-- What this fixes: stripe-webhook's new charge.refunded handling (see its
-- own header comment) previously only alerted a human — it deliberately
-- did NOT touch invoices.status, since introducing a new lifecycle value
-- needed a real decision about how DispatcherView/InvoiceView should
-- display it first. Now that decision is made: a refunded invoice gets
-- its own status:'refunded', distinct from 'void' (a 'void' invoice was
-- never actually paid; a refunded one genuinely was, then reversed — a
-- business's own bookkeeping cares about that difference, and so does
-- revenue reporting). paid_at is deliberately left untouched when a
-- refund happens — it genuinely was paid at that time, that fact doesn't
-- stop being true; refunded_at is a new, separate fact layered on top,
-- same relationship as voided_at has to the original creation.
-- ============================================================

alter table invoices add column refunded_at timestamptz;


-- ============================================================
-- FROM: supabase_schema_delta_businesses_secret_columns.sql
-- ============================================================
-- ============================================================
-- MINERVA - Delta: lock down secret-bearing columns on `businesses`
-- from the anon role (2026-10-08)
-- Adds no tables. One column-level REVOKE only. Run this entire block
-- once in the Supabase SQL Editor (or via the Management API
-- /database/query, same as every other delta in this project).
--
-- Why: businesses.ingestion_key, meta_access_token, and
-- slack_webhook_url are real secrets (a lead-ingestion bearer key, a
-- live Meta/Facebook Marketing API OAuth token, and a Slack Incoming
-- Webhook URL respectively — see this table's own column comments in
-- supabase_schema.sql and SECURITY_NOTES.md's "The model" section),
-- but `businesses` has carried a blanket `using (true)` SELECT policy
-- since the original schema, for reasons that are still valid for the
-- OTHER ~25 columns on this table: too many legitimate anonymous
-- readers (the public intake widget, the post-checkout success page,
-- onboarding pre-login) to scope the table itself without breaking
-- them, per SECURITY_NOTES.md's "Phase 2 priority" section. That
-- reasoning never actually applied to these 3 columns specifically —
-- grep of every `.from('businesses')` call in src/ confirms no
-- legitimate anon-context caller (IntakeAssistant.jsx, SuccessPage.jsx,
-- Onboarding.jsx's insert) ever selects any of the three. This closes
-- that column-level gap without touching row-level access at all: a
-- `REVOKE SELECT (columns)` affects only which COLUMNS the `anon` role
-- may read, not which ROWS — every existing anon-context feature that
-- reads a business by id keeps working exactly as before.
--
-- Scoped to `anon` only, deliberately — `authenticated` keeps full
-- column access, since the business owner's own dispatcher console
-- (DispatcherView.jsx / IndustrialDispatcherView.jsx, both gated by
-- RequireBusinessAuth) legitimately needs to read back its OWN
-- ingestion_key/meta_access_token/slack_webhook_url to display and let
-- the owner manage them (see "regenerate ingestion key" and the
-- Settings modal). This does NOT close the narrower, already-documented
-- residual gap where any OTHER logged-in user (not the true owner) who
-- knows/guesses a businessId could still read these 3 columns via a
-- direct API call, bypassing RequireBusinessAuth's client-side-only
-- ownership check — that's the same "businessId is the boundary, not
-- login" tradeoff SECURITY_NOTES.md's "Phase 2 priority" section already
-- names for this table's row-level access generally, not a new gap this
-- delta introduces or was trying to solve. Fixing that properly needs
-- real per-row RLS (auth.uid() = owner_user_id) on this table, which
-- SECURITY_NOTES.md already explains can't be done yet without breaking
-- the same anonymous readers named above — a separate, larger project,
-- not attempted here.
--
-- NOT yet applied to the live database — unlike every other delta file
-- in this project, this one has not been run via the Management API or
-- live-verified against pg_policies/information_schema, because doing
-- so requires a Supabase credential this session is not authorized to
-- use itself. Run this block in the Supabase SQL Editor, then verify
-- with the query at the bottom of this file.
-- ============================================================

revoke select (ingestion_key, meta_access_token, slack_webhook_url) on businesses from anon;

-- Verify after running the block above — expects exactly these 3 rows,
-- each showing only 'anon' missing from privilege_type SELECT grantees
-- (authenticated and service_role should still show SELECT for all 3):
--
-- select grantee, column_name, privilege_type
-- from information_schema.column_privileges
-- where table_name = 'businesses'
--   and column_name in ('ingestion_key', 'meta_access_token', 'slack_webhook_url')
-- order by column_name, grantee;
--
-- Then confirm the fix live (no login needed) by replacing YOUR_ANON_KEY
-- below with the real anon key and running:
--
-- curl "https://xiikytqxevivrupkljwc.supabase.co/rest/v1/businesses?select=ingestion_key,meta_access_token,slack_webhook_url" \
--   -H "apikey: YOUR_ANON_KEY" -H "Authorization: Bearer YOUR_ANON_KEY"
--
-- Before this fix: returns the real values. After: 400
-- `42501 permission denied for table businesses` (the query is rejected
-- outright, not silently filtered — same behavior as every other
-- column-privilege fix in SECURITY_NOTES.md). A plain
-- ?select=id,name,trade_type,city still returns data normally.


-- ============================================================
-- FROM: supabase_schema_delta_scale_readiness_indexes.sql
-- ============================================================
-- ============================================================
-- MINERVA - Delta: 2 more index gaps found in a scale-readiness pass
-- (2026-10-08)
-- Adds 2 indexes only. Nothing else in your live DB is touched. Run this
-- entire block once in the Supabase SQL Editor (or via the Management API
-- /database/query, same as every other delta this project).
--
-- Why: supabase_schema_delta_cron_agent_indexes.sql (2026-09-24) added 6
-- partial indexes for the 4 cron functions fixed in that same round
-- (chase-unpaid-invoices, nurture-stale-leads, winback-lost-leads,
-- retention-checkin). A fresh scale-readiness pass (prompted by "capable
-- of serving hundreds of customers" becoming an explicit bar) found 2 more
-- hot-path predicates that round didn't cover, neither new — both queries
-- already existed, just never had supporting index coverage checked.
-- ============================================================

-- detect-wasted-trips runs every 15 minutes (the fastest cron cadence in
-- this app) and its candidate-job query filters
-- `status = 'scheduled' and no_show_detected_at is null` with no business
-- scoping (by design — it's a platform-wide sweep) and no LIMIT. 'scheduled'
-- is the single most common job status for any business with upcoming
-- work, so this has been a full sequential scan of the jobs table on every
-- run since this function was built, 96 times a day, growing slower as
-- historical job rows accumulate. Technician-id-keyed (not just a count)
-- since detect-wasted-trips' own query additionally filters
-- `not('technician_id', 'is', null)`.
create index if not exists idx_jobs_scheduled_no_show_pending
  on jobs (technician_id)
  where status = 'scheduled' and no_show_detected_at is null;

-- DispatcherView.jsx's generatePayrollHours() (an explicit owner-initiated
-- "Generate" click, not a cron sweep) filters technician_locations by
-- business_id plus a recorded_at range across every technician on that
-- business at once, for payroll hour calculations over a custom date
-- range. The existing (technician_id, recorded_at) index serves the
-- per-technician trail fetch (DispatcherView's live map detail panel)
-- well, but doesn't help a business-wide range scan — and
-- technician_locations is the single fastest-growing table in this
-- schema (one row per active technician every 15 seconds while tracking),
-- so this gap only gets more expensive over time, not less.
create index if not exists idx_technician_locations_business_recorded
  on technician_locations (business_id, recorded_at);

-- Verify after running the block above:
--
-- select indexname from pg_indexes
-- where tablename in ('jobs', 'technician_locations')
--   and indexname in ('idx_jobs_scheduled_no_show_pending', 'idx_technician_locations_business_recorded');
--
-- Expect both rows back.


-- ============================================================
-- FROM: supabase_schema_delta_subscription_tier_sync_guard.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: businesses.subscription_tier_synced_at, 2026-10-08.
-- Adds 1 new column only. Run this entire block once in the Supabase SQL
-- Editor.
--
-- What this fixes: Stripe explicitly does not guarantee webhook delivery
-- order (only "at least once"). stripe-webhook already defends against
-- the SAME event being processed twice (processed_stripe_events, see its
-- own delta/comment) — this is a different bug: two DIFFERENT, genuine
-- events for the same subscription arriving out of order.
--
-- Concretely: planSubscriptionUpdated's own comment claimed a delayed
-- customer.subscription.updated can never resurrect a cancelled business,
-- because only status 'active'/'trialing' is trusted. That's true of the
-- event's CONTENT, but not of delivery order — a stale update event's own
-- status field correctly says 'active', because that was true when Stripe
-- generated it, BEFORE a cancellation that happened moments later. If that
-- stale update is delivered to this endpoint AFTER the
-- customer.subscription.deleted that cancelled things, nothing previously
-- stopped it from overwriting subscription_tier straight back from
-- 'cancelled' to a real paid tier — a business that genuinely cancelled
-- would silently regain full product access.
--
-- Fix: every write to subscription_tier now also stamps
-- subscription_tier_synced_at with the WRITING EVENT's own timestamp
-- (Stripe's event.created for the 2 webhook branches; "now" for
-- AdminConsole's manual override). Each webhook write is guarded by a
-- single atomic UPDATE ... WHERE subscription_tier_synced_at IS NULL OR
-- subscription_tier_synced_at < this_event's_created — so whichever event
-- is chronologically newest always wins the write, regardless of which
-- one is DELIVERED second. A plain read-then-compare-then-write in
-- application code would reopen the exact race the processed_stripe_events
-- claim-first design was built to close (two near-simultaneous requests
-- could both read "not yet newer" and both write) — this stays a single
-- conditional UPDATE for the same reason.
--
-- Known accepted limitation: Stripe's event.created has 1-second
-- resolution, so two distinct events for the same subscription generated
-- within the same wall-clock second compare equal; the guard then resolves
-- the tie as "first one committed to the database wins" rather than by
-- true order, since no finer-grained sequence number is available from
-- Stripe to break it. Two real subscription changes landing in the same
-- second is already a narrow case; this is a documented edge of that
-- narrow case, not a gap anyone chose to leave unhandled.
--
-- AdminConsole's manual tier override deliberately does NOT read this
-- column before writing — an admin override is a deliberate human action
-- and should always take effect immediately and unconditionally. It DOES
-- write a fresh subscription_tier_synced_at (now()), so that an older,
-- still-in-flight webhook event can't silently undo the override after
-- the fact.
-- ============================================================

alter table businesses add column subscription_tier_synced_at timestamptz;


-- ============================================================
-- FROM: supabase_schema_delta_checkout_hijack_guard.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: businesses.checkout_token, 2026-10-08.
-- Adds 1 new column + revokes anon SELECT on it. Run this entire block
-- once in the Supabase SQL Editor.
--
-- What this fixes: closes a residual gap in the checkout-hijack guard
-- already documented in SECURITY_NOTES.md under "Cross-tenant Stripe
-- checkout hijack via create-checkout-session's unchecked businessId
-- (2026-09-27)". That fix (shouldApplyCheckoutCompletion) only refuses
-- the write when the target business already has a DIFFERENT
-- stripe_customer_id on file — it explicitly treats a null
-- stripe_customer_id as proof of "a real first-time signup." That's true
-- of the INTENDED call pattern, but Onboarding.jsx makes a business fully
-- functional (technicians inserted, setup SMS sent) BEFORE the Stripe
-- redirect even happens — so "signed up, not yet paid" and "brand new,
-- never started paying" are the exact same null-stripe_customer_id state
-- from the outside, and that window can stay open indefinitely if the
-- owner never completes checkout. A stranger who has ever seen that
-- business's id (not confidential — see this file's own "unguessable
-- link" model) could call create-checkout-session directly, complete
-- their OWN $0 trial checkout against the VICTIM's businessId, then
-- cancel it for free — flipping a live, working business to
-- subscription_tier:'cancelled', and permanently locking the real
-- owner's own future checkout out too (shouldApplyCheckoutCompletion
-- would then see the ATTACKER's customer id already on file and
-- correctly refuse to overwrite it — protecting the hijack, not the
-- victim). See SECURITY_NOTES.md's matching dated entry for the full
-- writeup.
--
-- Fix: Onboarding.jsx now generates a random checkout_token client-side
-- (crypto.randomUUID(), same already-proven pattern as
-- ContactSupportModal.jsx/Enterprise.jsx/TrackingView.jsx's own id
-- generation, and IndustrialDispatcherView.jsx's ingestion_key
-- regeneration) at the same moment it creates the business row, and must
-- present that exact value back to create-checkout-session before a
-- Stripe session is created for that businessId. Generated client-side
-- rather than via a DB column default (unlike ingestion_key's own
-- `default gen_random_uuid()::text`) because, unlike ingestion_key — which
-- only the business owner's later AUTHENTICATED session ever needs to
-- read — checkout_token must be known to the SAME pre-auth anon browser
-- that just created the row, moments later, with no authenticated
-- session to read it back through once anon SELECT is revoked below.
--
-- The revoke matters as much as the column: without it, the exact same
-- attacker could just read checkout_token straight back out with a plain
-- `select=checkout_token` REST call using the public anon key, defeating
-- the whole point. Column-level REVOKE SELECT does not affect INSERT —
-- Onboarding.jsx's anon-role insert can still SET this column, it just
-- can never read it back afterward, same as the 3 columns
-- supabase_schema_delta_businesses_secret_columns.sql already locked down
-- this same way.
--
-- Existing rows created before this column existed have
-- checkout_token = NULL. shouldAllowCheckoutCreation() in
-- create-checkout-session/logic.ts deliberately rejects EVERY call for
-- such a row, including one that also sends a null/empty token — a naive
-- `storedToken === providedToken` check would let null match null and
-- reopen the exact gap this fix closes for every pre-existing business.
-- Accepted as-is (not backfilled): as of this fix there are no real paying
-- customers yet, so there is no real population of "legitimately abandoned
-- checkout, needs to resume" rows at risk — if that ever changes, the fix
-- is a fresh Onboarding.jsx signup (a new row, with a real token), not a
-- backfill script, since there is no UI flow today that would consume a
-- backfilled value anyway.
-- ============================================================

alter table businesses add column checkout_token text;
revoke select (checkout_token) on businesses from anon;


-- ============================================================
-- FROM: supabase_schema_delta_addon_sector_guard.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: sector guard on every sector-restricted Minerva Max
-- add-on, 2026-10-09. Adds 1 trigger only. Run this entire block once in
-- the Supabase SQL Editor.
--
-- Supersedes supabase_schema_delta_asset_intelligence_sector_guard.sql,
-- which this replaces before that file was ever run — don't run both.
--
-- What this fixes: src/maxAddons.js's MAX_ADDONS catalog originally
-- treated 'asset_intelligence' as the only add-on with a real sector
-- dependency (industrial-only: its backend reads exclusively from
-- industrial_assets). A full trace of the other 8 add-ons (2026-10-09,
-- see BILLING_INTEGRITY_NOTES.md's matching dated entry) found the
-- opposite problem at 8x the scale: every one of surge_pricing,
-- ai_quotes, crew_splitting, review_loop, demand_forecast,
-- subcontractor_pool, carbon_estimate, and xero_sync ultimately keys off
-- `jobs`/`invoices`/`quotes`, none of which IndustrialDispatcherView.jsx
-- ever populates (confirmed by grep — zero hits across all three tables
-- in that file). All 8 were purchasable and billable for an industrial
-- business while structurally guaranteed to never do anything.
--
-- Already fixed at 2 other layers, both committed separately:
--   - update-addon-billing/index.ts refuses the 'enable' action for a
--     sector-mismatched add-on BEFORE calling Stripe (the real,
--     paid-and-billed path) — this already covered asset_intelligence
--     and now covers all 9 via the same ADDON_REQUIRED_SECTOR map in
--     _shared/maxAddons.ts, no code change needed there.
--   - DispatcherView.jsx's add-on grid already filters generically via
--     isAddonAvailableForSector(addon.key, business?.sector)
--     (DispatcherView.jsx:3524) — extending the catalog's requiresSector
--     metadata was enough to make it correctly hide all 8 for... well,
--     DispatcherView.jsx is trade-only, so this was always a no-op there;
--     IndustrialDispatcherView.jsx never iterated MAX_ADDONS at all —
--     it hardcodes a single button for 'asset_intelligence' only, so
--     there was never a UI path exposing the other 8 to industrial
--     either. Neither UI gap is a real boundary on its own, same
--     established posture as every "forged-request" entry in
--     SECURITY_NOTES.md and the asset_intelligence guard below.
-- This trigger is the 3rd, defense-in-depth layer, and the only one that
-- covers startMaxAddonTrial's free-trial path specifically:
-- DispatcherView.jsx's and IndustrialDispatcherView.jsx's own
-- startMaxAddonTrial() (two separate copies, one per file) write
-- directly to `businesses` from the browser with NO edge function and NO
-- server-side check at all today — the frontend filter above is the
-- only thing stopping it, and a client-side-only gate is never treated
-- as sufficient on its own in this app.
--
-- Generalized rather than one-trigger-per-addon: 9 add-ons now share the
-- identical rule shape ("addon X requires sector Y"), the same
-- 2-or-more-call-sites threshold this codebase already uses elsewhere
-- (_shared/maxAddons.ts, _shared/tierEligibility.ts, _shared/batch.ts) to
-- justify one shared definition instead of N copies that can drift. The
-- mapping below is intentionally kept in lockstep with
-- ADDON_REQUIRED_SECTOR in supabase/functions/_shared/maxAddons.ts and
-- the requiresSector field in src/maxAddons.js's MAX_ADDONS — three
-- copies is the minimum possible given Postgres can't import
-- JS/TS, not a choice to generalize further.
--
-- Why this checks for a TRANSITION, not just current state: `businesses`
-- is updated constantly for completely unrelated reasons (subscription_
-- tier changes, Stripe ids, feature_priorities, ...), and max_addons/
-- max_addon_trials simply carry forward unchanged on every one of those
-- updates unless that specific statement touches them. A trigger that
-- rejected based on current value alone — rather than old vs. new — would
-- permanently brick EVERY future update to any business that ever ends up
-- with a sector-mismatched addon trial/flag set (whether from a past bug,
-- a manual fix, or a future sector change), since that stale value would
-- keep re-tripping the check forever. Comparing OLD and NEW means it only
-- fires when THIS statement is the one introducing or changing the
-- trial/flag — never when it's merely carried forward untouched — and
-- never blocks disabling (new_enabled going true→false always passes,
-- matching update-addon-billing's own "never block disable" rule).
-- ============================================================

drop trigger if exists trg_enforce_asset_intelligence_sector on businesses;
drop function if exists enforce_asset_intelligence_sector();

create or replace function enforce_addon_sector_restrictions() returns trigger as $$
declare
  addon_key text;
  required_sector text;
  new_enabled boolean;
  old_enabled boolean;
  new_trial jsonb;
  old_trial jsonb;
  -- Keep this mapping in lockstep with ADDON_REQUIRED_SECTOR in
  -- supabase/functions/_shared/maxAddons.ts and requiresSector in
  -- src/maxAddons.js's MAX_ADDONS. jsonb object literal so adding a
  -- 10th restricted add-on later is a one-line change here, not a new
  -- trigger.
  addon_sector_requirements jsonb := '{
    "asset_intelligence": "industrial",
    "surge_pricing": "trade",
    "ai_quotes": "trade",
    "crew_splitting": "trade",
    "review_loop": "trade",
    "demand_forecast": "trade",
    "subcontractor_pool": "trade",
    "carbon_estimate": "trade",
    "xero_sync": "trade"
  }'::jsonb;
begin
  for addon_key, required_sector in select * from jsonb_each_text(addon_sector_requirements)
  loop
    new_enabled := coalesce((new.max_addons ->> addon_key)::boolean, false);
    new_trial := new.max_addon_trials -> addon_key;
    old_enabled := false;
    old_trial := null;

    if TG_OP = 'UPDATE' then
      old_enabled := coalesce((old.max_addons ->> addon_key)::boolean, false);
      old_trial := old.max_addon_trials -> addon_key;
    end if;

    if new.sector is distinct from required_sector
       and ((new_enabled and not old_enabled) or (new_trial is not null and new_trial is distinct from old_trial)) then
      raise exception '"%" is only available for %-sector businesses — this business''s sector is %.', addon_key, required_sector, coalesce(new.sector, 'unknown');
    end if;
  end loop;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_addon_sector_restrictions on businesses;
create trigger trg_enforce_addon_sector_restrictions
  before insert or update on businesses
  for each row execute function enforce_addon_sector_restrictions();


-- ============================================================
-- FROM: supabase_schema_delta_billing_identity_guard.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: block direct writes to billing-identity columns on
-- `businesses`, 2026-10-09. Adds 1 trigger only. Run this entire block
-- once in the Supabase SQL Editor.
--
-- What this fixes: `supabase_schema_delta_rls_scoping_v3.sql` (2026-09-14)
-- correctly replaced `businesses`' blanket anon `using (true)` UPDATE
-- policy with a real owner-scoped one — `owner_user_id = auth.uid()`, the
-- one-time claim, or admin_users membership — closing off a STRANGER's
-- ability to touch a business they don't own. But that fix is ROW-level
-- only: it says WHICH ROWS a caller may update, not WHICH COLUMNS. Once a
-- caller passes it (i.e. they ARE the real, legitimately-authenticated
-- owner of their own business), nothing stops them writing ANY column on
-- their own row — including `subscription_tier` and `max_addons`, which
-- every Pro-tier trigger (supabase_schema_delta_pro_tier_gating*.sql) and
-- every Minerva Max add-on backend (draft-quote, xero-sync-invoice,
-- detect-idle-assets, ...) trusts as ground truth without ever
-- re-verifying it against Stripe.
--
-- Concretely: any business owner, once logged in (which every real
-- customer will be), can open devtools and run one fetch() with their own
-- valid session:
--   fetch('.../rest/v1/businesses?id=eq.<their own id>', { method: 'PATCH',
--     headers: {apikey, Authorization: `Bearer <their own JWT>`},
--     body: JSON.stringify({subscription_tier: 'pro'}) })
-- — and permanently self-upgrade to Pro, or flip any Minerva Max add-on
-- on via `max_addons`, with zero Stripe charge, forever. This is not a
-- "sold vs. delivered" bug (today's other two fixes, see
-- BILLING_INTEGRITY_NOTES.md) — those meant a feature didn't work for a
-- customer who legitimately paid for it; this means a customer doesn't
-- have to pay at all. Found by re-asking, one level deeper, the same
-- question that found both of today's other bugs: not just "can the
-- business that bought this reach it" but "is the thing recording what
-- they bought itself forgeable." Zero real customers exist yet, so this
-- has caused no actual revenue loss — but it is exactly the class of gap
-- that must close before the outreach this session's standing goal is
-- building toward, not after.
--
-- Why a trigger, not a column-level REVOKE (the pattern used for the 3
-- secret columns and checkout_token): REVOKE is role-scoped (anon /
-- authenticated / service_role), with no row-level nuance. The one
-- legitimate direct writer of `subscription_tier` from the browser is
-- AdminConsole.jsx's overrideTier() — but it authenticates as the SAME
-- `authenticated` role as every ordinary business owner, distinguished
-- only by admin_users membership (a row-level fact), which a column
-- REVOKE can't express. A trigger can check both the role (exempting
-- service_role, which stripe-webhook/update-addon-billing/reconcile-
-- billing already use for every legitimate backend write) and admin_users
-- membership (exempting the legitimate admin override), the same
-- `exists (select 1 from admin_users a where a.user_id = auth.uid())`
-- already proven to work in rls_scoping_v3.sql's own businesses UPDATE
-- policy.
--
-- UPDATE only, not INSERT: Onboarding.jsx's signup INSERT sets an initial
-- `subscription_tier` as the anon-authored, not-yet-paid tier the visitor
-- picked — already a separate, already-closed concern
-- (supabase_schema_delta_checkout_hijack_guard.sql's checkout_token:
-- nothing about the business is actually usable until a real Stripe
-- checkout completes). There is no OLD row at INSERT time for this
-- trigger to compare against, and nothing to "escalate" from.
--
-- Deliberately does NOT include max_addon_trials: unlike every other
-- column here, the free 30-day Minerva Max trial is explicitly documented
-- as "a free, unbilled client-side preview by design" (update-addon-
-- billing/index.ts's own header comment) — self-serve, no server
-- validation, by deliberate prior decision, not an oversight. A client
-- could still set an artificially long trial window directly — a real,
-- but much lower-stakes (no charge bypassed, just unlimited free preview)
-- gap in an already-deliberate tradeoff, not something this delta
-- unilaterally overrides. Flagged in BILLING_INTEGRITY_NOTES.md as a
-- separate, lower-priority, product-call item rather than folded in here.
-- ============================================================

create or replace function enforce_billing_identity_protected() returns trigger as $$
begin
  if auth.role() = 'service_role' then
    return new; -- stripe-webhook, update-addon-billing, reconcile-billing, sync-technician-billing
  end if;

  if exists (select 1 from admin_users a where a.user_id = auth.uid()) then
    return new; -- AdminConsole.jsx's deliberate manual overrideTier()
  end if;

  if new.subscription_tier is distinct from old.subscription_tier
     or new.subscription_tier_synced_at is distinct from old.subscription_tier_synced_at
     or new.max_addons is distinct from old.max_addons
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_sub_id is distinct from old.stripe_sub_id
     or new.stripe_sub_item_id is distinct from old.stripe_sub_item_id
     or new.max_addon_stripe_items is distinct from old.max_addon_stripe_items
     or new.payment_failed_at is distinct from old.payment_failed_at
  then
    raise exception 'subscription_tier, max_addons, payment_failed_at, and Stripe billing identifiers can only be changed by a real Stripe billing event or an admin override — not directly.';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_billing_identity_protected on businesses;
create trigger trg_enforce_billing_identity_protected
  before update on businesses
  for each row execute function enforce_billing_identity_protected();

-- Verify after running (expects the error text above, not a silent 200):
--
-- As the business owner's own session (or with any authenticated JWT that
-- isn't in admin_users), attempt:
--   update businesses set subscription_tier = 'pro' where id = '<any id>';
-- Expect: ERROR — "subscription_tier, max_addons, payment_failed_at, and
-- Stripe billing identifiers can only be changed by a real Stripe billing
-- event or an admin override — not directly."
--
-- Then confirm legitimate paths still work: AdminConsole's tier override,
-- a real Stripe test-mode checkout/webhook cycle, and update-addon-billing
-- (service_role) should all still succeed exactly as before.


-- ============================================================
-- FROM: supabase_schema_delta_businesses_select_scoping.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: scope `businesses` SELECT by role, close the
-- competitive-intelligence/PII leak, 2026-10-10. Adds 2 policies + 1
-- column-grant pair, no new columns. Run this entire block once in the
-- Supabase SQL Editor.
--
-- What this fixes: `businesses` has carried a single SELECT policy,
-- "anon select business" (`supabase_schema.sql` — for select using
-- (true)), since the original schema. Despite its name, this policy has
-- no `TO <role>` restriction, so by plain Postgres default it applies to
-- EVERY role — anon AND authenticated alike. Combined with the 2026-09-14
-- UPDATE fix (`rls_scoping_v3.sql`, which DID correctly scope UPDATE to
-- owner/admin), this left SELECT as the one operation still fully open:
-- any already-logged-in business owner — a real, paying customer — could
-- read every OTHER business's full row, including contact_email,
-- contact_phone, subscription_tier, stripe_customer_id, stripe_sub_id,
-- and payment_failed_at, just by running the exact same unfiltered query
-- AdminConsole.jsx's own loadBusinesses() uses (no `.eq('id', ...)`), with
-- their own ordinary session. Found while reviewing SECURITY_NOTES.md's
-- "Phase 2 priority" section for this project's stated goal of serving
-- hundreds of real customers — that section's own "still open" bullet
-- about this table cited "~45 background agent edge functions run on the
-- anon key" as a blocker, which the SAME section's own correction two
-- paragraphs above it had already proven false (every background agent
-- uses service_role, confirmed again independently here) — a stale
-- internal contradiction, not a currently-accurate reason this couldn't
-- be fixed.
--
-- Traced EVERY real caller before writing this (not assumed) — both a
-- grep of every direct `.from('businesses')` call and a separate,
-- independent trace of every embedded `businesses(...)` join from
-- another table, including the exact auth-timing of the one case that
-- could have broken production if gotten wrong (TechnicianView.jsx's PIN
-- login, confirmed to run authenticated as the technician's own session
-- by the time it reads businesses, not anon). Full caller inventory:
--
-- ANON (no login, unguessable-link model — genuinely needs to read ANY
-- business by id, but only a narrow, safe column set):
--   - IntakeAssistant.jsx: id, name, trade_type, city
--   - SuccessPage.jsx: sector
--   - Onboarding.jsx: id, name (reads back its own INSERT)
--   - DisputeView.jsx, TrackingView.jsx, ClientHistoryView.jsx,
--     QuoteView.jsx (all embedded joins from jobs/technicians/
--     client_portal_links/quotes): name only
--   - InvoiceView.jsx (embedded join from invoices): name, abn — the
--     "Tax Invoice" vs "Invoice" heading and the printed ABN both depend
--     on this; easy to miss since every other anon reader only needs
--     `name`, which is exactly why the embedded-join trace mattered.
--
-- AUTHENTICATED, needs its OWN full row only:
--   - RequireBusinessAuth.jsx / DispatcherView.jsx /
--     IndustrialDispatcherView.jsx: the logged-in owner's own business,
--     including the one-time first-login claim (owner_user_id still
--     null, contact_email matches the caller's own JWT email) — same
--     3-branch shape already proven in rls_scoping_v3's UPDATE policy,
--     replicated here for SELECT.
--   - TechnicianView.jsx's PIN-login embedded `businesses(*)`: runs
--     authenticated as the TECHNICIAN's own session (via
--     technician-login + verifyOtp), not the owner's — needs a 4th
--     branch (technicians.auth_user_id = auth.uid() for that business)
--     that no prior pass on this table ever added, confirmed missing by
--     re-reading rls_scoping_v2's and v3's own "deliberately not
--     touched" reasoning for businesses, neither of which mentions
--     technicians at all. Without this branch, this fix would have
--     silently cut off the Pro-tier gate, trial/cancelled banners, and
--     addon detection for every technician at every business — not with
--     an error, just `businesses: null` forever. Caught before shipping
--     by independently tracing this exact path rather than assuming the
--     owner-or-admin shape from the UPDATE policy would transfer as-is.
--
-- AUTHENTICATED, needs to read ANY business (by design):
--   - AdminConsole.jsx: admin_users membership.
--
-- SERVICE_ROLE (bypasses RLS entirely, unaffected either way): all 29
-- edge functions that read businesses via a direct or embedded query —
-- confirmed every single one uses SUPABASE_SERVICE_ROLE_KEY, not anon.
--
-- Column-level anon allowlist, not an ever-growing exclusion list: rather
-- than naming every sensitive column to revoke (which this table already
-- has 3 narrower, never-yet-applied precedents for —
-- businesses_secret_columns.sql, checkout_hijack_guard.sql — both still
-- correct and left as-is, now redundant-but-harmless once this runs,
-- since REVOKE is idempotent either order), this does the reverse: revoke
-- ALL anon column access, then grant back only the 6 columns a real anon
-- caller above actually uses. A future column added to this table is
-- anon-unreadable by default unless someone deliberately opens it, rather
-- than silently exposed until someone remembers to add it to a revoke
-- list — the same shift in posture an allowlist always buys over a
-- blocklist.
--
-- Unresolved and flagged, not fixed here (deliberately out of scope for
-- this pass): whether PostgREST's embedded `(*)` wildcard interacts with
-- a column-level REVOKE the same way a top-level `select('*')` does is a
-- genuine runtime-behavior question neither this session nor a static
-- code read can answer with certainty. Rather than depend on that answer
-- either way, TechnicianView.jsx's `businesses(*)` is being rewritten
-- (separate frontend commit) to the exact explicit field list it actually
-- uses, which behaves identically to any other named-column embed
-- (proven safe — InvoiceView.jsx's `businesses(name, abn)` already works
-- this way) regardless of how the wildcard case resolves.
--
-- Also flagged, not fixed here: `technicians` itself carries the exact
-- same unrestricted-by-role SELECT shape ("anon select technicians",
-- supabase_schema.sql) — deliberately, per that policy's own comment
-- ("needed by PIN login, the dispatcher's live map, and the client
-- tracking page... cannot be narrowed... without breaking live
-- tracking"). That's a separate, already-reasoned-through tradeoff
-- involving Realtime subscriptions, not an oversight this delta
-- introduces or is trying to close — noted here only so it isn't
-- mistaken for the same bug once this one's fixed.
-- ============================================================

drop policy if exists "anon select business" on businesses;

create policy "anon select business" on businesses
  for select
  to anon
  using (true);

create policy "owner admin technician or unclaimed select business" on businesses
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_user_id is null and contact_email is not null and lower(contact_email) = lower(auth.jwt() ->> 'email'))
    or exists (select 1 from admin_users a where a.user_id = auth.uid())
    or exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = businesses.id)
  );

revoke select on businesses from anon;
grant select (id, name, trade_type, city, sector, abn) on businesses to anon;

-- Verify after running (as the anon key, no login — safe, read-only):
--
-- curl "https://xiikytqxevivrupkljwc.supabase.co/rest/v1/businesses?select=id,name,trade_type,city,sector,abn&limit=1" \
--   -H "apikey: YOUR_ANON_KEY" -H "Authorization: Bearer YOUR_ANON_KEY"
-- Expect: 200, one row with just those 6 fields.
--
-- curl "https://xiikytqxevivrupkljwc.supabase.co/rest/v1/businesses?select=contact_email&limit=1" \
--   -H "apikey: YOUR_ANON_KEY" -H "Authorization: Bearer YOUR_ANON_KEY"
-- Expect: 400, `42501 permission denied for table businesses` — not real
-- data back.
--
-- Then confirm nothing legitimate broke: your own test business's
-- dispatcher login, a technician's PIN login (check the Pro-tier
-- checklist/invoicing flow specifically, if that test business is on
-- Pro — this is exactly the path this delta's own header says would have
-- silently broken without the technician branch), the admin console's
-- business list, and a public invoice link (/invoice/:id) all still
-- load correctly.
--
-- Finally, the actual bug this delta fixes — a real AUTHENTICATED owner
-- reading a business they don't own — needs its own check, since neither
-- curl above (anon) nor the login spot-checks above exercise it. Run in
-- the Supabase SQL Editor with two real business ids from your own test
-- data (DAY7_LAUNCH_CHECKLIST.md's sections 1 and 8 already create two):
--
-- set role authenticated;
-- set request.jwt.claims = '{"sub": "<business 1's owner_user_id>", "role": "authenticated"}';
-- select id, name, contact_email, subscription_tier from businesses where id = '<business 2's id>';
-- reset role;
--
-- Expect: 0 rows (not an error — RLS silently filters, same as every
-- other row-level policy). Before this delta, this same query returned
-- business 2's full row.


-- ============================================================
-- FROM: supabase_schema_delta_technician_site_assignment.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: let industrial technicians actually see and check
-- into their assigned site, 2026-10-10. Adds 1 column + 3 RLS policies.
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this fixes: `TechnicianView.jsx` is the ONLY technician-facing
-- view in the app, used by every technician regardless of sector. It
-- discovers "what work is assigned to me" exclusively through
-- `technicians.current_job_id -> jobs` — a trade-only mechanism.
-- Industrial has no equivalent at all: no column on `technicians`
-- pointing at a `site_projects` row, no join table, nothing. Confirmed
-- by a full repo grep: zero code paths anywhere ever set such a thing,
-- and zero code paths anywhere ever INSERT into `site_checkins` either
-- (every reference to that table across src/ and supabase/functions/ is
-- a read). `Features.jsx`/`Enterprise.jsx` market "Multi-day site
-- tracking... arrival/departure check-ins" as a real, working,
-- industrial-sector capability — today it cannot produce a single row,
-- for any business, ever. Same "sold vs delivered" bug class already
-- found and fixed repeatedly this session (Pro tier, Standard tier,
-- Minerva Max add-ons, Pricing.jsx) — this is the most severe instance:
-- not wrong-sector, just entirely unbuilt. Three downstream agents
-- already consume `site_checkins` and have been doing so against a
-- permanently empty table since the industrial sector shipped: "The
-- Warden" (detect-safety-hazards, human/automated proximity detection),
-- "The Pacer" (sequence-handoffs, handoff nudging), and
-- package-client-verification (the client evidence-package export).
--
-- Fix shape: the minimum needed to make the ALREADY-MARKETED capability
-- real, mirroring the existing, proven trade-side pattern exactly rather
-- than inventing a new one. `technicians.current_job_id` is the
-- precedent; `technicians.current_site_id` is its direct sibling. No
-- new join table needed — unlike `jobs.technician_id` (one job, one
-- primary tech, crew handled separately via `job_assignments`), this
-- points the other way (FROM technician), so multiple technicians can
-- already share one `current_site_id` with nothing extra required — a
-- natural fit for multi-day site work where more than one person is
-- often on site at once.
--
-- Deliberately NOT building the 'automated_process' side of
-- `site_checkins` (the Warden/Pacer's other leg, referenced in
-- monitor-asset-telemetry's header comment but never actually wired to
-- write this table either). That's a separate, far more speculative
-- integration (what a piece of equipment "checking in" even means
-- physically isn't specified anywhere) and isn't itself a marketed,
-- customer-facing claim the way arrival/departure check-ins are — it's
-- left exactly as it already was, a dormant downstream consumer that
-- simply won't fire until/unless that side is built later. Not a
-- regression: it already never fired, since neither leg existed.
--
-- RLS: `site_projects`/`site_checkins` were correctly scoped to the
-- business OWNER's own session by `rls_scoping_v3.sql` (2026-09-14) —
-- "owner all ..." policies, `owner_user_id = auth.uid()`. A technician's
-- own authenticated session (PIN login, `technicians.auth_user_id`) is a
-- DIFFERENT auth.uid() than the owner's and satisfies neither policy at
-- all — confirmed by reading that exact policy text before writing any
-- UI, not assumed. Without the two new policies below, a technician's
-- check-in screen would load, every read/write would be silently
-- RLS-filtered or rejected, and the technician would see either a blank
-- site or a failed check-in with no indication why — the identical
-- near-miss shape already caught and fixed once today in
-- businesses_select_scoping.sql's own 4th branch, same root cause (a
-- technician's session is neither the owner nor anon, and every
-- RLS pass on this table so far only ever considered those two).
--
-- Technician gets SELECT only on `site_projects` (never writes a site)
-- and SELECT + INSERT only on `site_checkins` (reads their own
-- check-in history to know whether they're currently checked in; can
-- log a new check-in; cannot UPDATE or DELETE a past one — an
-- append-only field log, same posture as `technician_incidents`).
-- `WITH CHECK` on the insert ties the row's `business_id` to a business
-- the caller is actually a technician of, preventing a technician from
-- writing a check-in into a different business's log — mirrors the same
-- existing-tenant check already proven on every other technician-scoped
-- policy added this session.
-- ============================================================

alter table technicians
  add column current_site_id uuid references site_projects(id) on delete set null;

create policy "technician select site_projects" on site_projects
  for select
  using (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = site_projects.business_id)
  );

create policy "technician select site_checkins" on site_checkins
  for select
  using (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = site_checkins.business_id)
  );

create policy "technician insert own site_checkins" on site_checkins
  for insert
  with check (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = site_checkins.business_id)
  );

-- Verify after running (in the Supabase SQL Editor, with a real
-- industrial test business/technician — DAY7_LAUNCH_CHECKLIST.md
-- section 9 has Standard-tier steps to crib the pattern from; create an
-- industrial-sector equivalent if one doesn't already exist):
--
-- set role authenticated;
-- set request.jwt.claims = '{"sub": "<technician''s auth_user_id>", "role": "authenticated"}';
-- select id, name, scope_of_work from site_projects where id = '<a real site id for that technician''s business>';
-- Expect: 1 row.
-- insert into site_checkins (site_id, business_id, person_name, role, checkin_type)
--   values ('<that site id>', '<that business id>', 'Test Tech', 'human_technician', 'arrival');
-- Expect: success.
-- select id, name, scope_of_work from site_projects where id = '<a site id belonging to a DIFFERENT business>';
-- Expect: 0 rows.
-- reset role;
--
-- Then confirm nothing existing broke: the business owner's own
-- IndustrialDispatcherView still loads/edits sites exactly as before
-- (the owner's "owner all ..." policies are untouched, these are purely
-- additive), and a TRADE technician's PIN login / job flow is
-- unaffected (this delta touches no trade table).


-- ============================================================
-- FROM: supabase_schema_delta_verification_package_view.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: let a client actually view a generated verification
-- package, 2026-10-10. Adds 1 RLS policy, no new column. Run this entire
-- block once in the Supabase SQL Editor.
--
-- What this fixes: `package-client-verification`'s own header comment
-- (2026-09-01) says it "mirrors the trade sector's Dispute Pack — see
-- DisputeView.jsx" — a read-only, no-login, shareable-link page. That page
-- was never actually built for client_verification_packages. Combined
-- with `rls_scoping_v3.sql` (2026-09-14) correctly closing this table's
-- original wide-open "anon all" policy down to "owner all" (business owner
-- only, same tightening applied project-wide that day), the practical
-- result was: a package could be generated, a Slack message would say
-- "ready to present for client sign-off" — but there was no page anywhere
-- a client could open to actually see it, and the `signed_off_at` column
-- IndustrialDispatcherView.jsx's own badge already displays
-- ("pending sign-off" / "signed off") was referenced in exactly that one
-- display line and nowhere else in the whole codebase — nothing, anywhere,
-- ever wrote it. The badge would have read "pending sign-off" forever, for
-- every package, permanently. Found while tracing the technician site-
-- tracking gap (same session, same root family of findings).
--
-- Fix: new src/pages/VerificationPackageView.jsx (/verification/:packageId)
-- mirroring DisputeView.jsx's exact pattern, needs one new anon SELECT
-- policy, scoped by id only (same unguessable-link trust model already
-- used for jobs/invoices/quotes — "anyone with this URL can view it", not
-- a secret, meant to be shared deliberately one-to-one). No anon access to
-- site_projects/site_checkins/etc. is needed for this: the package's own
-- `evidence` column is a complete snapshot taken at generation time, so
-- the view page reads that directly.
--
-- Deliberately NOT a client self-service "sign off" action: no other page
-- in this app lets a client digitally sign/approve anything (checked
-- before writing this — every "approve" found in the codebase is an
-- internal operator action on drafts/outreach), so adding one here would
-- be a new product pattern, not a completion of an existing one. Marking
-- `signed_off_at` stays a dispatcher-side manual write (new "Mark signed
-- off" button in IndustrialDispatcherView.jsx, same commit) — already
-- covered by the EXISTING "owner all client_verification_packages" policy
-- from rls_scoping_v3.sql, so no additional policy is needed for that
-- half, only the new anon SELECT below.
-- ============================================================

create policy "anon select client_verification_packages" on client_verification_packages
  for select
  to anon
  using (true);

-- Verify after running (as the anon key, no login — safe, read-only; use a
-- real package id from your own test data, generated via "Generate
-- verification package" on an industrial test site):
--
-- curl "https://xiikytqxevivrupkljwc.supabase.co/rest/v1/client_verification_packages?select=id,summary,signed_off_at&id=eq.<a real package id>" \
--   -H "apikey: YOUR_ANON_KEY" -H "Authorization: Bearer YOUR_ANON_KEY"
-- Expect: 200, one row.
--
-- Then confirm nothing legitimate broke: the business owner's own
-- IndustrialDispatcherView Verification tab still loads every package for
-- their business exactly as before (owner policy untouched, this is purely
-- additive), and /verification/:packageId renders the summary, check-ins,
-- telemetry, and safety log correctly for that same package.


-- ============================================================
-- FROM: supabase_schema_delta_incoming_sms_webhook.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: a real place for a client's SMS reply to land,
-- 2026-10-11. Adds 1 table, no new column. Run this entire block once in
-- the Supabase SQL Editor. The matching retention cron lives in
-- supabase_schema_delta_incoming_sms_webhook_cron.sql — kept separate per
-- this project's established convention of never mixing DDL and live
-- cron.schedule() calls in the same delta file (see
-- supabase_schema_delta_minerva_max_cron.sql's own header).
--
-- What this fixes: every transactional SMS this product sends (ETA,
-- job assignment... actually those are technician-facing, but
-- completion, invoice, quote, review-request — all client-facing)
-- invites a reply by simply being a text message, and nothing in this
-- codebase has ever handled an incoming SMS at all. Confirmed by
-- grepping for any incoming-SMS/reply webhook — zero exist, only
-- `missed-call-webhook` for voice. A real client who types back
-- "running late, can you come at 3 instead?" currently has that message
-- go nowhere a business owner would ever see it in their normal Minerva
-- workflow — at best it sits in the Twilio Console, which nobody checks
-- as part of daily operations. Not documented as a known, deliberate
-- gap anywhere in this project's otherwise-thorough habit of flagging
-- limitations (checked README.md/SECURITY_NOTES.md and the sales docs
-- before concluding this was genuinely unnoticed, not already decided).
--
-- Architecture question resolved before building anything: Minerva's
-- SMS all send from one of two numbers — a business's own
-- `businesses.twilio_number` if they've set one, or the shared
-- `TWILIO_PHONE_NUMBER` platform secret as fallback (see every
-- send-*-sms function's own header). `missed-call-webhook` already
-- solves the identical "shared number, which business does this belong
-- to" problem for voice calls, via a `twilio_number = To` lookup — this
-- mirrors that exact, already-proven pattern rather than inventing a
-- new one. A business on the shared fallback number has the same
-- inherent ambiguity missed-call-webhook already accepts; not a new
-- limitation this delta introduces.
--
-- processed_sms_sids: same minimal, service_role-only idempotency table
-- as processed_call_sids (Twilio retries Messaging webhooks the same
-- way it retries Voice ones).
-- ============================================================

create table if not exists processed_sms_sids (
  message_sid text primary key,
  processed_at timestamptz not null default now()
);

alter table processed_sms_sids enable row level security;

grant select, insert on processed_sms_sids to service_role;

-- Verify after running: select * from processed_sms_sids limit 1; -- expect: succeeds, empty


-- ============================================================
-- FROM: supabase_schema_delta_outreach_prospects_dedup.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: prevent duplicate outreach_prospects rows for the same
-- email, 2026-10-10. Adds 1 unique index only. Run this entire block once
-- in the Supabase SQL Editor, before relying on real outreach volume.
--
-- Why: outreach_prospects had no uniqueness constraint on contact_email at
-- all — re-importing the same business from a second CSV, or re-running
-- the AI-paste extraction over text that includes someone already in the
-- table, silently created a second, fully independent row. Found during
-- a full outreach-pipeline audit ahead of real campaign volume. This
-- matters specifically because outreach-unsubscribe's self-service link
-- is keyed to the one row id a given email was sent from — a real person
-- clicking "unsubscribe" only silenced that one row; any duplicate
-- sibling stayed eligible to be drafted/approved/sent to the same person
-- again. The matching code fix (outreach-unsubscribe/index.ts, committed
-- separately, see SECURITY_NOTES.md/BILLING_INTEGRITY_NOTES.md-adjacent
-- history in that commit) makes a real unsubscribe sweep every row with
-- that email, which closes the compliance gap regardless of how many
-- duplicates exist — this index is the complementary fix stopping NEW
-- duplicates from being created in the first place, which also just
-- keeps the admin console's prospect list honest (one card per real
-- business, not two).
--
-- Case-sensitive on purpose, not case-insensitive like the unsubscribe
-- sweep: a case-insensitive expression index needs upsert's onConflict to
-- target that exact expression, which Supabase's JS client doesn't cleanly
-- support for a non-column conflict target — not worth the complexity for
-- what's fundamentally a data-entry convenience, not a security boundary.
-- Real-world email addresses are overwhelmingly treated case-insensitively
-- anyway, and the unsubscribe sweep (the part that actually matters for
-- compliance) stays case-insensitive regardless of this index's
-- collation, so a "Bob@x.com" vs "bob@x.com" pair would still both get
-- correctly unsubscribed together even though this index wouldn't have
-- stopped the second one from being inserted.
--
-- Partial (`where contact_email is not null`) so prospects with no email
-- on file (phone-only leads, or a row still being filled in) never
-- collide with each other — standard SQL NULL semantics already make
-- this the default for a plain unique index, but spelled out here since
-- it's load-bearing for CSV rows that only have a phone number.
--
-- The two insert sites (AdminConsole.jsx's importCsv, and
-- parse-prospect-text/index.ts) are updated in matching frontend/function
-- commits to upsert with `ignoreDuplicates: true` against this constraint
-- instead of a plain insert, so a batch that happens to include one
-- already-known email skips just that row instead of failing the whole
-- batch.
-- ============================================================

create unique index if not exists outreach_prospects_contact_email_key
  on outreach_prospects (contact_email)
  where contact_email is not null;

-- Verify after running:
--
-- select indexname from pg_indexes
-- where tablename = 'outreach_prospects'
--   and indexname = 'outreach_prospects_contact_email_key';
--
-- Expect one row back.


-- ============================================================
-- FROM: supabase_schema_delta_signup_recovery.sql
-- ============================================================
-- ============================================================
-- MINERVA - Delta: abandoned-signup recovery email (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: Onboarding.jsx creates the businesses row (and its
-- technicians rows, and sends each technician a real setup SMS) BEFORE the
-- Stripe checkout redirect happens. Until now, a business that abandoned
-- or failed checkout got no outreach at all — flag-abandoned-signups only
-- ever wrote an internal note for a human to review 48 hours later. This
-- column lets recover-abandoned-signup email that business ONCE, well
-- before the 48h give-up point, asking them to finish. Same self-healing/
-- one-time-claim shape as abandoned_flagged_at
-- (supabase_schema_delta_abandoned_signups.sql) — this flag is irrelevant
-- the moment a real checkout completes (the business then has a
-- stripe_sub_id and recover-abandoned-signup's own query excludes it).
-- ============================================================

alter table businesses add column signup_recovery_sent_at timestamptz;


-- ============================================================
-- FROM: supabase_schema_delta_new_subscriber_checkin.sql
-- ============================================================
-- ============================================================
-- MINERVA - Delta: new-paying-customer check-in email (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: retention-checkin already maintains a trade business's
-- relationship with ITS OWN clients. Nothing maintains Minerva's own
-- relationship with its paying business customers in the first couple of
-- weeks after they convert — exactly when a rough edge either gets
-- reported or quietly causes churn later. This column lets
-- new-subscriber-checkin email that business ONCE, 14-21 days after
-- signup. Same self-healing/one-time-claim shape as every other
-- *_sent_at flag in this schema.
-- ============================================================

alter table businesses add column founding_checkin_sent_at timestamptz;


-- ============================================================
-- FROM: supabase_schema_delta_support_request_notify.sql
-- ============================================================
-- ============================================================
-- MINERVA - Delta: notify on new support request (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: support_requests has existed since 2026-09-05 and
-- AdminConsole.jsx has always been able to read/triage it, but nothing
-- has ever notified anyone that a new one arrived — someone hitting
-- "Contact support" got exactly as much response as however often the
-- operator happened to remember to check the Admin console's Support tab.
-- This column lets notify-new-support-request send that alert ONCE per
-- request, the moment it's submitted. Also requires OPERATOR_EMAIL to be
-- set (same secret stripe-webhook's payment_failed alert already uses) —
-- a harmless no-op until then, same as that one.
-- ============================================================

alter table support_requests add column notified_at timestamptz;


-- ============================================================
-- FROM: supabase_schema_delta_enterprise_lead_notify.sql
-- ============================================================
-- ============================================================
-- MINERVA - Delta: notify on new inbound enterprise lead (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: supabase_schema_delta_enterprise_inbound.sql
-- (2026-09-14) let a real multi-van fleet/facilities-management company/
-- council/strata manager self-identify via the public /enterprise page,
-- but nothing has ever notified the operator that one arrived — the only
-- other function touching this table (generate-roi-proposal) reads an
-- existing row, it doesn't fire on insert. This column lets
-- notify-new-enterprise-lead email that lead ONCE, the moment it's
-- submitted. Also requires OPERATOR_EMAIL to be set (same secret
-- stripe-webhook's payment_failed alert already uses) — a harmless no-op
-- until then, same as that one.
-- ============================================================

alter table big_account_targets add column notified_at timestamptz;


-- ============================================================
-- FROM: supabase_schema_delta_rebooking_notify.sql
-- ============================================================
-- ============================================================
-- MINERVA - Delta: notify on a client self-serve rebooking request
-- (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: TrackingView.jsx's "book me again" form writes
-- straight to `leads` (source='rebooking') on the assumption that
-- DispatcherView's realtime subscription on leads INSERT already covers
-- it — true only while the dispatcher's tab happens to be open at that
-- exact moment. Every other leads-creating path (ai-intake-chat,
-- voice-intake-agent) already sends an unconditional SMS+Slack
-- notification in addition to realtime; this was the one that didn't.
-- This column lets notify-rebooking-request send that notification ONCE
-- per rebooking request.
-- ============================================================

alter table leads add column rebooking_notified_at timestamptz;


-- ============================================================
-- FROM: supabase_schema_delta_trial_ending_reminder.sql
-- ============================================================
-- ============================================================
-- MINERVA - Delta: main-trial-ending reminder (2026-10-09)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error. Run this entire block once in the
-- Supabase SQL Editor.
--
-- What this is for: Minerva Max add-on trials already get a reminder 3
-- days before they lapse (notify-addon-trial-ending,
-- businesses.max_addon_trials' own reminder_sent_at). The main account's
-- 7-day Stripe trial never had an equivalent, even though it ends in a
-- real card charge rather than a feature quietly turning off. There's no
-- local column to read a trial's end date from (it lives only on the
-- Stripe subscription object), so notify-trial-ending calls Stripe
-- directly per candidate business and this column is purely the
-- claim-before-act flag — same one-time-reminder shape as
-- signup_recovery_sent_at above.
-- ============================================================

alter table businesses add column trial_ending_reminder_sent_at timestamptz;


-- ============================================================
-- FROM: supabase_schema_delta_fleet_optimization.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: optimize-fleet-day support (2026-10-18)
-- Run once in the Supabase SQL Editor. Pure column addition, no RLS
-- change needed — businesses' existing SELECT/UPDATE policies already
-- cover this column the same way they cover every other business-owned
-- numeric field.
--
-- total_km_saved: a running, honestly-computed total of how much
-- distance optimize-fleet-day's plan beat the business's own actual
-- current assignment by, summed across every run that found a real
-- improvement (see that function's own header for the exact comparison —
-- it only ever adds a number here when the proposed plan is genuinely
-- shorter than what the business was already doing that day, never a
-- fabricated or best-case figure). Surfaced in DispatcherView.jsx as a
-- simple "distance saved so far" stat.
-- ============================================================

alter table businesses add column if not exists total_km_saved numeric default 0;

-- Verify:
-- select id, name, total_km_saved from businesses limit 5;

-- ============================================================
-- FROM: supabase_schema_delta_roi_proposals_industrial_savings_nullable.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: allow roi_proposals' fuel-savings columns to be null,
-- 2026-10-18. Run once in the Supabase SQL Editor.
--
-- What this fixes: generate-roi-proposal's 15% fuel-savings figure is
-- specifically a route-optimization benchmark (see that function's own
-- header), which has no real mechanism behind it for industrial — no
-- route-optimization feature exists for that sector, and the work
-- pattern (equipment stationed at a multi-day site, not many short daily
-- jobs) doesn't fit the claim anyway. generate-roi-proposal/logic.ts's
-- new shouldComputeFuelSavings now skips generating a savings figure for
-- an industrial proposal rather than applying a claim that doesn't hold
-- for that sector — but estimated_monthly_fuel_savings/
-- estimated_annual_fuel_savings were both `not null`, so without this
-- delta every industrial proposal generation would fail outright with a
-- constraint violation instead of correctly omitting the claim.
-- avg_monthly_fuel_spend and estimated_minerva_monthly_cost stay not
-- null — those are still computed for every sector (fuel spend is
-- informational context, not a Minerva-driven claim; the cost estimate
-- doesn't depend on route optimization at all).
-- ============================================================

alter table roi_proposals alter column estimated_monthly_fuel_savings drop not null;
alter table roi_proposals alter column estimated_annual_fuel_savings drop not null;

-- Verify:
-- select column_name, is_nullable from information_schema.columns
-- where table_name = 'roi_proposals'
--   and column_name in ('estimated_monthly_fuel_savings', 'estimated_annual_fuel_savings');
-- Expect both rows showing is_nullable = 'YES'.


