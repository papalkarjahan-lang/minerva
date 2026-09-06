# Minerva — Ad Creative Pack (Meta/Google-ready copy)

Design only — no ad account was created, no budget spent, no campaign
launched. Per the standing safety boundaries, creating ad accounts and
spending real ad budget are actions you take yourself (Meta Ads
Manager / Google Ads directly). This is the creative you'd paste in when
you do.

**Read `CUSTOMER_ACQUISITION_PLAN.md` first if you haven't.** Its
recommendation stands: with zero paying customers today, direct outreach
converts far better than cold paid ads — nobody trusts an unproven SaaS
tool from an ad. Treat this pack as ready-to-go for the moment you have
your first 3-5 customers (real case studies to point to) or if you decide
to run a small test anyway. Every line below is checked against
`SALES_CLAIMS_ACCURACY_NOTE.md` — no "AI"/"smart" language (the Anthropic
key isn't live yet, everything currently runs on the plain-template
fallback), no "other businesses already use this" social-proof claims
(none exist yet), no overclaiming on Industrial hardware integration.

---

## 1. Audience & targeting (fill in once you pick your city/trade)

Per `CUSTOMER_ACQUISITION_PLAN.md`: **pick one trade + one city** you can
credibly reach. Options straight from `Onboarding.jsx`'s own dropdowns
(so the ad promise matches exactly what a new signup selects):

- **Trades**: Plumber, Electrician, HVAC/Refrigeration, Locksmith, Pest
  Control, Commercial Cleaning, Pool Service, Courier/Delivery, Security
  Patrol, Automotive Mobile Service, Mobile Veterinary
- **Cities**: Sydney, Melbourne, Brisbane, Perth, Adelaide, Canberra,
  Newcastle, Wollongong, Geelong, Townsville, Toowoomba

Meta/Google targeting suggestion: business owners/self-employed, age
28-60, interest in "small business software" / the specific trade
association pages, radius-targeted to your chosen city. Start narrow —
one trade, one city, small daily budget ($5-10/day) — not broad.

---

## 2. Meta (Facebook/Instagram) ad sets

### Set A — Pain-point led (recommended first test)

**Headline:** Stop chasing your techs for updates
**Primary text:**
> Know exactly where your [TRADE] techs are and what job they're on —
> without a single phone call. Minerva shows live GPS, auto-texts your
> clients when the tech is close, and turns job-complete into an invoice
> on the spot. 7-day free trial, set up in one call. First charge after
> day 7.
**CTA button:** Start free trial
**Landing link:** minerva app URL → `/` (LandingPage.jsx)

### Set B — Feature led

**Headline:** GPS dispatch built for [TRADE] businesses
**Primary text:**
> Live map of every tech. One-tap job assignment. Clients get an
> automatic "your tech is on the way" text. On-site invoicing so you get
> paid before you leave the job. Works on any phone — no app install for
> your techs. Starter plans from $49/tech/month, 7-day free trial.
**CTA button:** Learn more
**Landing link:** `/`

### Set C — Owner-time led (best for trades with high admin overhead)

**Headline:** Get your evenings back
**Primary text:**
> Stop doing dispatch, invoicing, and follow-up texts by hand after
> hours. Minerva runs the day-to-day so you can actually finish work at
> a reasonable time. Free for 7 days — see it running on your own jobs
> before you pay anything.
**CTA button:** Start free trial

**Square 1:1 image brief** (for whoever designs the actual creative — no
image is generated here): a simple phone screenshot of the live GPS map
view (`TrackingView.jsx`'s client-facing map is the cleanest one to
screenshot) with a bold text overlay of the headline. Keep it
uncluttered — one screen, one message.

---

## 3. Google Search ads

**Headline 1:** GPS Dispatch for Trade Businesses
**Headline 2:** [TRADE] Job Tracking & Invoicing
**Headline 3:** 7-Day Free Trial, First Charge After Day 7
**Description 1:** Live GPS tracking, auto client texts, on-site invoicing. Built for [TRADE] businesses. Set up on one call.
**Description 2:** Plans from $49/tech/month. Works on any phone — no app install required for technicians.

(Checked against `create-checkout-session`: Stripe Checkout does collect
a card upfront even during the trial — so "no card needed" would be
false. "First charge after day 7" is the accurate line, matching
`LandingPage.jsx`'s existing copy.)

**Keywords to target:** "[trade] dispatch software", "[trade] job
management app", "gps tracking for technicians", "[trade] scheduling
software", "on-site invoicing app"

**Negative keywords:** free, jobs (hiring intent), courses, training,
certification — filters out job-seekers and students rather than
business owners.

---

## 4. SMS/organic social short copy (for the Facebook trade groups mentioned in the acquisition plan, once you have a case study)

> Built a tool that shows exactly where your techs are, texts clients
> automatically when they're close, and turns job-complete into an
> invoice on the spot. Been running it on my own [TRADE] jobs — happy to
> show anyone in the group how it works if useful. No pitch, just sharing
> what's worked for me.

(Keep this one low-key and personal per the acquisition plan's note that
"a genuine, not spammy, post" outperforms ads once you have real proof —
this is a starting draft for you to personalize, not something to post
as-is without having actually used it yourself first.)

---

## 5. Industrial / Track B ads (separate audience, separate sales motion)

Different buyer than Sets A-C above — site/ops manager, not owner-operator,
per `CLIENT_PITCHES_ADDENDUM.md`'s "Client 9" profile. Longer consideration
cycle, so these lead with a specific, provable pain (proving what happened
on site) rather than price or trial length, and a softer CTA (book a call,
not "start trial") since this buyer won't self-serve signup off an ad.
Copy is restricted to what's actually built and live today — no live GPS
dots on equipment, no automatic lead sourcing, no drone/mesh claims (see
the honesty note above).

**Headline:** Stop reconstructing site incidents from memory
**Primary text:**
> When a client asks "what happened on site and when," stop digging
> through someone's phone photos. Minerva logs every check-in, safety
> incident, and consumable reorder per site, and assembles it into a
> client-ready verification package on demand. Engine-hours maintenance
> alerts on your asset register today — real-time telemetry when you're
> ready to plug in your own equipment feed.
**CTA button:** Book a call
**Landing link:** `/` (Track B site, not the Track A trade LandingPage)

**Google Search headline set:**
- Headline 1: Site Check-In & Safety Incident Log
- Headline 2: Client-Ready Site Verification Packages
- Headline 3: Asset Register With Maintenance Alerts
- Description: Stop reconstructing site history from memory or phone
  photos. Check-ins, safety incidents, and consumables tracked per site,
  assembled into a client sign-off package on demand.

**What NOT to say in this copy, ever:** "live GPS on your equipment"
(requires the client's own hardware/telematics feed — not built-in),
"automatic lead sourcing," anything implying drone or RFID hardware
ships out of the box. If a prospect asks, the honest line from
`CLIENT_PITCHES_ADDENDUM.md` is: "the data model and alerting are fully
built and live — real-time telemetry from your actual equipment needs
your hardware or telematics vendor plugged into our existing ingestion
endpoint."

---

## 6. What's deliberately NOT included

- No "AI-powered" / "smart" language anywhere — the Anthropic key isn't
  live, so every agent is running its template fallback right now (see
  `SALES_CLAIMS_ACCURACY_NOTE.md`). If you turn the key on later, "smart"
  language becomes fair game — revisit this pack then.
- No "join other [trade]/site-ops businesses already using Minerva" line —
  zero real customers exist yet. Swap in once you have at least one.
- No RFID/BLE/drone/live-telematics claims for Track B — no hardware
  integration exists yet, only a working ingestion endpoint ready for one.
- No actual ad account, campaign, image asset, or spend — those are
  yours to create in Meta Ads Manager / Google Ads directly.
