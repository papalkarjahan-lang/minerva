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

- **The "Asset Intelligence" Minerva Max add-on was sellable, and
  chargeable, to a sector it structurally can never work for.** Found by
  tracing which table "Asset Intelligence" (`src/maxAddons.js`'s
  catalog — "predictive maintenance flags... plus idle-asset alerts")
  actually operates on. Its only 2 backend functions,
  `detect-idle-assets` and `predict-asset-maintenance`, read exclusively
  from `industrial_assets`. A trade-sector business has zero rows there,
  ever — their own equipment lives in the entirely separate, Pro-tier-
  gated `assets` table, which those 2 functions never touch. Nothing
  anywhere stopped a trade-sector business from clicking "Enable —
  $39/mo" on this add-on from their own dispatcher console: no sector
  check in the catalog, the enable flow (`update-addon-billing`), or the
  free-trial path (`startMaxAddonTrial`, which writes straight to
  `businesses` from the browser with no server-side check of any kind).
  The result: real, recurring money for a feature with no possible way
  to ever do anything for that business — not a race, not an edge case,
  a guaranteed-every-time null result. Checked every other add-on's
  backend specifically to see if this was a wider pattern — it isn't;
  the other 8 all operate on sector-neutral tables (`jobs`, `invoices`,
  `quotes`, `technicians`, `subcontractors`, `carbon_estimates`,
  `xero_oauth_states`) and have no equivalent gap.
  **Fix, 3 layers**: (1) `src/maxAddons.js` catalog entry gets a new
  `requiresSector: 'industrial'` field + `isAddonAvailableForSector()`
  helper, mirrored in `supabase/functions/_shared/maxAddons.ts` for the
  Deno side (same "can't literally share a module across runtimes"
  reason every other shared check in this codebase is mirrored, not
  imported). (2) `update-addon-billing/index.ts` refuses the `'enable'`
  action for a sector-mismatched add-on — checked BEFORE any Stripe
  call, deliberately, since catching this only at the subsequent
  `businesses` UPDATE would mean the Stripe subscription item was
  already created (and will bill on the next invoice) by the time the
  DB write is rejected, leaving a real, billing, orphaned Stripe item
  with no corresponding "enabled" state anywhere in the UI — worse than
  the original bug. `'disable'` is never blocked, so anything enabled
  before this fix (or by any other means) can always be turned back off.
  (3) `DispatcherView.jsx` no longer renders asset_intelligence's
  Enable/Trial buttons at all for a trade-sector business — closes the
  normal UI path, though (2) and the trigger below are what actually
  matter, since a hidden button alone has never been treated as a real
  boundary anywhere else in this codebase either.
  **Trigger, for defense in depth** — `supabase_schema_delta_asset_
  intelligence_sector_guard.sql`, not yet applied live: covers
  `startMaxAddonTrial`'s direct-from-browser write, the one path with no
  edge function at all to add a check to. Deliberately compares OLD vs.
  NEW rather than rejecting on current state alone — `businesses` is
  updated constantly for unrelated reasons, and a stale
  already-set-wrong value would otherwise re-trip a current-state-only
  check on every single future unrelated update to that row, permanently
  bricking it. Comparing OLD/NEW means it only fires when THIS statement
  is the one introducing or changing the flag/trial, and never blocks a
  disable (enabled going true→false always passes).
  Verification: 695/695 tests pass (9 new — 3 in `maxAddons.test.js`, 3
  in `_shared/maxAddons.test.ts` mirroring them, plus the edge-function
  change covered by existing `_shared/maxAddons.test.ts` coverage of the
  function it now calls). Lint clean on every touched file (pre-existing,
  unrelated warnings in `DispatcherView.jsx` confirmed via `git stash` to
  predate this change — that file has 39 of them already, none from this
  edit). **Not yet applied live** — same reason as every schema change
  this session: run `supabase_schema_delta_asset_intelligence_sector_
  guard.sql` in the Supabase SQL Editor, then redeploy
  `update-addon-billing`.
  **Deliberately not attempted here**: building a trade-sector
  equivalent of asset telemetry/idle-detection so the add-on could
  actually work for trade too. Trade's `assets` table has no
  `last_telemetry_at`/telemetry-event concept to build predictive
  maintenance on top of today — that's a real, substantial product
  decision (what would "telemetry" even mean for a trade business's
  tools/equipment?), not a bug fix, and not something to decide
  unilaterally. The fix here is "don't charge for what can't work," not
  "make it work."

- **Pro tier has nothing for Industrial — the same bug class as Asset
  Intelligence, but at the entire top tier's scale, not one $39 add-on.**
  Found by a dedicated audit applying the same trace deliberately
  broadened beyond add-ons: does every tier's marketed feature set
  actually work for every sector that can buy it? `Onboarding.jsx`'s and
  `Pricing.jsx`'s `TIERS` copy both market Pro ($119/tech/mo) as
  Standard ($79) + 6 specific features: on-site invoicing, asset
  tracking, compliance/onboarding checklists, materials/inventory
  tracking, technician credential tracking, automated growth marketing
  suggestions. Sector and tier are chosen completely independently at
  signup (`Onboarding.jsx`'s own `sector`/`tier` state, no
  cross-validation), and `create-checkout-session` selects the Stripe
  price from `tier` alone — `sector` wasn't even a parameter it received.
  Every one of those 6 features' only real implementation is in
  `DispatcherView.jsx` (the trade console) and its server-side tier
  checks (`enforce_pro_tier_*` triggers, `generate-growth-drafts`' own
  `.eq('subscription_tier','pro')` filter) have zero sector awareness.
  `IndustrialDispatcherView.jsx` — the only console an industrial
  business is ever routed to — has none of this UI, and the one feature
  that looked merely tier-gated rather than sector-gated (on-site
  invoicing via the shared `/tech` technician route) turned out to be
  dead for industrial too: that flow only activates when
  `technicians.current_job_id` is set, and nothing on the industrial
  side ever sets that column (industrial assigns technicians to
  `corrective_actions` tickets via a completely different column on a
  completely different table). Net effect: an industrial business
  selecting Pro pays up to 2.4x Standard's price for exactly Standard's
  feature set, every month, with no code path that ever changes that —
  not a race, not an edge case, the guaranteed outcome every time.
  **Fix**: `create-checkout-session/logic.ts`'s new
  `isTierAvailableForSector(tier, sector)` rejects the specific
  `tier==='pro' && sector==='industrial'` combination, checked in
  `index.ts` before any Stripe call — the same "the real chokepoint is
  where money actually gets attached, not just the UI" reasoning as
  every other guard added this session. `Onboarding.jsx` no longer even
  renders the Pro card for Industrial (with a brief, honest explanation
  of why, and what Starter/Standard already include instead), and
  switching sector to Industrial while Pro was already selected resets
  the selection to Standard rather than leaving a hidden, stale `tier`
  state that would otherwise still submit 'pro' invisibly. No DB trigger
  added for this one, unlike `asset_intelligence`'s: there's no
  free/edge-function-bypassing path here with a real functional
  consequence during the trial window the way `startMaxAddonTrial` had
  — the only path that ever attaches a real, recurring Stripe price is
  `create-checkout-session`, which is now the one place this is checked.
  **Deliberately not attempted here, same reasoning as Asset
  Intelligence**: building Pro-tier industrial equivalents for
  invoicing/credentials/growth-marketing. Some of Pro's 6 features
  already have a genuine, separately-built, currently UNGATED industrial
  equivalent (asset tracking → `industrial_assets`, compliance →
  `safety_incidents`/`verify-industrial-compliance`, inventory →
  `consumables_items`/`track-consumables`) — meaning those specific ones
  aren't really "missing," they're "already free at every industrial
  tier today," which is its own real product question (should Industrial
  ever have its own paid tier differentiation, and on what?) rather than
  something to decide unilaterally. The other 3 (invoicing, credential
  tracking, growth marketing) have no industrial equivalent built at
  all. Either way, the fix here is the same: stop selling a specific
  promise that has nothing behind it, not invent what should replace it.
  No new SQL delta — this is an application-level-only fix (no new
  column, no new trigger), so it ships with `create-checkout-session`'s
  next normal redeploy with no extra sequencing step.
  **Follow-up, same day: the fix above only covers signup.** Re-examined
  it by asking "does this actually close every path to the same bad
  state, or just the one path I found it through" — and it didn't.
  `Pricing.jsx`'s own FAQ promises self-serve plan switching "anytime
  from billing settings," which goes through Stripe's own hosted Customer
  Portal, not `create-checkout-session` — an **existing** industrial
  customer could self-serve-switch to Pro through the Portal and land in
  the exact same overcharge, completely bypassing the signup-time guard.
  `stripe-webhook`'s own `customer.subscription.updated` handler already
  existed specifically to sync `subscription_tier` after a Portal switch
  (its header comment even already said so) — it just had zero sector
  awareness, same gap, different entry point. Stripe's Customer Portal
  itself can't be made sector-aware (its allowed-price list is one global
  setting, not per-customer), so this can't be prevented the same way as
  signup — the fix here is detection, not prevention: when a switch would
  set `subscription_tier` to `'pro'` for an `'industrial'` business, the
  tier sync is skipped (so the app itself doesn't compound the mismatch
  by also claiming real Pro access) and an operator alert +
  `agent_insights` row fire instead, same "detect real financial
  anomalies, never auto-correct" posture as this file's dispute/refund
  handling — a human reaches out and handles the refund manually, Stripe
  itself isn't touched automatically.
  `isTierAvailableForSector()` moved from `create-checkout-session/logic.ts`
  to the new `_shared/tierEligibility.ts` once a second function needed
  the identical check — same reasoning `_shared/maxAddons.ts`'s own header
  already gives for its own move. 705/705 tests pass (5 new in the shared
  module's own test file, 4 new for the webhook's 2 new message builders,
  `create-checkout-session`'s own test file trimmed to a 1-case smoke test
  now that full coverage lives in the shared module). No new SQL delta
  here either.
- **Enterprise.jsx's "Custom automation workflows" claim was 100% dead
  for the exact audience that page is written for.** Found by the same
  broadened audit, checking every individual claim on the one marketing
  page aimed specifically at prospects who will pick the industrial
  sector. The claim — "Trigger your own webhook/Slack workflows off
  lead, job, or invoice events" — describes a real, working feature
  (`custom_workflows`, `run-custom-workflows`), but every UI to configure
  one and every call site that fires a trigger event lives exclusively
  in `DispatcherView.jsx`/trade-only functions; industrial's own lead
  pipeline (`harvest-industrial-leads`, `industrial-conductor`) never
  fires any of the 3 named trigger events and has no equivalent UI. The
  other 5 claims on the same page were individually re-verified against
  their real backend at the same time and are genuinely industrial-
  correct (asset telemetry/geofencing, multi-day site tracking, safety
  incident tracking, consumables reorder alerts, client verification
  packages) — only this one bullet was broken. **Fix**: removed the one
  false bullet from `Enterprise.jsx`'s `CAPABILITIES` array, rather than
  inventing a replacement claim or promising a future date — the grid it
  renders into is a responsive `auto-fit` layout, so 5 items instead of 6
  reflows cleanly with no visual gap. Also corrected that array's own
  header comment, which had claimed (prior to this fix) that every entry
  was "cross-checked... not invented for this page" — true again now
  that the one entry that wasn't actually fully correct has been removed,
  but worth noting as its own small instance of the "a comment asserts a
  verification that doesn't fully hold" pattern this project keeps
  finding in different layers.

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
