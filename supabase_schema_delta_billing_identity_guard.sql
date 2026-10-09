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
