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

- **Standard tier had no real differentiator from Starter — the broadest
  finding this session, affecting every customer who picks the
  apparently-featured middle tier, not one sector.** (2026-10-09) Found
  while closing out a smaller, unrelated copy fix on `Pricing.jsx`:
  Standard's own catalog entry read "Everything in Starter — Recommended
  for growing teams," with no concrete feature claim at all. Grepped
  every tier check in the entire codebase, 3 separate ways (literal
  `=== 'standard'`/`== 'standard'` string match, any tier-ranking/level
  comparison system, any tier-scoped rate-limit/quota reference) — zero
  results on all three. Every single tier-gated check anywhere in this
  project, frontend or backend, tests only for `'pro'` vs. not-`'pro'`.
  Standard ($79/tech/mo) and Starter ($49/tech/mo) were 100% functionally
  identical, everywhere, for every business. Standard is also the tier
  `Onboarding.jsx` defaults to and the one marked featured in the pricing
  UI (the trailing `true` in its `TIERS` row) — almost certainly the most
  commonly selected tier, meaning this wasn't a corner case, it was the
  default experience. Also caught and fixed, independent of the bigger
  question: `Pricing.jsx`'s own `SIZE_GUIDE` claimed Starter and Standard
  have "the same per-tech price either way" for a 2-10 technician team —
  literally false ($49 vs $79), fixed regardless of which direction the
  bigger question went.
  **Asked the user directly** (this is a product/business decision, not
  a technical one, same reasoning already applied to "should trade get an
  asset_intelligence equivalent" and "should industrial get Pro-equivalent
  features" earlier this session — not something to resolve unilaterally)
  rather than guessing: keep it as an unexplained price gap, collapse it
  into Starter, or build it a real feature set. **Chose: build a real
  feature set.**
  **The fix**: reused 6 fully-built, already-tested, already-proven
  autonomous functions that were running completely ungated for every
  business regardless of tier — proactive lead/client/invoice lifecycle
  automation (`chase-unpaid-invoices`, `nurture-stale-leads`,
  `retention-checkin`, `winback-lost-leads`, `check-weather-risk`,
  `detect-wasted-trips`) — rather than inventing new functionality from
  scratch. Genuinely coherent "growing team" story: Starter is the core
  live-dispatch tool; Standard adds the automation that keeps leads,
  clients, and invoices from falling through the cracks once there's more
  volume than one person can track by memory. Deliberately excludes the
  OTHER ungated autonomous functions this project has — `daily-digest`
  (a basic utility every tier should keep, a summary rather than a
  proactive save), `reconcile-technician-state` (an internal self-heal
  with no customer-visible feature shape), and every operator/Minerva-
  facing function (not a business's own feature at all).
  **A second bug, caught before this ever shipped, in my own first draft
  of the fix**: the first version of `hasStandardAutomation()` checked
  tier alone. Re-examining it against the exact question that found the
  original Pro/Industrial bug — "does every business that can buy this
  actually have data in the tables it reads" — caught the identical bug
  class being reintroduced here. `IndustrialDispatcherView.jsx` never
  touches `invoices`, `leads`, or `jobs` at all (confirmed by grep: zero
  write sites); industrial has its own entirely separate data model
  (`industrial_leads`, `site_projects`, `safety_incidents`, ...). All 6
  functions this gates read exactly those 3 (trade-only) tables — an
  industrial Standard customer would have gotten the identical "paying
  more for nothing reachable" problem this whole project-wide fix exists
  to close, just relocated from Pro to Standard. Fixed before any of it
  committed: `hasStandardAutomation()` now takes `(tier, sector)` and
  requires `sector === 'trade'` explicitly, same proven pattern as
  `isTierAvailableForSector`. `check-weather-risk` specifically is
  technically redundant on the sector check (`weather_sensitive_trade_types`
  is only ever set from the trade console, confirmed by grep — an
  industrial business could never match its existing filter anyway) but
  checks explicitly regardless, rather than relying on that staying true
  if a future settings UI ever writes to that column from the industrial
  side too.
  `winback-lost-leads` was initially deferred — a separate background
  task was mid-flight fixing an unrelated bug in that exact file (a
  misleading "sent" Slack message on a failed SMS, found during this
  session's own earlier batching refactor) when this work started, and
  writing to the same file risked a concurrent-write collision. Applied
  2026-10-09 once that file's uncommitted diff was re-read and confirmed
  complete and non-overlapping (the Slack-message fix touches
  `processOneLostLead`'s notify call; this gate touches the main query +
  filter, a different region) — same shape as the other 5,
  `businesses(name, subscription_tier, sector)` in the join,
  `hasStandardAutomation(lead.businesses?.subscription_tier, lead.
  businesses?.sector)` in the filter. All 6 of 6 Standard-tier functions
  are now gated. Marketing copy updated consistently across all 3 places
  that carry it
  (`Pricing.jsx`, `Onboarding.jsx`, `LandingPage.jsx` — kept in sync by
  hand per their own existing convention). Verified live in the browser,
  not just read from source. 715/715 tests pass (11 in `_shared/
  tierEligibility.test.ts` covering both the original sector check and
  this one). No new SQL delta — `subscription_tier` and `sector` both
  already exist on `businesses`; this is a pure application-level change
  shipping with each function's next normal redeploy.

## 2026-10-09 — 8 of 9 Minerva Max add-ons were billable to industrial
businesses despite being structurally dead for them

Found while fixing an unrelated copy error in `src/maxAddons.js`'s own
comment, same way the Standard-tier gap above was found — a stray
observation while doing something else revealed something much bigger.
That comment claimed 8 of the 9 `MAX_ADDONS` catalog entries "operate on
sector-neutral tables (jobs, invoices, quotes, technicians,
subcontractors, carbon_estimates)," with only `asset_intelligence`
(fixed earlier, 2026-10-08) needing a `requiresSector` restriction. That
claim directly contradicted this session's own earlier finding, a few
entries up this file, that `IndustrialDispatcherView.jsx` never touches
`jobs`/`leads`/`invoices` at all — so it got checked properly rather
than trusted.

Delegated the full per-addon backend trace rather than extrapolating
from table names alone, since "does this table name sound sector-
neutral" is exactly the kind of surface-level check that missed
`asset_intelligence` itself the first time around. The trace (every
gating call site, every edge function behind it, every schema file)
confirmed the comment was wrong for all 8:
  - `surge_pricing`, `ai_quotes`, `crew_splitting`, `review_loop`,
    `demand_forecast`, `subcontractor_pool`, and `xero_sync` all key off
    `jobs`, `invoices`, `quotes`, or `job_assignments` directly — all
    four tables industrial never writes to.
  - `carbon_estimate` looked like a possible exception — its
    `carbon_estimates` table has a `site_id` column alongside `job_id`,
    with a schema comment saying it "can attach to either a trade job or
    an industrial site." But its only writer, `estimate-job-carbon`,
    reads exclusively from `jobs` and never queries `site_projects` or
    writes `site_id` — that column is unbuilt scaffolding for a feature
    that was never actually built, not a working industrial path. Don't
    let a schema comment's "can attach to either" read as "does."
  - The one genuinely shared table, `technicians`, doesn't save any of
    these — the features all key off a *job* (`current_job_id`,
    `job_assignments.job_id`, etc.), and industrial never creates a
    `jobs` row for a technician to be linked to in the first place.

This was also live-reachable, not just theoretical: `update-addon-
billing/index.ts`'s Stripe-charging chokepoint already checked
`isAddonAvailableForSector` before every `enable` action, but the
underlying `ADDON_REQUIRED_SECTOR` map only listed `asset_intelligence`
— so for all 8 of these the check passed yes for industrial, and a real
Stripe subscription item would have been created and billed immediately
(`proration_behavior: 'always_invoice'`). The only thing stopping an
industrial business from reaching that path today is that
`IndustrialDispatcherView.jsx` hardcodes its add-on UI to a single
`asset_intelligence` button rather than iterating `MAX_ADDONS` — a
missing UI feature, never an enforced boundary, same lesson already on
record in this file and in `SECURITY_NOTES.md`'s "forged-request"
entries.

Fix, same 3-layer shape as the `asset_intelligence` fix it corrects:
  - `src/maxAddons.js` — all 8 now carry `requiresSector: 'trade'`; the
    stale "sector-neutral" comment rewritten to document the correction
    and point here.
  - `supabase/functions/_shared/maxAddons.ts` — `ADDON_REQUIRED_SECTOR`
    extended with the same 8 entries. This is the actual chokepoint
    `update-addon-billing` reads, so no code change was needed there —
    only a redeploy of that one function to pick up the new map (the
    other 10 functions importing this shared file only call
    `isAddonActive`, never `isAddonAvailableForSector`, so they're
    unaffected and don't need redeploying for this specific fix).
  - `supabase_schema_delta_addon_sector_guard.sql` (new) — generalizes
    the old single-purpose `enforce_asset_intelligence_sector` trigger
    (never deployed; deleted) into one `enforce_addon_sector_restrictions`
    trigger that loops over all 9 addon-key → required-sector pairs from
    one jsonb map, closing the free-trial path
    (`startMaxAddonTrial`, two separate client-side copies in
    `DispatcherView.jsx` and `IndustrialDispatcherView.jsx`, neither
    going through any edge function) the same way the original trigger
    did for `asset_intelligence` alone. Same old-vs-new transition logic
    as the original, for the same reason: `businesses` rows get updated
    constantly for unrelated columns, and a current-value-only check
    would permanently brick any business that ever ends up with a
    stale mismatched flag.
  - No UI change needed in either dispatcher view — `DispatcherView.jsx`
    already filters `MAX_ADDONS` generically via
    `isAddonAvailableForSector`, so the catalog metadata change alone
    makes it correctly continue showing all 8 (it's trade-only, so
    always was showing them) while continuing to correctly hide
    `asset_intelligence`; `IndustrialDispatcherView.jsx` never iterated
    the catalog at all, so there was never a UI path exposing the other
    8 to industrial either.

Corrects the "All 9 Minerva Max add-on catalog descriptions... verified"
entry below — that check asked "does the feature do what its catalog
text claims," which is a different question from "can every sector
that's allowed to buy it actually reach the tables it touches." The
first one is description accuracy; the second is reachability, and it's
the one that caught this, the Pro/Industrial gap, and the Standard-tier
gap, every time. Worth deliberately re-asking that second question any
time a new tier, sector, or add-on is added, rather than assuming a
clean description-accuracy pass means the feature is actually reachable
by everyone who can buy it.

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
- **All 9 Minerva Max add-on catalog descriptions, cross-checked against
  their actual implementation** (2026-10-09) — closes a gap the earlier
  "sold vs. delivered" background audit explicitly deferred ("did not
  re-check the remaining 6 add-ons beyond this, per the task's lower-
  priority framing"). `ai_quotes` (fallback blank line item + always
  `status: 'draft'` pending review — `draft-quote/index.ts`),
  `surge_pricing` ($75 base + $50 after-hours + $50 weekend, an editable
  suggested line item, never auto-applied — `TechnicianView.jsx`),
  `crew_splitting` (crew inserted into `job_assignments` with a separate
  `role`, lead stays `jobs.technician_id` — `DispatcherView.jsx`),
  `subcontractor_pool` (`jobs.assigned_subcontractor_id`, a genuinely
  separate column, overflow-fallback only — `auto-assign-technician`),
  `carbon_estimate` (haversine distance × a static factor, matches its
  own "HONESTY NOTE" header exactly — already read in full for the scale-
  readiness fix), `xero_sync` (`Status: 'DRAFT'`, literally in the Xero
  API payload). All 9 now verified, all 9 accurate on description — but
  **this check asked the wrong question for catching a sector gap**; see
  the 2026-10-09 entry above, which found 8 more sector-reachability
  problems this pass never tested for.

## 2026-10-09 — any business owner could self-upgrade their own tier/add-ons for free, no Stripe charge (full writeup in SECURITY_NOTES.md)

Found immediately after the two entries above, by asking one level
deeper than "can the business that bought this reach it": "is the record
of what they bought itself forgeable." It was — `businesses`' 2026-09-14
RLS fix correctly stops a *stranger* editing a business they don't own,
but never restricted *which columns* the row's own real, logged-in owner
may write, so any customer could PATCH their own `subscription_tier` or
`max_addons` directly and every trigger/function that trusts those
columns (all of this session's own tier/sector fixes included) would
have believed it. Different and more serious than the sector-reachability
bugs above: those meant a paying customer couldn't use what they bought;
this meant nobody had to pay at all. Full writeup, exact exploit, and the
fix (`supabase_schema_delta_billing_identity_guard.sql`, a new `BEFORE
UPDATE` trigger — not yet applied live) are in `SECURITY_NOTES.md`'s
matching 2026-10-09 entry, since this is fundamentally a privilege-
escalation hole, not a feature-delivery gap. Deliberately leaves
`max_addon_trials` unlocked — the free trial is already documented
elsewhere as self-serve "by design," a separate, lower-priority,
product-call item, not folded into this fix.

## 2026-10-09 — added `notify-trial-ending`, the main account trial had no ending-soon reminder

Noticed while closing out the two entries above: Minerva Max add-on
trials get a reminder 3 days before they lapse
(`notify-addon-trial-ending`), but the main account's 7-day Stripe trial
— the one every signup starts on — never had an equivalent, even though
it ends in a real card charge rather than a feature quietly turning off.
Confirmed with the user before building (a genuine product-completeness
call, not a bug — there's already a welcome email at signup stating the
billing terms upfront, which meaningfully softens the gap): asked via
`AskUserQuestion`, chose to build it.

New function `notify-trial-ending` (`supabase/functions/notify-trial-ending/`),
registered + scheduled daily at 6:45am UTC
(`supabase_schema_delta_trial_ending_reminder{,_registration,_cron}.sql`,
none yet applied live). Unlike the add-on-trial reminder, there's no
local column to read a trial's end date from — it lives only on the
Stripe subscription object — so this calls `stripe.subscriptions.retrieve()`
per candidate business, batched via `chunk()` from the start (same cost
shape as `reconcile-billing`'s own per-business Stripe calls, built
batched up front rather than needing a later scale-readiness pass).

Two correctness issues caught before this ever shipped, both by the same
discipline already proven out earlier today:
- **Pure logic extracted and tested** (`logic.ts`/`logic.test.ts`, 11
  tests) specifically because Stripe's `trial_end` is Unix *seconds* and
  every other date computation in this codebase is milliseconds — a
  silent 1000x mixup would make the reminder fire constantly or
  basically never, not throw. Writing the seconds-to-ms test caught a
  real bug in the first draft: `Math.ceil` on the remaining-time
  calculation reported "1 day left" for a trial ending in 3 hours,
  overstating how soon it actually was. Fixed to `Math.floor`, which
  can't say more time remains than genuinely does.
- **Self-clearing vs. bounded, caught against my own new code this
  time**: the first draft only stamped the claim column when actually
  sending a reminder. A business that converts to paid (or cancels)
  *before* ever reaching the 3-day window would then never get stamped,
  staying in every future run's Stripe-querying candidate set forever —
  the exact lesson `SCALE_READINESS_NOTES_ROUND2.md` already names for a
  different function, re-applied here against a function written the
  same day. Fixed by splitting the decision into `shouldSend` (actually
  notify) and `shouldClaim` (stop checking this business again) —
  claims on "no longer trialing" too, not just "reminder sent."

726/726 tests pass. Not yet applied/deployed live — same reason as every
other pending delta this session.

## 2026-10-09 — a declined card was only ever surfaced to the business via an in-app banner, never proactively

Found immediately after building `notify-trial-ending` above, by asking
the same question against the adjacent case: does the business get told
when something billing-related actually needs their attention, or only
if they happen to be looking at the app? `invoice.payment_failed`
already recorded `payment_failed_at` (read by an in-app banner in
`DispatcherView.jsx`/`IndustrialDispatcherView.jsx`) and emailed the
*operator* — but never the business itself. Stripe's own dunning/retry
cycle can run for days to weeks before giving up and firing
`customer.subscription.deleted`; a business could lose their whole
account having never been proactively told their card was declined,
only an in-app banner they might never see. Unlike the trial-ending
case, there's no existing softening factor here (no upfront email sets
an expectation about THIS) — went ahead and built it directly rather
than asking again, same category of fix, now with the user's own
precedent from the trial-ending approval.

Fixed by extending the existing `invoice.payment_failed` handler in
`stripe-webhook/index.ts` (no new function, no new SQL delta — the
`businesses.contact_email` and `payment_failed_at` columns already
exist) to also email the business's own `contact_email`, alongside the
pre-existing operator email, mirroring the welcome/trial-ending emails'
channel and tone. No throttle on repeated Stripe retries, matching the
operator alert's own already-established, already-accepted behavior —
each retry is genuinely new information, not a duplicate.

Checked the two adjacent cases for the same gap before stopping —
`charge.dispute.created`/`closed` and `charge.refunded` — and confirmed
they're correctly operator-only **by design**, not an oversight: those
are disputes/refunds against client invoice payments processed through
Minerva's *own* Stripe account (not split via Connect), so it's the
operator who needs to submit evidence or track the refund, not the
business — already explicitly reasoned through in that code's own
comment. 726/726 tests pass (no new pure logic extracted — this is a
direct `fetch` call alongside the existing, equally-untested operator
alert it mirrors). Not yet deployed — `stripe-webhook` is already in
Phase 3's redeploy list.

## 2026-10-09 — the most severe case in this same chain: an actual cancellation notified nobody at all, business or operator

Followed the same question one step further to its worst case:
`customer.subscription.deleted` — the final outcome when Stripe's
dunning cycle gives up entirely — was a pure database write
(`subscription_tier: 'cancelled'`) with **zero notification to anyone**.
The existing comment said this was "so the dispatcher app can show a
cancelled state," which only reaches someone who happens to log back in
after their service has already stopped. Worse than the payment-failed
gap above: this is the actual, often-irreversible endpoint, not a
still-retrying warning, and unlike that case, not even the *operator*
was told — a platform owner could lose a subscriber and never find out
except by noticing in the Stripe dashboard.

Fixed by extending `planSubscriptionDeleted` (`logic.ts`) to read
Stripe's own `cancellation_details.reason` and classify the event as
`involuntary` (payment failed/disputed — Stripe gave up) or not (the
business cancelled themselves via the Customer Portal, which already
showed them Stripe's own confirmation screen). Wording branches on
this: an involuntary cancellation tells the business what happened and
how to come back; a voluntary one is just a plain confirmation, since
they already know. Notifies three ways: business email, business Slack
(if configured — added here as the **first** use of Slack alongside
cancellation, and extended the payment-failed email above to also post
Slack, so these three closely-related billing alerts don't look like
one of them was built to a lower standard than its neighbors), and
operator email, consistent with every other operator alert in this
file. Only fires when the update actually wins the existing out-of-order
guard — a stale/superseded event correctly stays silent, since nothing
changed for anyone to be told about.

4 new tests on `planSubscriptionDeleted`'s involuntary classification
(cancellation_requested / payment_failed / payment_disputed / no reason
given). 730/730 tests pass. Verified `index.ts` itself parses cleanly
with `npx esbuild` (not just that the `logic.ts` the tests import does —
see minerva_setup_progress.md's technique note). Not yet deployed.

## 2026-10-09 — closed the loop: a recovered payment now tells the business too, not just a disappearing banner

The last piece of this chain. `invoice.payment_succeeded` already
cleared `payment_failed_at` on a successful charge, silently — correct
for the overwhelmingly common case (an ordinary monthly renewal, where
`payment_failed_at` was already null and nothing newsworthy happened),
but also silent for the one case where it IS newsworthy: a real recovery
after a real failure. A business that got the "payment didn't go
through" email had no equivalent "you're all set now" follow-up — the
only way they'd find out was the in-app banner quietly disappearing
next time they happened to log in.

Distinguishes the two cases without a new column: added
`.not('payment_failed_at', 'is', null)` to the existing UPDATE, so the
row (and the notification) only matches when the value was genuinely
set beforehand — a routine renewal where it's already null simply
doesn't match, `biz` comes back null, and nothing fires. Same
email+Slack channel as its two siblings (payment-failed, cancelled).

With this, the full subscription-billing lifecycle is proactively
communicated end to end for the first time: trial starting (pre-existing
welcome email) → trial ending soon (`notify-trial-ending`, new) →
payment declined, still retrying (extended) → payment recovered (this
entry) → subscription actually cancelled (extended), each reaching the
business itself and, where relevant, the operator — not just an
in-app banner nobody's guaranteed to see. 730/730 tests pass (no new
pure logic — conditional UPDATE + inline fetch, same shape as its
siblings). Not yet deployed.

## 2026-10-10 — an industrial subscription couldn't actually be worked, by anyone, ever

The most severe sold-vs-delivered instance found in this project so far
— not wrong-sector (lesson 10's usual shape, Pro/Standard/8 Minerva Max
add-ons all marketed to the wrong sector but at least reachable by the
*right* one), but entirely unbuilt for the sector it's FOR. An
industrial business signs up, adds technicians in Onboarding.jsx exactly
like a trade business does, and Minerva texts each one a real
`/tech?pin=...` setup link today — that part has worked since the
industrial sector shipped (2026-09-01). But `TechnicianView.jsx` — the
only technician-facing view in the whole app, used regardless of sector
— discovers "what work is assigned to me" exclusively through
`technicians.current_job_id -> jobs`, a trade-only mechanism with no
industrial equivalent of any kind: no column, no join table, nothing.
Confirmed by a full repo grep (both the live app and a dedicated
read-only investigation before any code was touched): zero code paths
anywhere ever set such a thing for industrial, and zero code paths
anywhere ever INSERT into `site_checkins` either — every single
reference to that table across `src/` and `supabase/functions/` was a
read. `Features.jsx`/`Enterprise.jsx` market "Multi-day site
tracking... arrival/departure check-ins" as a real, working capability
— it could not produce one row, for any business, ever, since the
industrial sector launched. Three cron agents ("The Warden" —
detect-safety-hazards, "The Pacer" — sequence-handoffs, and
package-client-verification) have been reading this permanently-empty
table on schedule the entire time.

Concretely, before today: an industrial technician taps their real setup
SMS link, authenticates successfully (PIN auth is completely
sector-blind), and sees their name, their business name, and a single
"Start Tracking" button — forever. GPS pings still send but go nowhere
useful (no live map on the industrial console, by design). Reporting an
issue still writes to `technician_incidents`, but that table was never
read by `IndustrialDispatcherView.jsx` either (a second, smaller, same-
root-cause gap, fixed in the same pass) — so even that was invisible to
their own dispatcher. No error anywhere, no crash — just a permanent,
silent dead end for every real industrial technician who will ever sign
up, undetected because the industrial sector has zero real customers
yet and nothing short of actually using the technician app as an
industrial technician would surface it.

Fix mirrors the proven trade-side pattern exactly rather than inventing
a new one: `technicians.current_site_id` is the direct sibling of
`current_job_id` (`supabase_schema_delta_technician_site_assignment.sql`
— 1 new column + 3 RLS policies, not yet run). No new join table needed
— unlike `jobs.technician_id` (one job, one primary tech, crew via
`job_assignments`), this points the other way, FROM the technician, so
multiple technicians can already share one `current_site_id` with
nothing extra required, a natural fit for multi-day site work. RLS
needed real care, not just a column: `site_projects`/`site_checkins`
were correctly scoped to the business OWNER's session by
`rls_scoping_v3.sql` (2026-09-14) — a technician's own authenticated
session satisfies neither policy at all, the identical near-miss shape
already caught once today in `businesses_select_scoping.sql`'s own 4th
branch. Checked `rls_scoping_v3.sql`'s actual policy text before writing
any UI, not assumed — without the two new technician-scoped policies,
every read/write on the new site card would have silently failed RLS
with no indication why.

`IndustrialDispatcherView.jsx`: technicians query now includes
`current_site_id`; new `assignTechnicianToSite()` plus an assign/remove
UI on each site card (Sites tab); new "Field reports" section (Safety
tab) surfacing `technician_incidents`, previously never read here.
`TechnicianView.jsx`: `sector` added to the existing explicit
`businesses(...)` field list; new `currentSite`/`checkedIn` state; new
`loadSite()` (mirrors `loadJob()`, also derives current-checked-in state
from the technician's own most recent check-in — same open/closed
presence rule "The Warden"'s `computeOpenPresenceByPerson` uses, scoped
to one person); new `toggleSiteCheckin()` writing `role:
'human_technician'`; realtime subscription extended to watch
`current_site_id` alongside the existing `current_job_id` watch; a site
card mirroring the job card, Check in/Check out buttons reusing the
existing `btnGreen`/`btnOrange` styles. All of this is additive — every
effect/handler already keyed on `currentJob` (SMS triggers, voice notes,
crew detection) is untouched and continues to no-op exactly as before
for an industrial technician, since `currentJob` was already always
null for them.

Deliberately NOT built: the `'automated_process'` leg of `site_checkins`
(what the Warden/Pacer's other half consumes) — what a piece of
equipment "checking in" even means physically isn't specified anywhere
in this codebase, it's a separate and far more speculative integration,
and unlike arrival/departure check-ins it was never itself a marketed,
customer-facing claim. Left exactly as it already was: a dormant
downstream consumer that simply won't fire until/unless that side is
built later — not a regression, since neither leg existed before today
either. Also deliberately NOT built: SMS notification when a technician
is assigned to a site (the direct parallel to `send-job-assignment-sms`)
— valuable, but a materially bigger, separately-scoped lift to build
with the same idempotency/ownership-auth/kill-switch hardening that
function has, and not itself required to make the marketed check-in
capability real. Flagged here as a clear, well-defined follow-up rather
than silently dropped.

737/737 tests pass (no regressions; no new pure logic extracted —
consistent with this project's existing convention that neither
`TechnicianView.jsx` nor `IndustrialDispatcherView.jsx` has ever had a
`.test.js`, both being page components with no extracted `logic.ts`).
Both files re-verified with `npx esbuild --bundle=false` (no Deno/node
test runner reaches these two directly). Not yet deployed — the SQL
delta must run before either file's next deploy, same ordering rule as
every other delta in this file.

### Same day, follow-on: a generated verification package had no way to ever reach a client

Found while the entry above was still fresh, by re-asking its own
question against the industrial sector's OTHER headline capability.
`package-client-verification`'s own header comment (2026-09-01) says it
"mirrors the trade sector's Dispute Pack — see `DisputeView.jsx`" — a
read-only, no-login, shareable-link page. That page was never actually
built for `client_verification_packages`. Combined with
`rls_scoping_v3.sql` correctly closing this table's original wide-open
anon policy down to owner-only (the same project-wide tightening applied
to a dozen other tables that day), the result: a package could be
generated, a Slack message would say "ready to present for client
sign-off" — but no page anywhere let a client actually see it. Worse,
`signed_off_at` — the column `IndustrialDispatcherView.jsx`'s own badge
already displayed ("pending sign-off" / "signed off") — was referenced
in exactly that one display line and nowhere else in the entire
codebase. Nothing, anywhere, ever wrote it. Every package, forever,
would read "pending sign-off" no matter what actually happened.

Checked before building anything: does any other page in this app let a
CLIENT digitally sign or approve something themselves? No — every
"approve" in the codebase (outreach drafts, growth drafts, weather
reschedule drafts) is an internal operator action on their own business's
own data, never a client-facing one. Building a client self-service
digital-signature flow here would have been inventing a new product
pattern with zero precedent, not completing an existing one. Chose the
narrower, precedent-consistent fix instead:

- New `src/pages/VerificationPackageView.jsx`
  (`/verification/:packageId`), mirroring `DisputeView.jsx`'s exact
  shape — summary, check-ins, telemetry, safety log (all read directly
  from the package's own `evidence` jsonb snapshot, no live re-query
  needed), print button, no login. Verified live: navigating to a
  nonexistent package id correctly renders the "invalid link" error
  state with no crash (the only live check possible without creating
  real test data — the underlying RLS policy itself still needs a real
  package id to verify after the delta runs, noted in that file).
- `supabase_schema_delta_verification_package_view.sql` (not yet run):
  1 new anon SELECT policy, scoped by id only, same unguessable-link
  trust model as `/dispute/:jobId`/`/invoice/:invoiceId`. No other new
  anon access needed — the package's `evidence` snapshot is
  self-contained.
- `IndustrialDispatcherView.jsx`: new "Copy client link" and "Mark
  signed off" buttons per package in the Verification tab.
  `markPackageSignedOff()` is the only writer of `signed_off_at`
  anywhere in the codebase — a deliberate, dispatcher-side manual
  record of a real-world event (the operator personally received
  sign-off, by whatever channel), same spirit as the outreach "Record a
  reply or a win" tool built earlier this session, not a stronger
  digital-signature claim this product has no other precedent for.

737/737 tests still pass. All three touched/new files re-verified with
`npx esbuild`. Not yet deployed — the new SQL delta must run before
this frontend change reaches production, same ordering rule as every
other delta in this file.

### Same day, second follow-on: closing the loop on the sales copy that already promised both fixes above

With both gaps above now closed, checked whether anything written for
the actual outreach campaign had already promised either one as real —
not a hypothetical concern: `INDUSTRIAL_COMPETITIVE_STRATEGY.md`'s own
Rule 4 explicitly instructed pulling up the live check-in log on a
prospect's own phone during a call, and `CLIENT_PITCHES_ADDENDUM.md`
labeled both capabilities "actually built and honestly sellable today."
Neither claim was true when written. Since no real outreach has gone
out yet (confirmed earlier this session), this never actually reached a
prospect — but had a call happened on this script before today, the
live demo it explicitly calls for would have shown an empty list where
the pitch promised a working system.

No copy needed to change — every claim is accurate now that both gaps
are closed, this was purely about leaving an honest record that it
wasn't always true. Added a dated correction note at each of the 4
spots (`CLIENT_PITCHES_ADDENDUM.md`, `INDUSTRIAL_COMPETITIVE_STRATEGY.md`
×2, `EXACT_OUTREACH_EMAIL_DRAFTS.md`'s Client 9 section header),
matching this project's existing convention for marking a stale claim
without rewriting the surrounding pitch. General lesson worth keeping:
when a product gap gets fixed, it's worth a pass over the sales/outreach
docs for anything that already assumed the fix — not just the product
code itself.

## 2026-10-10 — the most important lifecycle event of all had no operator alert

Closing the loop on the subscription-lifecycle communication work from
earlier today (trial-ending → payment-failed → payment-recovered →
cancelled, all now proactively emailed to both the business and the
operator). Checked the one event that chain never actually started
from: `checkout.session.completed` — a brand new signup completing
checkout and starting their trial. Every other lifecycle event in
`stripe-webhook/index.ts` alerts `OPERATOR_EMAIL` (payment failed,
cancelled, disputed, Pro/Industrial Customer-Portal mismatch) — this
one, the single most important and most positive event of all, never
did. The business itself gets a welcome email; the person actually
running Minerva would have had no way to find out a real signup
happened except by independently checking the Supabase dashboard.

Found while thinking through what "connect everything to work
perfectly" (the standing goal's own phrase for the moment a prospect
actually accepts) literally requires: the operator finding out in real
time is a precondition for following up personally, which matters most
of all for an early, low-volume customer base.

Fixed with the exact same pattern every other alert in this file
already uses: a business-scoped Slack post via the shared
`notifySlack()` helper, plus an `OPERATOR_EMAIL` email gated on
`shouldAlertOperator()`, both best-effort and never blocking the
underlying `businesses` write or the customer's own welcome email.
Caught and fixed one thing in my own first draft before committing:
chained a redundant `.catch()` onto `notifySlack()`, which already
swallows its own errors internally — every other call site in this file
just `await`s it directly with nothing chained on, confirmed by grepping
all 4 call sites before finalizing, not assumed from the one I was
copying from. 737/737 tests pass; `index.ts` re-verified with `npx
esbuild`. `stripe-webhook` was already in `DEPLOY_RUNBOOK_PENDING.md`'s
pending-redeploy list from earlier changes today, so no new deploy-order
entry was needed — this just rides along with that existing redeploy.

**Considered, deliberately not implemented, same pass:** a separate
operator alert for the moment a trial actually converts to its first
real charge — arguably even more significant than the signup alert
above, since a trial can be abandoned before ever converting, and 7
days is long enough that the operator may have forgotten the original
signup ping by then. `invoice.payment_succeeded`'s own comment already
explains why it's currently silent for this exact case on purpose: it
only alerts on a genuine payment-failed recovery (`.not('payment_failed_at',
'is', null)`), and is deliberately silent for "the very first invoice on
a fresh subscription" same as every routine renewal, since
`payment_failed_at` is null in both cases. Distinguishing "first real
charge after a trial" from "just another monthly renewal" needs a
reliable signal this codebase has never used anywhere
(confirmed by grep — zero references to Stripe's `billing_reason` field
or an invoice's `amount_paid`/trial status anywhere in this directory),
and guessing at Stripe's exact semantics here without a real test
account to verify against risks shipping something worse than not
having it: either silently never firing (looks done, isn't) or firing
on a $0 trial-start invoice with "payment succeeded!" wording that
would actively mislead the operator. Worth building once there's a way
to verify it against Stripe test-mode data for real — the research
starting point is Stripe's own `invoice.billing_reason` field
(`subscription_create` on the very first invoice of a subscription,
`subscription_cycle` on every renewal after) — but not worth guessing
at blind.

## 2026-10-10 — the flagship client-facing SMS had a hardcoded, almost-always-wrong ETA

Found by generalizing the `voidInvoice` "audit trail" prompt bug from
earlier the same day into a broader lens: search for every piece of UI
copy making a specific, checkable claim, then verify each one against
the real implementation. Most checked out (Xero reconnect-in-same-panel,
ingestion-key rotation, technician deactivation actually reducing the
Stripe quantity) — this one didn't.

`send-eta-sms`'s message — the literal text a real client receives,
arguably the single most client-visible moment this entire product
produces — hardcoded "is approximately 15 minutes away" unconditionally,
regardless of the technician's actual distance. The trigger condition
(`SMS_TRIGGER_KM`, `TechnicianView.jsx`) only ever fires within 2km of
the client. At any realistic local-street speed, 2km is nowhere near 15
minutes — the true range is roughly 1-5 minutes. Every single real ETA
text this product has ever been capable of sending would have overstated
the wait by a factor of 3-10x, in the one message a client reads to
decide whether to wait around.

Root cause: `send-eta-sms/index.ts` never received or queried any
distance/location data at all — only job/business/technician identity
fields. `TechnicianView.jsx` computes the real distance via `haversineKm`
to decide whether to fire the trigger in the first place, but never
passed that number through.

Fixed by threading it through instead of inventing new calculation
infrastructure: `triggerSMS` now recomputes the same `haversineKm` call
(same inputs already in scope) and passes `distanceKm` in the function
body; `send-eta-sms/index.ts` passes it to `buildEtaMessage`; a new
`etaPhraseFromDistance` (`_shared/sms.ts`) converts it to a real
estimate. Used a dedicated `ETA_LOCAL_SPEED_KMH = 25` rather than
reusing `optimize-daily-route`'s `AVG_SPEED_KMH = 40` — that one
estimates travel between a technician's *remaining jobs for the day*,
which can include longer, more open stretches; this message only ever
fires within a 2km radius, almost always local/residential streets,
genuinely a different, slower situation, not the same number copied
somewhere it doesn't apply. Floors at 1 minute (never shows 0 or
negative); falls back to a non-numeric "is on the way" — not the old
specific wrong number — when distance isn't available at all, so every
code path is now honest even in the untested edge case.

Also fixed the two marketing/demo mock texts that showed the same
pattern (`LandingPage.jsx`: "15 minutes", `Demo.jsx`: "12 minutes") —
both are now factually impossible outputs of the real system (the
trigger can't fire past 2km, capping the real estimate around 5
minutes), updated to a realistic "approximately 4 minutes" example.

744/744 tests pass (4 new, covering the distance-to-minutes math,
singular/plural phrasing, the 1-minute floor, and the no-data fallback).
All three touched backend/frontend files re-verified with `npx esbuild`.
Verified live: both updated marketing pages render the new text
correctly. Not yet deployed — `send-eta-sms` needs a normal function
redeploy (no SQL delta, no new column).

## 2026-10-11 — a real client reply had nowhere to land

Every client-facing SMS this product sends (completion, invoice, quote,
review-request) is, by definition, a text message — which invites a
reply. Checked whether anything in this codebase ever handled one
coming back. Nothing did: confirmed by grep, the only incoming-message
webhook anywhere is `missed-call-webhook`, for voice calls. A real
client who typed back "running late, can you come at 3 instead?" had
that message go precisely nowhere a business owner would see it in
their normal Minerva workflow — at best it would sit in the raw Twilio
Console, which nobody checks as part of daily operations. Checked
README.md, SECURITY_NOTES.md, and the sales/outreach docs before
concluding this was a genuine, unnoticed gap rather than an
already-considered, deliberately-deferred decision — this project
otherwise has a strong, consistent habit of flagging exactly this kind
of limitation explicitly, and this one wasn't flagged anywhere.

Not a full two-way conversation UI — that's a genuinely bigger feature,
out of scope here. Built the minimum that keeps a real reply from
vanishing: a new `incoming-sms-webhook` (mirrors `missed-call-webhook`'s
proven shape almost exactly — same Twilio-signature validation, same
claim-before-act idempotency against Twilio's own retry behavior, same
admin-client pattern). The one real architecture question — Minerva's
SMS all send from either a business's own `twilio_number` or the shared
platform fallback, so an incoming reply needs to be routed to the right
business — was already solved by `missed-call-webhook` for voice calls
via the exact same `twilio_number = To` lookup; this reuses that proven
pattern rather than inventing a new one. A business still on the shared
fallback number has the same inherent routing ambiguity
`missed-call-webhook` already accepts — not a new limitation this adds.

Goes one step further than a bare Slack relay: correlates the reply to
the client's own most recent active job by phone number (both sides
normalized through the same `formatAuPhone` this codebase already uses
for outbound sends) and appends it to that job's notes — the same
place, in the same `[timestamp] text` format, a technician's own voice
note already appears in `TechnicianView.jsx`, so a dispatcher finds it
exactly where they're already looking. Also posts to Slack either way,
matched or not, so nothing depends on a business owner proactively
opening a specific job. Deliberately does not auto-reply — an empty
TwiML response, not a generic "thanks for your message" text, since
auto-replying to an unknown, possibly urgent message risks reading as
dismissive; better to just make sure a real human sees it.

New table `processed_sms_sids` (same minimal, service-role-only shape as
the existing `processed_call_sids`) plus its own 90-day retention cron —
split into separate DDL and cron files per this project's own documented
convention against mixing the two, which an earlier draft of this exact
change briefly got wrong before being caught and fixed. Registered in
`agent_functions` ('core', matching its sibling) with no kill-switch
wired into the code itself, same risk-based scoping `missed-call-webhook`
already uses and explains in its own header — low-blast-radius side
effects (a notes append, a Slack post), and the function must always
return valid TwiML to Twilio regardless of any switch.

README.md's Twilio setup section gets a new optional step 5, mirroring
step 4's existing missed-call-webhook instructions exactly, including
that no extra `twilio_number` setup is needed if step 4 was already
done. 744/744 tests pass (no regressions; consistent with
`missed-call-webhook` itself, this function has no separate `logic.ts`
— it's I/O orchestration, not extractable pure logic). The new
`index.ts` re-verified with `npx esbuild`. Not yet deployed — needs the
new table before the function, and is genuinely opt-in per business
(requires that business's own Twilio Console configuration, same as
`missed-call-webhook`) even once deployed.

## 2026-10-11, same day — the email equivalent, but this one has no code fix

Found immediately after the incoming-SMS fix, by applying the same
question to email: does "just reply to this email" actually work?
Two operator-authored emails make this promise —
`recover-abandoned-signup` ("just reply to this email or get in touch")
and `new-subscriber-checkin` ("Just reply to this email. **A real
person reads every reply.**", the stronger, more specific claim of the
two.

Unlike the SMS case, this isn't a missing-webhook problem — normal
email already supports replies natively, no code required, *if* the
sending address is a real, monitored mailbox. Checked what it actually
is today: `RESEND_FROM_EMAIL` is unset anywhere (confirmed — not in
`.env.local`, not referenced as already configured anywhere), so
`send-email/index.ts`'s own fallback is live right now:
`onboarding@resend.dev`, Resend's shared sandbox address. This is not a
future risk — it is the **currently active** sending address for every
email this project has sent in testing so far. A reply to it would
bounce or land in Resend's own infrastructure, not anywhere a human at
Minerva would see it. "A real person reads every reply" is actively
false today, for anyone who has ever replied.

No code change to make here — the fix is real infrastructure, not a
function. `RESEND_FROM_EMAIL` needs to point at an address with an
actual mailbox behind it. Two realistic paths once the domain's DNS is
being configured anyway (same sitting as the Vercel A record and
Resend's own SPF/DKIM verification): Cloudflare Email Routing (free,
forwards any address at the domain straight to an existing inbox, if
DNS ends up on Cloudflare) or a real hosted mailbox (Google Workspace
or similar, ~$8-10/month). Flagged clearly rather than silently
noted — this is exactly the kind of thing that's easy to fix at the
code level (just change the email copy to stop promising a reply) but
the more valuable fix is making the promise true, not quieter.

## 2026-10-18 — Growth pillar's two human-click functions had no server-side tier check

Found by applying this file's own recurring question — "is this gate
enforced where the real action happens, or only in the UI" — to the
Growth pillar. `generate-growth-drafts` only ever writes `marketing_drafts`
rows (`ad_campaign`/`outreach_sms`) for `subscription_tier === 'pro'`
businesses, and Growth is marketed and billed as Pro-only ($119/tech/mo).
But the two functions that actually act on a draft — `launch-ad-campaign`
(spends real Meta ad budget) and `send-growth-message` (sends a real
Twilio SMS blast) — never checked the tier themselves at all, confirmed by
grep: zero hits for `subscription_tier` in either file. The only gate was
`DispatcherView.jsx` hiding the "Approve & Launch"/"Approve & Send" buttons
for non-Pro businesses — the identical "UI-only gate, not enforced where
the real action happens" bug class this file already documents twice
(the Pro/Industrial sector mismatch and the Minerva Max add-on sector
mismatch entries above). Both functions already had a real caller-identity
check (the 2026-09-27 ownership fix, see `SECURITY_NOTES.md`) — that closes
"is this caller who they claim to be," a different question from "is this
caller's own business entitled to this feature." A Starter or Standard
business's dispatcher, using their own genuine session (no forged identity
needed), could invoke either function directly — e.g. via curl with the
anon key and their own real JWT — and it would run anyway: real ad spend
through Meta, or a real Twilio SMS blast to their own leads, without ever
paying the Pro price that pays for either.

Fix: new `hasGrowthPillarAccess(tier)` helper in
`_shared/tierEligibility.ts`, same pattern as `isTierAvailableForSector`/
`hasStandardAutomation` above — pure, unit-tested, tier-only (no sector
condition: `generate-growth-drafts`' own gate is sector-agnostic too, and
`isTierAvailableForSector` already keeps 'pro' from being a legitimate
value for an industrial business in the first place, so there's no
sector-mismatch combination to additionally guard against here). Both
edge functions now add `subscription_tier` to the `businesses(...)` column
list they already select as part of their existing draft-ownership query
(no extra round trip) and reject with a 403 if `hasGrowthPillarAccess`
returns false, checked right after the existing ownership check and before
either function's atomic "claim the draft" update — so a non-Pro business
is turned away before any spend or send, not after.

762/762 tests pass (8 new, covering `hasGrowthPillarAccess`). Both edited
edge functions re-verified with `npx esbuild`. Not yet deployed.
