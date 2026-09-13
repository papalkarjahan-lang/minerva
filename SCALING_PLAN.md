# Minerva — Scaling Plan

This is a **trigger-based** plan, not a build-it-now list. Every item below
names the specific, observable condition that makes it worth doing — not a
date, not "eventually," a real number or event you'll actually see happen.
Building any of this before its trigger fires would be the same mistake as
the buzzword-infrastructure ask from earlier this session: solving a
problem that doesn't exist yet, on guesswork instead of real usage data.

Nothing in this document is built. It's the answer to "what changes, and
when" once there's real traffic to force the question.

---

## 1. Security model — the biggest real one

**Current state** (see `SECURITY_NOTES.md`): the entire app runs on the
Supabase `anon` key with no login for dispatchers/technicians/clients.
Anyone who has a business's dispatch link has full read/write access to
that business's data — deliberately, because there's no way to scope RLS
tighter without breaking Realtime's live GPS map, and it's fine for "a
small number of trusted pilot clients" (the doc's own words).

**Trigger to revisit:** any ONE of —
- A prospect's IT/security team asks about tenant isolation during a sales
  conversation (this WILL happen once you approach anyone above ~20
  employees — Ken Hall Plumbers' scale is exactly where this gets asked)
- You cross ~15-20 paying businesses (link leakage risk compounds with
  count, not revenue)
- Any single client asks "what happens if someone forwards our dispatch
  link"

**What actually changes when triggered:** this isn't a small patch — it's
the work already partially started in `supabase_schema_delta_owner_auth.sql`
(dispatcher login exists for `/dispatch` and `/industrial` already).
Extending real `auth.uid()`-scoped RLS to the ~45 background-agent tables
that currently need anon cross-business reads requires either (a) moving
those functions to `service_role` (bypasses RLS entirely, function-side
scoping instead — the more realistic path) or (b) a per-business API key
model. This is weeks of work, not a quick delta — budget it as a real
project when the trigger fires, not a fix squeezed in alongside other work.

## 2. Database load

**Current state:** Supabase free/starter-tier Postgres, ~30 cron jobs on
15-min-to-weekly schedules, no materialized views, `lead_attribution_summary`
and similar views compute live on every query.

**Triggers:**
- Any dashboard query (attribution card, leads list) visibly slows down —
  first fix is an index on `leads(business_id, status)` and
  `leads(business_id, utm_campaign)`, not a rewrite
- `*/15 * * * *` cron jobs (`detect-safety-hazards`, `detect-wasted-trips`,
  `industrial-conductor`, `run-custom-workflows`, `sequence-handoffs`,
  `verify-checklist-photos`) start overlapping their own next run because a
  sweep takes >15 minutes — means you've hit real per-business data volume,
  fix is scoping each sweep to "changed since last run" instead of
  re-scanning everything
- Connection pool exhaustion errors in Supabase logs — upgrade compute tier,
  a config change, not a code change

**Not a trigger:** raw customer count alone. A handful of businesses each
with 100+ technicians stresses this system differently than 50 businesses
with 3 technicians each — watch the actual slow-query log, not a headcount
number.

## 3. Cron-vs-event-driven architecture

Addressed directly in the last conversation turn: most of what's on a cron
schedule today is cron **because the trigger is time passing**
(`nurture-stale-leads`, `check-credential-expiry`), not a data change — this
is correct now and stays correct regardless of scale.

**Real exception worth watching:** `run-custom-workflows` and
`sequence-handoffs` poll every 15 minutes for state changes (e.g. "a job
was completed") that a Postgres database webhook could fire on instantly
instead. **Trigger to convert these two specifically:** a customer
complains about a 15-minute delay on a workflow that's supposed to feel
instant (e.g. an automated follow-up sequence). Until someone notices the
delay, converting this is solving a problem nobody has.

## 4. Third-party usage costs (Mapbox / Twilio / Anthropic)

**Trigger:** once live, watch actual monthly spend against
`estimate_job_carbon`-style per-job cost logic doesn't exist yet for these —
worth building a simple `monthly_platform_cost_per_business` rollup (Mapbox
map-load count + Twilio SMS/call count + Anthropic token count, all
already loggable from existing API responses) **once you have enough paying
businesses that eyeballing the Twilio/Mapbox/Anthropic dashboards directly
stops being fast enough** — likely somewhere past 10-15 active businesses.
Before that, checking the three vendor dashboards directly is faster than
building a rollup for it.

## 5. Team / ops

**Trigger for first hire (support, not sales):** you personally can't
respond to a support request within your own stated SLA anymore — this is
usually the first real capacity wall for a solo technical founder, well
before sales capacity becomes the bottleneck.

**Trigger for first sales hire / SDR:** you have a repeatable, proven
outbound motion (i.e., you personally have closed 3-5 deals using the same
playbook) and the bottleneck is now your own hours in the day, not the
playbook itself. Hiring sales before that just scales an unproven process
faster — expensive, not helpful. This directly contradicts the earlier
"just find more perfect clients" instinct: more names doesn't fix an
unproven playbook, only real closes do.

**Trigger for a dedicated success/onboarding person:** once Day-7-style
onboarding calls are happening more than 2-3x/week and each one pulls you
away from building/selling.

## 6. Pricing / packaging at scale

**Current model:** per-technician pricing, three tiers (Starter/Pro/Max
add-ons).

**Trigger for a named "Enterprise" tier:** a specific prospect with 50+
technicians (Ken Hall Plumbers-scale) asks for something the current tiers
don't offer — custom SLA, a dedicated Slack channel, volume discount past a
technician-count threshold, or a multi-region rollout structure (see
Associated Cleaning Services' 400-site caveat in
`OUTREACH_DRAFTS_TOP_PICKS.md`). Don't pre-build enterprise packaging
speculatively — the real terms only become clear from that first real
negotiation.

## 7. Marketing, once there's real data

**Trigger:** first real paying customer with real, nameable results.
- Unlocks: filling in `CaseStudy.jsx`'s placeholders with true numbers,
  linking it live from the nav
- Unlocks: swapping the honest "founding customer" framing in outreach
  drafts (`SALES_CLAIMS_ACCURACY_NOTE.md`'s rule) for real social proof —
  "a [trade] business" (singular, true) once there's one, "several" once
  there genuinely are
- Unlocks: a real `og:image` for social previews (currently correctly
  omitted — no fabricated screenshot)

**Trigger for paid acquisition (ads, SEO investment beyond the current
sitemap/meta tags):** once outbound to the existing researched list has
produced at least one real conversion — proves the pitch works on a human
before spending money to reach more humans with the same pitch.

## 8. What does NOT get a trigger — stays as-is regardless of scale

- The cron-based "time passed" agents (section 3) — correct at any scale
- The three-tier technician-count pricing model's basic shape — likely
  fine indefinitely, only packaging changes (section 6)
- Fatigue-aware dispatch's soft-tiebreak design — a hard override would
  need real multi-technician conflict data to tune correctly, don't guess
  at thresholds now

---

## How to use this document

Don't work through this top-to-bottom on a schedule. Check back against it
when something actually happens — a prospect asks a hard question, a
dashboard gets slow, a cron job starts overlapping itself, you close your
first deal. The trigger firing is the signal to act, not the passage of
time.
