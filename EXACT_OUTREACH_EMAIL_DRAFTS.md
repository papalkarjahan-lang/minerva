# Minerva — Exact Cold Email Drafts, All 9 Client Profiles

Companion to `OUTREACH_EMAILS.md` (the generic 3-email sequence) and
`antikythera_minerva_client_pitches.docx` (the phone scripts these are
built from). These are not templates to personalise later — same rule as
the phone scripts: the wording is the result of the specific pain point
that profile actually has. Only swap the bracketed fields.

**Before sending any of these, read `SALES_CLAIMS_ACCURACY_NOTE.md`.**
Every line below already complies with it — "automatically" is used where
the phone scripts might say "smart," and no email claims the system
"learns." If `ANTHROPIC_API_KEY` is live by the time you send these, check
`ANTHROPIC_KEY_LIVE_UPGRADE_NOTE.md` for which lines can upgrade.

**Rewritten 2026-10-31 — what changed and why:**
- Every Email 2 now lists the real Standard/Pro-tier automation bundle
  (win-back texts, invoice-overdue reminders, lapsed-client check-ins,
  wasted-trip GPS evidence, one-click whole-fleet re-optimisation,
  weekly ad drafts, credential-expiry flags) **gated correctly per tier
  and sector** per `SALES_CLAIMS_ACCURACY_NOTE.md` — a Starter-tier price
  quote never lists a Standard-only feature as included. This is the
  "widened market" change: the old pitch sold GPS tracking with a couple
  of add-ons bolted on; this version sells the whole client-facing
  operations layer, with GPS as one piece of it, because that's what's
  actually built and documented in `AGENT_PANTHEON.md`.
- **Fixed a real bug found while rewriting:** several Email 2s said "no
  card required" on the free trial. That's false — Stripe Checkout always
  collects a card (`SALES_CLAIMS_ACCURACY_NOTE.md`, 2026-10-27 correction).
  Replaced everywhere with "card required to start, not charged until the
  trial ends."
- **ServiceM8/Simpro integration is NOT in this rewrite as a live claim.**
  The connector exists in code (`servicem8-oauth-connect`/`-callback`) but
  has no registered developer app, is untested against a live account, and
  has no pricing or UI. Client 8's email still offers a full migration, not
  a side-by-side connection, because that's the only thing actually true
  today. Don't add an integration claim here without updating this note
  first — see `README.md`'s ServiceM8 section for what's still outstanding.
- Every breakup (Day 7/9) email now also points to `/platform` — the plain-
  English page listing everything Minerva does, for a prospect who wants
  the full picture before replying rather than just the one-line hook.

**Fixed 2026-09-08:** the Day 7 emails for Client 1 (Plumbing), Client 4
(Commercial Cleaning), and Client 6 (Pest Control) previously included a
false social-proof line ("A few [trade type] businesses in [region] are
already running Minerva..." — untrue with zero real customers, per
`SALES_CLAIMS_ACCURACY_NOTE.md`). Replaced with an honest "founding
customer" framing that's true regardless of customer count and needs no
manual edit before sending. Once there are genuinely several real
customers in a given trade, feel free to swap back to real social proof —
just keep it truthful to the actual count (see
`SALES_CLAIMS_ACCURACY_NOTE.md`'s singular-vs-plural guidance).

Same send-time rule as the base sequence: Tue–Thu, 7:30–8:30am local time.
Never Monday, never Friday afternoon.

**Fixed 2026-10-18:** Client 8's email claimed "None of this... exists in
ServiceM8 or Tradify at all... a category they don't compete in" (dead-lead
win-back, weather reschedule, weekly ad drafts). Live web search found this
false or unverifiable: ServiceM8 has its own Quote Follow-Up Automation
(close enough to win-back that "doesn't exist at all" isn't safe), and
weather-reschedule/ad-drafts weren't confirmed either way. Both ServiceM8
and Tradify also turned out to already have route optimization (Tradify
markets it as AI-powered, "30% efficiency" — stronger than Minerva's own
15% benchmark) — not relevant to this specific email since it never
mentioned route optimization, but the same pattern that made this line
wrong. Removed the paragraph rather than replace it with a new unverified
claim — the email's actual hook (direct reference to their specific public
complaint) doesn't need it. See `CLIENT_PITCHES_ADDENDUM.md`'s matching
2026-10-18 correction for the full research and the general lesson: don't
claim a named, mature competitor lacks a feature without verifying first.

---

## Client 1 — Plumbing (3–7 vans)

**Email 1 — Day 0**
Subject: quick question about [Business Name]'s ETA calls

Hi [First name],

I build a tool called Minerva for plumbing businesses — a live map showing
every van, that automatically texts your client once their plumber is
close by (within about 2km) so your team stops taking "where is he" calls.

I noticed [specific detail — e.g. "a couple of recent Google reviews
mentioned not knowing when the plumber would arrive"]. That's the exact
thing this fixes.

20 minutes to set up on your team's phones, no app download. Worth a
10-minute screen share this week?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Email 2 — Day 3**
Subject: re: [Business Name]'s ETA calls

Hi [First name],

Following up in case this got buried.

You've got [N] vans — Minerva runs $[N x 79]/month, under $14 a day to know
where every van is live and stop taking "where is my plumber" calls.
7-day free trial — card's needed to start it, you're not charged until the
7 days are up, cancel anytime.

Worth knowing while I've got you: for that same price, Minerva also
automatically re-texts quotes that went quiet trying to win the job back,
reminds clients about overdue invoices, checks in with customers who
haven't booked in a while, and can re-plan your whole team's day in one
click if a job falls through — not just one plumber's route, the whole
roster. None of that is a separate add-on or a second login.

Reply "not now" and I'll leave it.

[Your name] / [Your mobile]

**Email 3 — Day 7**
Subject: last one — [Business Name]

Hi [First name],

Last note. We're onboarding a small number of plumbing businesses as
founding customers right now, before this opens up more broadly — the
pitch is simple: it kills the "where are you" calls in the first week, and
quietly chases the invoices and quotes you don't have time to chase
yourself.

Want to see it live on your own phone? 2 minutes, no signup:
https://minerva-green.vercel.app/demo. Want the full list of what it does,
no sales pitch: minerva-green.vercel.app/platform. If not, no hard
feelings.

[Your name] / [Your mobile]

---

## Client 2 — HVAC & Refrigeration (4–10 technicians)

**Email 1 — Day 0**
Subject: dispatching your closest tech to a 6am cool-room call

Hi [First name],

I build Minerva for HVAC and refrigeration businesses. Quick question:
when a commercial cool room goes down at 6am, how do you know which tech
to send without ringing everyone? Minerva puts every tech on a live map so
you can dispatch the closest one in seconds, and the client gets an
automatic text when someone's on the way.

20 minutes to set up, works on iOS and Android identically. Worth a
10-minute look this week?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Email 2 — Day 3**
Subject: re: [Business Name] dispatch

Hi [First name],

Following up — happy to keep this short.

At Standard, [N] techs runs $[N x 79]/month — that already includes
automatic re-texting of quotes gone cold, overdue-invoice reminders,
lapsed-client check-ins, and one-click whole-fleet re-optimisation when
the day's plan falls apart. At Pro ($119/tech), you also get asset
tracking (make/model/refrigerant/last service per client), a pre-departure
van checklist so nobody's dispatched without the right parts, expiring
licence/credential alerts, and weekly ad drafts for suburbs you're
under-booked in.

Also worth knowing going into your busiest season, at any tier: Minerva
watches each tech's hours and emergency-job load through the week and
flags it before someone's quietly heading toward burnout — useful when you
can least afford to lose your best tech.

7-day free trial — card's needed to start it, not charged until the trial
ends.

[Your name] / [Your mobile]

**Email 3 — Day 7**
Subject: last one — [Business Name]

Hi [First name],

Last note from me. Worth a look before the season volume hits — I can have
your whole team running by end of week. 2-minute self-serve demo: [demo
link]. Full feature list in plain English, no pitch:
minerva-green.vercel.app/platform.

[Your name] / [Your mobile]

---

## Client 3 — Electrical (mixed iOS/Android teams)

**Email 1 — Day 0**
Subject: do all your sparks run iPhones, or is it a mix?

Hi [First name],

I build Minerva for electrical businesses. Quick one — do all your sparks
run iPhones, or a mix with Android apprentices? Most dispatch software
basically doesn't work properly on Android. Minerva runs in any phone
browser — no download, no iOS requirement, everyone's on the same live
map.

I can show your whole team on it in about 10 minutes, live on a screen
share. Worth a look?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Email 2 — Day 3**
Subject: re: [Business Name] — the Android thing

Hi [First name],

Following up in case this got buried.

[N] techs runs $[N x 79]/month, all of them on the map regardless of what
phone they carry — and that already includes automatic quote follow-up on
leads gone quiet, overdue-invoice reminders, and GPS-backed proof when a
tech shows up and nobody's home, so it's never just your word against the
client's. If you've got an Android phone nearby, happy to send you a link
right now and you can watch a live dot move on it yourself — no call
needed.

Also worth knowing for later: on Pro ($119/tech), Minerva looks at which
suburbs you're under-booked in every week and drafts ad copy for you to
approve — you're not paying an agency to figure that out, and nothing
goes out without you clicking approve first.

Reply "not now" and I'll leave it.

[Your name] / [Your mobile]

**Email 3 — Day 7**
Subject: last one — [Business Name]

Hi [First name],

Last note. Here's the 2-minute self-serve demo — open it on any Android
phone nearby and watch it work: https://minerva-green.vercel.app/demo.
Full feature list, no pitch: minerva-green.vercel.app/platform. If not
useful right now, no hard feelings.

[Your name] / [Your mobile]

---

## Client 4 — Commercial Cleaning (5–15 crew)

**Email 1 — Day 0**
Subject: proving your 5:30am crew actually showed up

Hi [First name],

I build Minerva for commercial cleaning businesses. Quick question: when
your crew starts at 5:30am, how do you know they all arrived at the right
sites on time, without ringing anyone? Minerva uses each person's phone GPS
to automatically record arrival and departure at every site, and sends you
a confirmation. Timesheets build themselves.

Worth a 10-minute screen share this week?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Email 2 — Day 3**
Subject: re: [Business Name] — proof of service

Hi [First name],

Following up — happy to keep this short.

[N] crew at Starter ($49/tech) is $[N x 49]/month — under $50 a head for
automatic attendance records and timesheets that build themselves. If a
property manager ever queries an invoice, you've got a timestamped GPS
record of exactly when your team arrived and left.

Also worth knowing, at any tier: Minerva watches each crew member's hours
and shift load through the week — and factors that fatigue directly into
who gets assigned the next job, not just an alert after the fact — useful
with split shifts. And if you ever move up to Standard ($79/tech), the
same subscription starts automatically chasing overdue invoices and
re-engaging clients who've gone quiet, instead of that sitting on
someone's to-do list.

7-day free trial — card's needed to start it, not charged until the trial
ends.

[Your name] / [Your mobile]

**Email 3 — Day 7**
Subject: last one — [Business Name]

Hi [First name],

Last note. We're onboarding a small number of commercial cleaning
businesses as founding customers right now — it ends the "did the team
actually show up" question entirely. 2-minute demo, no signup: [demo
link]. Full list of what it does: minerva-green.vercel.app/platform.

[Your name] / [Your mobile]

---

## Client 5 — Locksmith Network (3–6 technicians)

**Email 1 — Day 0**
Subject: what do you tell a locked-out customer about ETA?

Hi [First name],

I build Minerva for locksmith businesses. When you get a locked-out call
and you've got [N] techs on the road, what do you tell the customer about
when someone will be there? Minerva shows every tech on a live map,
calculates a real ETA from traffic (not a guess), and texts the customer a
live tracking link — so they're watching your person drive to them instead
of ringing to ask.

Worth a 10-minute screen share this week?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Email 2 — Day 3**
Subject: re: [Business Name] — the tracking link

Hi [First name],

Following up in case this got buried.

[N] techs at $79/tech is $[N x 79]/month — under $80/tech to give every
locked-out customer a live tracking link and eliminate the "where is he"
callback entirely. Every one of those callbacks that turns into a bad
Google review costs more than that per month in lost business.

That price also already includes automatic re-texting of jobs that went
quiet — quotes that never got a reply — trying to win them back without
you having to remember, plus overdue-invoice reminders and a one-click
re-plan of the whole roster if an emergency call blows up the day's
schedule.

7-day free trial — card's needed to start it, not charged until the trial
ends.

[Your name] / [Your mobile]

**Email 3 — Day 7**
Subject: last one — [Business Name]

Hi [First name],

Last note. Here's what the locked-out customer actually sees on their
phone once you dispatch someone: https://minerva-green.vercel.app/demo.
Full feature list: minerva-green.vercel.app/platform. Worth 2 minutes. If
not, no hard feelings.

[Your name] / [Your mobile]

---

## Client 6 — Pest Control (recurring contracts)

**Email 1 — Day 0**
Subject: reducing your missed-appointment rate — [Business Name]

Hi [First name],

I build Minerva for pest control businesses. The most common scheduling
problem I hear: clients forgetting their quarterly treatment or not being
home during the window. Minerva automatically sends a reminder 48 hours
before the appointment and a live tracking text once your technician is
close by (within about 2km) — nobody on your team has to do it manually.

Worth a 10-minute demo this week?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Email 2 — Day 3**
Subject: re: [Business Name] — missed appointments

Hi [First name],

Following up — happy to keep this short.

At Pro ($119/tech, includes recurring schedule management), [N]
techs is $[N x 119]/month. If you've got 200 recurring clients and 10% miss
their window, that's 80 missed appointments a year — automatic reminders
typically cut that by more than half.

That price also already includes everything the Standard tier has
underneath it: automatic re-texting of quotes gone quiet, overdue-invoice
reminders, and lapsed-client check-ins — plus the Pro-only pieces: every
week Minerva drafts ad copy for suburbs you're under-booked in, and for
outdoor treatments it checks the forecast and drafts a reschedule text
before bad weather hits. You approve both before anything goes to a
client.

7-day free trial — card's needed to start it, not charged until the trial
ends.

[Your name] / [Your mobile]

**Email 3 — Day 7**
Subject: last one — [Business Name]

Hi [First name],

Last note. We're onboarding a small number of pest control businesses as
founding customers right now — happy to send a 2-minute self-serve demo:
https://minerva-green.vercel.app/demo. Full plain-English feature list:
minerva-green.vercel.app/platform.

[Your name] / [Your mobile]

---

## Client 7 — Pool & Spa Maintenance

**Email 1 — Day 0**
Subject: did the tech actually come while you were at work?

Hi [First name],

I build Minerva for pool service businesses. The most common thing your
clients probably ask: did the tech actually come while they were at work?
Minerva sends an automatic SMS the moment a service is completed, with the
time confirmed by GPS — your tech doesn't do anything extra.

Worth 10 minutes to see it?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Email 2 — Day 3**
Subject: re: [Business Name] — service confirmations

Hi [First name],

Following up in case this got buried.

[N] techs at Starter ($49/tech) is $[N x 49]/month — under $50/tech for
automatic service confirmations and route optimisation (usually 30–45
minutes less driving on a 15-pool day).

Worth knowing as you grow: Standard ($79/tech) adds automatic win-back
texts for clients who've drifted off their schedule and overdue-invoice
reminders; Pro ($119/tech) adds the forecast-based reschedule texts before
bad weather hits and weekly ad drafts for under-booked suburbs. You
approve both before anything goes out, at whichever tier has them.

7-day free trial — card's needed to start it, not charged until the trial
ends.

[Your name] / [Your mobile]

**Email 3 — Day 7**
Subject: last one — [Business Name]

Hi [First name],

Last note. Here's a 2-minute self-serve demo of the service-confirmation
text your clients would get: https://minerva-green.vercel.app/demo. Full
feature list: minerva-green.vercel.app/platform. If not useful right now,
no hard feelings.

[Your name] / [Your mobile]

---

## Client 8 — Existing ServiceM8 / Tradify Customer (warm, not cold)

Not a 3-email cold sequence — send within 24 hours of a specific public
complaint (Facebook group, forum post, review). One email, direct reference
to what they said.

**Honesty note (2026-10-31):** this segment is the one most tempting to
oversell with "connect Minerva to your existing ServiceM8 account" — don't.
That connector exists in code but has no registered app, no live test, and
no pricing. The honest, and still strong, offer is a full migration:
Minerva replaces the parts of ServiceM8/Tradify they're unhappy with
*and* adds the automation layer (win-back, invoice chasing, review
requests) that a straight dispatch tool doesn't do at all — without asking
them to run two subscriptions.

**Email 1 — Day 0 (send within 24 hours of the complaint)**
Subject: saw your post about [specific frustration]

Hi [First name],

Saw your post about [specific frustration with competitor — Android
issue / support non-response / billing dispute]. I built Minerva after
hearing the same thing from other tradies. [Pick the matching line:
"Minerva runs on Android in the browser, no download required." / "I
answer the phone myself when something goes wrong." / "Your branding
stays on every client email, not mine."]

Beyond fixing that specific thing, you'd also pick up what a straight
dispatch tool doesn't do: automatic follow-up on quotes that go quiet,
overdue-invoice reminders, and review requests after a job's done — all
included, not a separate add-on.

I'll move your client list and technician setup across for free — one
session, you do nothing except confirm the details. Want to jump on a
quick call?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Follow-up — Day 3 (only if no reply)**
Subject: re: your [Competitor] post

Hi [First name],

No pressure — just checking this didn't get buried. When does your
[Competitor] subscription renew? If Minerva's a fit before that date, you
can cancel without paying for both. Happy to show you in 10 minutes, or
send the full feature list first if that's easier:
minerva-green.vercel.app/platform.

[Your name] / [Your mobile]

---

## Client 9 — Industrial / Heavy-Equipment Site Operations

Different buyer (site/ops manager, not owner-operator), longer cycle. Email
is a more appropriate first touch here than a cold call — this buyer is
harder to reach by phone and more likely to forward a credible email
internally.

**Safe to send as of 2026-10-10 — wasn't before:** both emails below
promise "check-ins" and "the auto-assembled client verification package"
as real, working capabilities. Until that date, neither one actually
was — `site_checkins` had zero insert paths anywhere in the codebase
(so a demo pulling up a live check-in log would have shown nothing), and
no client-facing page existed to view a verification package at all.
Both are genuinely built and working now (see
`BILLING_INTEGRITY_NOTES.md`'s matching 2026-10-10 entries), so the
copy below is accurate as written.

**Email 1 — Day 0**
Subject: proving what happened on site — [Company Name]

Hi [First name],

Quick question — if a client asked you to prove exactly who was on site
and what happened at 2pm last Tuesday, how long would that take to put
together?

I build Minerva. It keeps that record automatically as it happens:
check-ins, any safety incidents, consumables running low. When a job
wraps, it assembles one evidence package the client signs off on instead
of you reconstructing it from someone's phone photos.

Worth 20 minutes to see it?

[Your name] / [Your mobile] / minerva-green.vercel.app

**Email 2 — Day 4 (industrial cycle is slower — extra day before following up)**
Subject: re: proving what happened on site

Hi [First name],

Following up in case this got buried.

Pricing is $49/tech/month, same per-technician model as the rest of
Minerva — not a separate industrial price band. That one price already
includes the check-in log, safety incident log, asset register,
consumables alerts, and the auto-assembled client verification package;
none of it is behind a higher tier.

Also worth knowing: when a proximity or safety hazard gets flagged, it
doesn't just sit in a log — it automatically becomes an assignable ticket
with a due date, so it's tracked to close-out instead of getting lost in a
list. And checklist photo evidence uploaded on site gets reviewed for
plausibility before it's counted as complete, so a "verified" job means
someone or something actually looked at the proof.

Happy to walk through it on a short call, or send a self-serve demo link
if that's easier on your week.

[Your name] / [Your mobile]

**Email 3 — Day 9**
Subject: last one — [Company Name]

Hi [First name],

Last note from me. If proving site history to a client is ever a manual
reconstruction job for your team, this is a 20-minute conversation, not a
sales pitch. Here's a self-serve demo if that's easier:
https://minerva-green.vercel.app/demo. Full plain-English feature list:
minerva-green.vercel.app/platform. If not useful right now, no hard
feelings.

[Your name] / [Your mobile]

---

## Reply handling additions (industrial-specific — see `OUTREACH_EMAILS.md` for the general set)

**"How much for our situation?"** → Ask roughly how many technicians/crew
are on the platform across all their sites, then quote $49/tech/month —
it's the same per-technician pricing as every other Minerva customer,
Starter tier, which already includes everything industrial gets (there's
no separate per-site rate, and no Standard/Pro upgrade that unlocks
anything more for this sector today — see `SALES_CLAIMS_ACCURACY_NOTE.md`'s
"On Pro tier and Industrial sector" entry before ever mentioning a higher
tier to this buyer).

**"We already log this in a site diary"** → "A site diary tells you what
someone remembered to write down after the fact. This is timestamped as it
happens, and it's the thing you hand a client when they ask for proof — not
something you have to rebuild from memory."

**"Can you track our equipment live / GPS dots on our gear?"** → Be direct,
don't oversell: "The data model and alerting are fully built and live.
Real-time telemetry from your actual equipment needs your hardware or
telematics vendor's feed connected to it — that's a short integration
project, not something that exists out of the box today. Happy to scope
that separately if it's a priority."

---

Update this file alongside `CLIENT_PITCHES_ADDENDUM.md` whenever pricing or
capability lines change — same rule as everywhere else: don't let these
drift out of sync with what's actually true.
