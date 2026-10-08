# Minerva — Billing Integrity Notes

Started 2026-10-08, same spirit as `SECURITY_NOTES.md` and
`SCALE_READINESS_NOTES.md` — a dated, honest record of what's been checked,
fixed, and deliberately deferred specifically around subscription/billing
*correctness* (not security, not scale — the third leg: does the money and
the tier a business is entitled to always end up right, including under
Stripe's own delivery guarantees, which are weaker than they look at first
read). Prompted by "for all subscriptions to fit perfectly in it... not one
single mistake" becoming an explicit bar.

## Fixed 2026-10-08

- **`subscription_tier` could be silently reverted by an out-of-order
  webhook delivery.** Stripe guarantees webhook delivery "at least once" —
  it does **not** guarantee delivery *in order*. `stripe-webhook` already
  defended against the same event being processed twice
  (`processed_stripe_events`, claimed atomically before any branch runs —
  see that file's own header comment) — this is a different, previously
  unaddressed bug: two *different*, both-genuine events for the same
  subscription arriving in the wrong order.
  Concretely: `planSubscriptionUpdated`'s own comment claimed a delayed
  `customer.subscription.updated` could never resurrect a cancelled
  business, because only `status: 'active'/'trialing'` is trusted. That
  claim doesn't actually hold under reordering — a stale update event's own
  `status` field correctly says `'active'`, because that was true at the
  moment Stripe generated it, *before* a cancellation that happened
  moments later. If that stale update is delivered to the endpoint AFTER
  the `customer.subscription.deleted` that cancelled things, nothing
  previously stopped it from overwriting `subscription_tier` straight back
  from `'cancelled'` to a real paid tier — a business that genuinely
  cancelled would silently regain full product access. The same
  comment's own `/*doesn't guarantee delivery order*/` note was correct in
  spirit but the actual guard it described didn't fully close the gap it
  named — exactly the "a comment claims a protection that doesn't fully
  hold" pattern this project has found and fixed in several other layers
  (see `minerva_setup_progress` memory's structural lesson #2).
  **Fix**: new `businesses.subscription_tier_synced_at` column
  (`supabase_schema_delta_subscription_tier_sync_guard.sql`). Every writer
  of `subscription_tier` now also stamps this column with that write's own
  timestamp, and the 2 webhook branches (`customer.subscription.updated`
  and `.deleted`) guard their `UPDATE` with a single atomic
  `WHERE subscription_tier_synced_at IS NULL OR subscription_tier_synced_at
  < this_event's_created` — so whichever event is chronologically newest
  always wins the actual database write, regardless of which one is
  *delivered* second. Deliberately a single conditional `UPDATE`, not a
  read-then-compare-then-write in application code — the latter would
  reopen the exact TOCTOU race `processed_stripe_events`' claim-first
  design exists to close (two near-simultaneous deliveries could both read
  "not yet newer" and both proceed to write). `AdminConsole.jsx`'s manual
  tier override (the 4th and only non-webhook writer of this column) also
  stamps a fresh timestamp on every use — not to gate itself, since a
  human admin's deliberate override should always take effect immediately
  and unconditionally, but so an older, still-in-flight webhook event
  can't silently undo the override after the fact.
  Found by asking a specific question the rest of the session's
  Stripe-focused auditing hadn't yet asked: not "is each event's own DB
  write idempotent" (already answered, thoroughly, by the
  `processed_stripe_events` work), but "what happens if two *different*
  real events for the same subscription arrive in the wrong order" —
  worth re-asking this same question of any other webhook-driven state
  this project adds later, since idempotency-against-retries and
  correctness-against-reordering are two separate properties and fixing
  one doesn't imply the other.
  **Known accepted limitation**: Stripe's `event.created` has 1-second
  resolution, so two distinct events generated within the same
  wall-clock second compare equal; the guard then resolves that specific
  tie as "whichever commits to the database first wins" rather than by
  true order, since Stripe exposes no finer-grained sequence number to
  break it. Not fixable without data Stripe doesn't provide — documented
  here rather than silently left unmentioned.
  Verification: 3 new Vitest cases for the new `stripeEventCreatedToIso`
  helper (the Unix-seconds-vs-milliseconds conversion is exactly the kind
  of off-by-1000 mistake worth testing directly), all 683 project tests
  still pass, brace/paren balance checked on the edited Deno file (no
  local Deno typecheck tooling in this project — see
  `minerva_setup_progress` memory), and the `.or()` raw-filter syntax
  against a column containing a period (ISO timestamps always have one
  before milliseconds) was specifically verified safe by reading
  `node_modules/@supabase/postgrest-js`'s actual `or()` implementation
  (confirms the client does no value-mangling, just wraps and forwards)
  plus cross-checking that this exact codebase already relies on
  `.gte()`/`.lte()` with `.toISOString()` values in multiple already-live
  features (`DispatcherView.jsx`, `generate-growth-drafts`) — not taken on
  documentation memory alone, given how consequential a wrong guess here
  would be.

## Checked and fine (no action needed)

- **Every other `subscription_tier` write site** — grepped every file
  referencing the column project-wide; confirmed exactly 4 real writers
  (`Onboarding.jsx`'s signup `INSERT`, the 2 webhook branches above, and
  `AdminConsole.jsx`'s override) and the rest are reads/filters only
  (`reconcile-billing`, `update-addon-billing`, `sync-technician-billing`,
  `generate-growth-drafts`, `new-subscriber-checkin`, and the frontend
  tier-gating reads). `Onboarding.jsx`'s `INSERT` doesn't need to stamp
  `subscription_tier_synced_at` itself — a `NULL` value there correctly
  means "no prior real sync state to protect," so the guard's `IS NULL`
  branch lets the first genuine webhook event through regardless of its
  own timestamp, which is exactly the desired behavior for a business's
  very first tier-affecting event.
- **`checkout.session.completed`'s own `shouldApplyCheckoutCompletion`
  cross-tenant-hijack guard** — a different, already-handled concern (who
  the Stripe customer id is allowed to belong to, not event ordering) —
  confirmed this fix doesn't need to interact with it; that branch never
  writes `subscription_tier` at all, only the Stripe id columns.
