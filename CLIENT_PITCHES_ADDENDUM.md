# Minerva — Client Pitches Addendum (2026-09-01)

Companion to `antikythera_minerva_client_pitches.docx`. Do not replace that
file — this only adds what's changed since it was written: new capabilities
from the "Agent Expansion Pack" (Track A) and the Agent Operating System
build, plus a 9th client profile for the new Industrial sector (Track B).

**Read `SALES_CLAIMS_ACCURACY_NOTE.md` before using any line below on a real
call.** Some of these are safe to say today; some aren't live until
`ANTHROPIC_API_KEY` is configured.

---

## New capability lines to insert into the existing 8 scripts

These are genuinely built and deployed-pending (not aspirational) — safe to
use once the corresponding functions are confirmed deployed, **and once
you've checked the tier/sector note on each one below (added 2026-10-10 —
these didn't used to need a qualifier, but three of the four now do; see
`SALES_CLAIMS_ACCURACY_NOTE.md`'s "Safe to say" section for the full,
current list)**:

**Dead-lead win-back** (`winback-lost-leads`) — **Standard tier and up**
(trade sector only, which Clients 1/2/3/5/6/7 all are — fine for this
list, just don't reuse the line for a Starter-tier conversation or an
industrial prospect). Insert into Clients 1, 2, 3, 5, 6, 7 (anywhere leads
go cold): *"Minerva also automatically re-texts leads that went quiet —
quotes you sent that never got a reply — trying to win the job back. You
don't have to remember to chase them."*

**Weekly growth drafts** (`generate-growth-drafts` + `launch-ad-campaign` +
`send-growth-message`) — **Pro tier only.** Insert into Clients 1, 3, 6, 7
(businesses actively growing their client base), but only once Pro is
actually on the table for that conversation: *"Every week, Minerva looks
at which suburbs you're under-booked in and drafts ad copy for you to
approve — you're not paying an agency to figure that out, and nothing
goes out without you clicking approve first."*

**Weather-risk auto-reschedule** (`check-weather-risk` +
`send-weather-reschedule-sms`) — **Standard tier and up, trade sector
only.** Insert into any outdoor-work business (roofing, gutter, painting,
pest control outdoor treatments, pool — not currently one of the 8
profiles but relevant to 6 and 7): *"For outdoor jobs, Minerva checks the
forecast and drafts a reschedule text before bad weather hits — you
approve it, the client gets a heads-up instead of a no-show."*

**Fair-rotation / burnout guard** (`update-technician-workload`) — insert
into Client 2 (HVAC, seasonal overtime risk) and Client 4 (cleaning, split
shifts): *"Minerva also watches each tech's hours and emergency-job load
through the week and flags it before someone's quietly heading toward
burnout — useful going into your busiest season, when you can least afford
to lose your best tech."*

**Referral loop** (`send-referral-code-sms`) — general insert, any profile:
*"Every paid invoice can include a referral code for the client to share —
no extra setup, no separate app."*

**Client 8 (competitor-switcher) — extra line:** *"None of this — the
dead-lead win-back and weather reschedule (Standard tier up), the weekly
ad drafts (Pro) — exists in ServiceM8 or Tradify at all. It's not a
feature gap you're trading up from, it's a category they don't compete
in."*

---

## Client 9 — Industrial / Heavy-Equipment Site Operations (NEW — Track B)

Different buyer, different sales motion from Clients 1–8. Longer cycle,
higher contract value, decision-maker is usually an operations or site
manager rather than an owner-operator.

**Who they are:** A construction, civil, or industrial subcontractor
running multiple active job sites at once, with a mix of crew and
heavy equipment (excavators, generators, compressors). They currently
track site attendance, safety incidents, and consumables (welding wire,
hydraulic fluid, etc.) on paper, in a site diary, or not at all. When a
client asks for proof of what happened on site and when, someone has to
reconstruct it from memory or photos on someone's phone.

**What's actually built and honestly sellable today** (read the honesty
note in `supabase_schema_delta_industrial.sql` before promising anything
beyond this — there is no real RFID/BLE/drone hardware integration yet,
only a working ingestion endpoint ready for one):

**Correction, 2026-10-10:** the two bullets below marked with a † were
NOT actually true when this section was first written — the site
check-in log had no insert path anywhere in the codebase (every
reference to `site_checkins` was a read) and no page existed for a
client to ever view a verification package. Both are genuinely built
and working as of today (see `BILLING_INTEGRITY_NOTES.md`'s matching
entries) — this section's description of them was always the right
target, it just wasn't live yet. Worth remembering generally: "honestly
sellable" needs the same re-verification discipline as any other
falsifiable claim in this codebase, not just a one-time label.
- **† Site check-in log** — arrival/departure/task-start/task-complete
  records per person per site, with a same-zone human/equipment proximity
  flag ("the Warden").
- **Safety incident log** — warning/hazard severity, acknowledgeable,
  timestamped, per site.
- **Consumables low-stock alerts** — reorder threshold per item per site,
  alerts once (not every run) until restocked.
- **† Client verification packages** — an auto-assembled evidence snapshot
  (check-ins + safety log + telemetry-to-date) the client signs off on, so
  "prove what happened on site" stops being a manual reconstruction job.
- **Asset register with engine-hours maintenance alerts** — works today via
  manual/CSV entry of engine hours; real-time telemetry requires the
  client's own hardware/vendor feed plugged into the existing ingestion
  endpoint (a real integration project, not a checkbox).

**What NOT to promise on a call:** live GPS dots on heavy equipment without
a hardware feed, automatic lead sourcing from LinkedIn/industry registries
(manual/CSV import only), drone or mesh-network anything. If asked, be
direct: *"The data model and alerting are fully built and live. Real-time
telemetry from your actual equipment needs your hardware or telematics
vendor's feed connected to it — that's a short integration project, not
something that exists out of the box."*

**The exact opener:**

> "Hi [Name], I build Minerva. Quick question — if a client asked you to
> prove exactly who was on site and what happened at 2pm last Tuesday, how
> long would that take you to put together? [Let them answer.] Right —
> Minerva keeps that record automatically as it happens: check-ins, any
> safety incidents, consumables running low. When a job wraps, it assembles
> one evidence package the client signs off on instead of you reconstructing
> it from someone's phone photos. Worth 20 minutes to see it?"

**How to find them:** Master Builders Association member directories
(state-based), civil contractor associations, LinkedIn search for
"site manager" / "operations manager" + relevant trade, tender/registry
sites where subcontractors are listed publicly.

**Pricing — corrected 2026-10-10, read this before quoting anyone:** this
section used to describe a flat per-site "Site Standard $199 / Site Pro
$349" model, framed as a deliberate answer to competitors' per-seat
pricing complaints. That pricing was never built — checked directly
against the billing code (Onboarding.jsx, Stripe price IDs,
create-checkout-session): industrial is billed exactly the same
per-technician way as every other Minerva sector, because it shares the
same `subscription_tier` column and the same three Stripe prices. There
is no per-site rate, no "Site Standard," no "Site Pro," and no
data-sharing-discount variant of either. Whoever wrote this section was
describing a real, well-reasoned product idea — flat-rate-per-site is a
genuinely good differentiator against GoCanvas/Fieldwire's per-seat
complaints — but it describes something that doesn't exist in the live
product, and quoting it on a real call would set an expectation the
actual Stripe checkout then contradicts.

**What to actually quote today: $49/tech/month, Starter tier.** That one
price already includes everything below — site check-in log (with the
Warden proximity flag), safety incident log, asset register (manual/CSV
engine-hours entry), consumables low-stock alerts, and client
verification packages. Standard ($79/tech) exists as a tier name but adds
nothing for this sector today (nothing in the industrial code path checks
`subscription_tier` at all — see `SALES_CLAIMS_ACCURACY_NOTE.md`'s
"On Pro tier and Industrial sector" correction) — don't offer it as an
upgrade with no answer to "upgrade to get what, exactly." Pro isn't
offered for Industrial at all.

**The flat-rate-per-site pitch angle is still worth having — as a real
product decision, not sales copy for something unbuilt.** If a genuine
flat-per-site price (or a per-site cap/ceiling on top of the existing
per-technician billing) is something worth actually building, that's a
product call, not a copy-editing one — flag it to decide, same as every
other "should we build this" question this project has handled by
asking rather than assuming. Until/unless that happens, sell on
capability and the real per-technician price, not a pricing structure
that sounds more competitive but isn't live.

**The competitive comparison against Raken/Fieldwire below is removed,
not rewritten** — it was built entirely on the fictional per-site numbers
(e.g. "$199 flat beats $370-390 for a 10-person site"), and redoing that
math honestly for $49/tech pricing needs current, verified competitor
pricing this note can't source or confirm from the codebase — that's a
research task for whoever owns this pitch material next, not something
to guess at here.

**Objection — "we already log this in a site diary":** *"A site diary tells
you what someone remembered to write down after the fact. This is
timestamped as it happens, and it's the thing you hand a client when they
ask for proof — not something you have to rebuild from memory."*

**Cross-sell note — Client 3 (electrical, mixed iOS/Android):** electrical
contractors doing commercial or industrial work (switchboard installs,
site-power hookups, plant maintenance contracts) sit on multiple active job
sites with a mix of crew and equipment — the exact shape of Client 9's buyer.
If a Client 3 conversation surfaces this kind of work, it's a legitimate
in-account upsell question, not a separate cold pitch — but it's a bigger
ask than this note used to make it sound. **This isn't an add-on toggle on
the same account: industrial is a separate `sector` value set once at
signup, with its own console (`IndustrialDispatcherView.jsx`) and its own
data model entirely separate from the trade jobs/leads/invoices Client 3
is already using.** A Client 3 business genuinely running both trade
dispatch and industrial site work today needs a second Minerva signup for
the industrial side, not a same-account upgrade — worth knowing before
promising something that sounds like a checkbox and is actually a second
account. Still ask the question if it surfaces: *"Since you're already
running Minerva for dispatch — on the industrial or commercial jobs, do
you ever get asked to prove who was on site and when? Minerva has a
separate side built for exactly that, same pricing, different console —
worth a quick look?"* Don't lead a Client 3 call with this — it's a
follow-up question once the core electrical pitch has landed.

---

Update this file alongside the main pitch doc whenever a new agent
capability goes live — don't let the two drift apart.
