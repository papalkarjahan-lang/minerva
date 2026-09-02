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
use once the corresponding functions are confirmed deployed:

**Dead-lead win-back** (`winback-lost-leads`) — insert into Clients 1, 2, 3,
5, 6, 7 (anywhere leads go cold): *"Minerva also automatically re-texts
leads that went quiet — quotes you sent that never got a reply — trying to
win the job back. You don't have to remember to chase them."*

**Weekly growth drafts** (`generate-growth-drafts` + `launch-ad-campaign` +
`send-growth-message`) — insert into Clients 1, 3, 6, 7 (businesses actively
growing their client base): *"Every week, Minerva looks at which suburbs
you're under-booked in and drafts ad copy for you to approve — you're not
paying an agency to figure that out, and nothing goes out without you
clicking approve first."*

**Weather-risk auto-reschedule** (`check-weather-risk` +
`send-weather-reschedule-sms`) — insert into any outdoor-work business
(roofing, gutter, painting, pest control outdoor treatments, pool — not
currently one of the 8 profiles but relevant to 6 and 7): *"For outdoor
jobs, Minerva checks the forecast and drafts a reschedule text before bad
weather hits — you approve it, the client gets a heads-up instead of a
no-show."*

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
dead-lead win-back, the weekly ad drafts, the weather reschedule — exists in
ServiceM8 or Tradify at all. It's not a feature gap you're trading up from,
it's a category they don't compete in."*

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
- **Site check-in log** — arrival/departure/task-start/task-complete
  records per person per site, with a same-zone human/equipment proximity
  flag ("the Warden").
- **Safety incident log** — warning/hazard severity, acknowledgeable,
  timestamped, per site.
- **Consumables low-stock alerts** — reorder threshold per item per site,
  alerts once (not every run) until restocked.
- **Client verification packages** — an auto-assembled evidence snapshot
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

**Pricing:** Flat per-site, not per-seat — deliberately, because it's the
direct answer to the single most-documented competitor complaint in the
sector (see `INDUSTRIAL_COMPETITIVE_STRATEGY.md`, GoCanvas: dated,
multi-reviewer complaints about contracts that only go up, never down, as
crew headcount changes; Fieldwire: multiple reviewers citing cost jumping
once past ~5 seats). Minerva's price doesn't move when crew size does.

- **Site Standard — $199/site/month flat, unlimited crew on that site.**
  Site check-in log (with the Warden proximity flag), safety incident log,
  asset register (manual/CSV engine-hours entry), consumables low-stock
  alerts. This alone already beats Raken's Basic/Professional tiers on
  safety tracking — Raken gates Incident Tracking behind its top-priced
  Performance plan; it's in Minerva's base tier.
- **Site Pro — $349/site/month flat.** Adds client verification packages
  (the auto-assembled evidence snapshot) and priority support (founder's
  mobile, same as every other Minerva tier).
- **Data-sharing discount — $169/site (Standard) or $299/site (Pro)** for
  clients who opt into the same anonymized data-sharing arrangement as the
  Trade tiers' discount.
- **Real-time telemetry — scoped as a project, not a subscription tier.**
  Quoted once a client's actual hardware or telematics vendor feed is
  confirmed and connected to the existing ingestion endpoint. Don't fold
  this into a monthly number until it's a real, scoped integration.

Sanity check against the market: a 10-person site on Raken Performance
($37/user) or Fieldwire Pro ($39/user) runs $370–390/month for one site —
Site Standard at $199 flat (or $169 with the data-sharing discount) is
cheaper for any site with more than 5–6 people on it, and the price doesn't
change as the crew does. Below that headcount, lead with the flat-vs-per-
seat stability argument, not the raw number.

**Objection — "we already log this in a site diary":** *"A site diary tells
you what someone remembered to write down after the fact. This is
timestamped as it happens, and it's the thing you hand a client when they
ask for proof — not something you have to rebuild from memory."*

**Cross-sell note — Client 3 (electrical, mixed iOS/Android):** electrical
contractors doing commercial or industrial work (switchboard installs,
site-power hookups, plant maintenance contracts) sit on multiple active job
sites with a mix of crew and equipment — the exact shape of Client 9's buyer.
If a Client 3 conversation surfaces this kind of work, it's a legitimate
in-account upsell to Site Standard/Pro, not a separate cold pitch: *"Since
you're already running Minerva for dispatch — on the industrial or
commercial jobs, do you ever get asked to prove who was on site and when?
That's a separate add-on, same account."* Don't lead a Client 3 call with
this — it's a follow-up question once the core electrical pitch has landed,
not a reason to complicate the opener.

---

Update this file alongside the main pitch doc whenever a new agent
capability goes live — don't let the two drift apart.
