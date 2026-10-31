# First-contact drafts — Twin Electrics & Plumbing, Ken Hall Plumbers,
# Metropolitan Plumbing, A. Abbott Locksmiths, Associated Cleaning Services

Draft only — nothing here has been sent. Review, personalize (especially
once you've found the actual decision-maker's name), and send yourself.
Grounded only in what research actually confirmed (see
`supabase_seed_big_account_targets_2026-09-10.sql` notes for sources) —
no invented stats, no claims about Minerva features it doesn't have.

Both use the discovery-call goal from `BIG_ACCOUNT_EXECUTION_KIT.md`
section 2: qualify + get real numbers, not pitch and close on message one.

**Rewritten 2026-10-31 (second pass) — what changed:**
- **Trial length corrected: 14 days, not 7.** Checked
  `create-checkout-session/index.ts` directly — it sets
  `trial_period_days: '14'`, matching the site's own "Start your free
  14-day trial" button. The 7-day figure used earlier today came from a
  stale `SALES_CLAIMS_ACCURACY_NOTE.md` entry (now corrected) that
  pre-dated a real trial-length change in the code. Card is still
  required up front, not charged until the trial ends — that part was
  already right.
- Twin Electrics, Ken Hall and A. Abbott Locksmiths were found to also
  have a second, different draft already sitting in the connected Gmail
  account from 2026-10-29 (an earlier session's work, never surfaced
  until checked directly). Those were genuinely well-written but all
  shared one real problem: an unverified "demo fleet" stat (a 313km day
  cut to 180km, 42% less driving, at the ATO's 91c/km rate) presented as
  if it reflects what the recipient's own fleet would see — which
  directly contradicts this file's own "do not claim a specific savings
  number before asking their real fuel spend" rule for these targets.
  The versions below merge the better narrative framing and the honest
  trial-terms block from those drafts with this file's organized,
  full-Pantheon benefit coverage — and drop the fabricated stat,
  replacing it with an invitation to see their own number via the demo.
- Every email below is now organized under short subheadings (not one
  flat bullet list) and draws from the complete, now-accurate `/platform`
  page, which has an honest trade/industrial toggle so the linked page
  itself isn't an undifferentiated wall either.

---

## 1. Twin Electrics & Plumbing (Melbourne) — highest-confidence target

**2026-10-29 — confirmed live via direct site fetch (twinelectrics.com.au):**
real published email **service@twinelectrics.com.au** (plain text on the
Contact page, listed under "for emergencies please call" — i.e. a real
monitored inbox, not a form-only address). Darren & Matt Cross confirmed as
the sons now running the business (About page), but no formal title
("owner"/"director"/"GM") is published for either — address as "Hi Darren
and Matt," or pick one name and verify by phone before sending if you want
a single addressee.

### Email draft — send to service@twinelectrics.com.au

Subject: 🔴 What 40+ years and 30 vans at Twin Electrics might be quietly costing in office time

Hi Darren and Matt,

Forty-plus years in business, now in its second generation with the two of
you running things day to day, is a specific kind of achievement — most
businesses that make it that far have already solved the obvious problems.
What's usually left at a 30-van scale is quieter: office hours lost to
"where is he" calls, a credential that lapses without anyone noticing
until it matters, revenue sitting in a quote nobody followed up on.

I'm not writing because I think something's broken at Twin Electrics. I
build Minerva — GPS, dispatch and compliance software for trade
businesses — and a few specific things about running a fleet your size
seemed worth putting in front of you.

**Dispatch, live**
- Every van on one map — your dispatcher assigns the closest tech in
  seconds instead of a radio call or a guess.
- The client gets an automatic text with a tracking link once a tech is
  within 2km — most "where is he" calls disappear before anyone picks up
  the phone.
- If a job falls through or an emergency comes in, the whole day's roster
  re-plans in one click — not just one van's route.

**Money that's currently just sitting there**
- Quotes that go quiet get an automatic re-engagement text trying to win
  the job back — at 30 vans, that's usually real revenue nobody's
  chasing.
- Unpaid invoices get the same automatic follow-up every 3 days, so
  collections stop depending on someone remembering.
- If you run Xero, invoices sync across as drafts automatically — nothing
  typed twice between the two systems.

**Proof, compliance, reputation**
- Every job gets a timestamped, GPS-located, photo-backed record —
  settles a pricing or workmanship dispute in minutes instead of memory
  against memory.
- Vehicle checks and licence/credential expiry are flagged 30, 14 and 7
  days out, per technician, automatically.
- A happy client gets a single quiet referral nudge after a paid invoice,
  and an automatic review request — not a campaign, just timed right.

I'd rather you see your own numbers than take a stat from somewhere
else — the demo runs against a sample fleet in under a minute, and the
real thing imports your actual job list on day one:
https://minerva-green.vercel.app/demo. The complete list of everything
above, with what each piece actually means day to day, is at
minerva-green.vercel.app/platform.

What the trial includes: 14 days, nothing charged until it ends;
technicians live on the fleet map the same day you add them; phone-based
GPS only, no hardware or dash cams; invoicing hands off to Xero rather
than trying to replace it.

If any of this is worth 15 minutes, I'd welcome a short call whenever
suits you. If it's not the right time, a one-line reply saying so is
genuinely fine — I won't chase it.

Jahan
[phone]

### Phone opener (if calling instead)

"Hi, is this [name]? I run a small GPS/compliance tracking company for
trade businesses called Minerva. I was looking at established Melbourne
trade companies and Twin Electrics stood out — 40+ years, still
family-run. I had a quick question: how are you currently tracking your
vans and keeping compliance records up to date across the fleet?"

→ Then follow the 5-question discovery script in
`BIG_ACCOUNT_EXECUTION_KIT.md` section 2.

**Do not claim:** any security certification, or any specific savings
number before you've actually asked their fuel spend — the email above is
written to avoid this by pointing at the live demo instead of a canned
stat; keep that discipline on the call too.

---

## 2. Ken Hall Plumbers (Adelaide) — the big swing

**2026-10-29 — confirmed live via direct site fetch (kenhallplumbers.com.au/about-us/our-team/):**
**Brad Hall is confirmed CEO**, and the page states he "manages the day to
day operations of the 140+ strong team" — he's the right addressee, not a
guess. Ken Hall himself is the founder/Owner, still involved. Real monitored
inbox: **service@callken.com.au** (site uses Cloudflare email obfuscation;
decoded from the footer/Contact page href, consistent across both).

**Critical: they already use ServiceTitan.** Every draft below leads with
"complement," never "replace" — do not depart from this framing.

### Email draft — send to service@callken.com.au

Subject: 🔴 A layer underneath ServiceTitan, not a replacement for it

Hi Brad,

I came across the ServiceTitan case study on Ken Hall Plumbers. Forty-plus
years family-run, now at 140+ technicians under your day-to-day
management, is a genuinely strong story — scaling that far without losing
what made it work in the first place is harder than it looks from
outside.

I'm not writing to replace what's clearly already working. I build
Minerva, a GPS, dispatch and compliance layer for trade businesses, built
to sit underneath a system like ServiceTitan — covering specifics a
general job-management platform usually leaves to someone else.

**Dispatch & compliance, underneath ServiceTitan**
- Live GPS tracking across the full team, independent of ServiceTitan's
  own scheduling — no integration between the two systems, they'd run in
  parallel, not connected.
- Vehicle checks and licence/credential expiry tracked and flagged
  automatically, 30/14/7 days out, per technician.
- At 140 technicians, a reliability signal built from checklist-photo
  flags and fatigue hours surfaces a quietly-overloaded tech before it
  becomes a complaint or an incident.

**The call volume ServiceTitan doesn't solve**
- Automatic ETA texting once a tech is within 2km removes most "where's
  my plumber" calls before they reach anyone's desk.
- A call after hours gets answered, triaged and logged as a lead instead
  of going to voicemail.
- Quotes gone cold get an automatic re-engagement text, and overdue
  invoices get automatic reminders — both run independently of
  ServiceTitan.

**Disputes, and the paper trail**
- I noticed a review describing a workmanship dispute where it wasn't
  clear how to show exactly what had been done. At 140 technicians, that's
  a recurring risk, not a one-off — a timestamped, photo-backed,
  GPS-located record on every job settles it in minutes regardless of
  who's actually right.
- If compliance or fleet records ever need to reconcile against Xero,
  invoices sync across automatically as drafts for review — a separate
  layer from anything ServiceTitan handles.

The complete list of everything above, with what each piece actually
means, is at minerva-green.vercel.app/platform — filtered to show only
what applies to a trade business like Ken Hall.

What the trial includes: 14 days, no charge, runs alongside ServiceTitan
from day one; technicians live on the fleet map the same day you add
them; priced per technician, as an add-on layer, not a bundled
replacement.

If you, or whoever owns fleet and compliance decisions at Ken Hall, would
find 15-20 minutes useful to see the actual number for your own fleet,
I'd welcome that — no pressure to change anything that's already working.
If this isn't the right layer for where you are, a short reply saying so
is entirely fine.

Jahan
[phone]

### Phone opener (if calling instead)

"Hi, I'm looking to speak with Brad Hall or whoever handles fleet/
compliance decisions. I saw the ServiceTitan case study on Ken Hall
Plumbers — I'm not calling to replace that, I actually built something
that's meant to sit alongside it: GPS and compliance-record tracking
specifically, which isn't ServiceTitan's focus. Do you have a few minutes,
or is there a better time to call back?"

→ Then follow the discovery script, but ask explicitly: "How is
compliance record-keeping (vehicle checks, licence expiry) currently
handled — is that inside ServiceTitan, or somewhere else?" This is the
real question that determines whether Minerva has a genuine gap to fill.

**Do not claim:** that Minerva can replace ServiceTitan, that it
integrates with ServiceTitan (unconfirmed — don't promise an integration
that doesn't exist — the email above explicitly says the two systems run
in parallel, not connected), or any specific savings number before asking
their real fuel spend and fleet details on the actual call.

**Pilot offer for both, if "not ready to commit" comes up:** 5-10
vehicles/technicians, 30-60 days, month-to-month, no lock-in — see
`BIG_ACCOUNT_EXECUTION_KIT.md` section 5 for the full structure and why
it works for a cautious buyer.

**New real signal found 2026-09-13 (ProductReview.com.au):** alongside
mostly-positive reviews, at least one public review describes a
workmanship dispute (sewer drain cleaning) where Ken Hall declined a full
refund, and other reviews mention "communication issues" with customer
service. The email above already uses this as its dispute angle — don't
reference the specific review by name on the call, just raise the general
question: "When a job ends up in a pricing or workmanship dispute, what's
the current process for showing exactly what was done and when?"

---

## 3. Metropolitan Plumbing (multi-state — Sydney/Melbourne/Gold
##    Coast/Perth) — strong pain signal, but read the caveat before pursuing

**Real signal found 2026-09-13:** public reviews (ProductReview.com.au,
Trustpilot) show a genuine, recurring pattern: customers reporting
technicians failing to arrive within promised windows **with no update
call giving a revised ETA**. This is precisely the gap Minerva's live
GPS tracking link + automatic "technician is 15 min away" text closes —
a real, verifiable fit, not a guessed one.

**The caveat, stated plainly:** the same reviews also describe a
recurring "predatory pricing" / aggressive-upsell complaint pattern (also
trading as "Mr Emergency"). A business whose commercial model leans on
opaque, in-the-moment pricing has less incentive to adopt a tool that
makes their service more transparent and accountable to the client — the
ETA problem may be a symptom of an operating model, not an oversight
they're looking to fix. This is also a large multi-state operation, more
likely to have layers between you and any real decision-maker, and more
likely to already run enterprise software. Approach this one, but budget
it as a longer, lower-probability conversation than Twin Electrics or Ken
Hall — don't count on it in any near-term forecast.

**Find first:** the actual state-level operations manager or franchise
owner — a generic head-office email is unlikely to reach anyone who can
decide.

**Length note:** kept moderate even in the full-Pantheon pass — the
caveat above explicitly says don't reference pricing or reviews, so the
extra detail is limited to how the ETA mechanism itself works, not a
company-wide feature list.

### Email draft

Subject: 🔴 the "no update call" ETA problem — Metropolitan Plumbing

Hi there,

I build Minerva, a live GPS tracking + automatic client-texting tool for
trade businesses. Quick, direct question: for jobs where a tech is running
behind, what's the current process for getting the client an updated ETA
without someone on your team having to call them?

Most of the trade businesses I talk to solve this reactively — a client
calls in annoyed, then someone rings the tech, then someone calls the
client back. Minerva does that automatically:

- A live GPS map shows exactly where every technician is, from one
  dispatcher screen, and the client gets an automatic text with a live
  tracking link once a tech is within about 2km — no manual calls either
  direction.
- The same underlying tracking gives you a timestamped record of arrival
  and departure on every job, useful any time a client disputes how long
  something took.
- The same system catches a missed call or after-hours enquiry
  automatically, so a new job doesn't go cold just because nobody picked
  up.

At your scale, I'd expect this is either already solved well, or costing
real admin time across multiple regions — happy to walk through what it
would actually look like for one region first, no commitment, before
talking about anything beyond that.

If it's easier to just see it than talk first, here's 60 seconds of what
the client actually receives: https://minerva-green.vercel.app/demo.
Otherwise, worth 15 minutes?

Jahan
[phone]

**Do not claim:** anything about their pricing model or reference any
review — lead only with the operational ETA question. If pricing/upsell
complaints come up in their own words during the call, that's their
disclosure to make, not yours to raise.

---

## 4. A. Abbott Locksmiths (Campsie, NSW) — different angle: protect a
##    reputation that's already strong, not fix something broken

**Real signal found 2026-09-13:** genuinely strong, consistent reviews —
50+ years family-owned, competitive pricing, fast turnaround, "hundreds of
rave reviews." There is no visible pain point here to lead with — this is
a relationship/reputation-protection pitch, not a problem-solving one, and
should be treated as a lower-confidence, longer-odds target than Ken Hall
or Metropolitan Plumbing precisely because there's no obvious itch to
scratch.

**2026-10-29 — confirmed live via direct site fetch (abbottlocksmiths.com.au):**
real published email **info@abbottlocks.com.au** (note: different domain
from the site itself — abbottlocks.com.au vs abbottlocksmiths.com.au — same
business, confirmed as the one address shown on their own Contact page). No
owner/manager name published anywhere on the site (no Team page exists) —
**still find this by phone before sending**, or send to "Hi there," addressed
generically if you'd rather not call first.

### Email draft — send to info@abbottlocks.com.au

Subject: 🔴 A note on A. Abbott's reputation, not a sales pitch

Hi there,

Fifty years in business, with reviews that stay consistently, almost
unusually positive, is rare for a locksmith of any size. I'm not writing
because I think anything's broken — that kind of trust is an asset,
usually worth protecting deliberately rather than left to chance.

I build Minerva, dispatch and compliance software for trade businesses,
and a few specific things about how a locksmith business builds and keeps
that kind of trust seemed worth raising.

**The anxious wait**
- Someone locked out is often comparing you to two other locksmiths in the
  same search results while they wait. A live tracking link and an
  automatic text the moment your technician is close by turns that wait
  into reassurance instead of silence.
- A lockout call that goes unanswered gets redialled to the next name
  immediately — Minerva answers after hours, identifies what the caller
  needs, and logs it as a lead automatically. A genuinely missed call
  still gets a text back quickly enough that most people hold off before
  trying someone else.

**Protecting the reputation, not just reacting to it**
- If a job's ever questioned — price, or whether something was actually
  done — a timestamped record with GPS, photos and the invoice settles it
  in minutes, not memory against memory.
- A happy customer gets a single low-pressure referral nudge and an
  automatic review request after a job's done — a small thing, but it
  keeps the review count climbing without anyone having to remember to
  ask.
- A public page showing real, verified numbers (jobs completed, team
  size) sits alongside your star rating as something a customer can
  independently check — most locksmiths your size don't have this.

What the trial includes: 14 days, nothing charged until it ends;
technicians scan a QR code on their own phone and are live immediately, no
app store, no IT setup; phone-based only, no hardware trackers; doesn't
touch your books, invoicing hands off cleanly rather than trying to be
your accounting platform.

The complete list of everything it does is at
minerva-green.vercel.app/platform. There's a two-minute self-serve demo if
you'd rather look before talking to anyone:
https://minerva-green.vercel.app/demo

If it's useful to talk, happy to make time whenever suits. If not, no need
to reply at all — I won't follow up.

Jahan
[phone]

**Do not claim:** that anything is currently wrong with their operation —
the entire premise of this pitch is that nothing visibly is; overclaiming
a problem here would read as dishonest given their public reputation.

---

## 5. Associated Cleaning Services (Newstead, QLD, national — 400+ sites)
##    — the biggest genuine scale opportunity on this list, longer odds
##    on access

**Real signal found 2026-09-13:** ISO 9001 certified, 55+ years in
Queensland's industrial sector, serving 400+ sites nationwide. Unlike
most targets on this list, the fit here doesn't depend on finding a
complaint — at 400 sites, "did every crew arrive at every site on
schedule today" is a real, standing operational question regardless of
whether anyone's complained about it publicly yet.

**The caveat, stated plainly:** a 400-site national operation is very
unlikely to have one person who can say yes for the whole account —
expect a regional operations manager structure, and treat a "yes" from
any single contact as a regional pilot, not a company-wide close.
Budget this as a longer sales cycle than Twin Electrics or Ken Hall, not
a fast win, and don't count it in any near-term forecast.

**Find first:** the actual regional operations manager for whichever
Brisbane-area sites are most reachable — not head office generically.

### Email draft

Subject: 🔴 verifying arrival at 400 sites — Associated Cleaning

Hi there,

I build Minerva — automatic GPS-based arrival/departure logging for
service crews, so you get a timestamped confirmation the moment a crew
checks in and out at each site, without anyone having to call around to
confirm.

At your scale, here's what that actually covers:

**Proof of service, automatically**
- Automatic arrival/departure logging at every site, timestamped by GPS,
  so "did the crew show up today" stops being a phone-around question.
- Checklist photo evidence per site visit, reviewed for plausibility,
  giving you a clean audit trail if a client ever queries whether a site
  was actually serviced.

**Safety & operations**
- A safety-incident log with automatic corrective-action tickets —
  assigned, with a due date, tracked to close-out — rather than something
  in someone's notebook. Worth mentioning given your ISO 9001
  certification likely already requires something in that shape.
- A single dashboard view across however many sites you run it on, rather
  than per-region spreadsheets that need manually reconciling, plus a
  daily summary every morning of the last 24 hours.
- If invoicing ever runs through this for any site, Xero sync means
  nothing gets typed twice between the two systems.

I'd suggest starting small and proving it rather than a company-wide
rollout — a handful of Brisbane-region sites as a trial, 14 days, card
needed to start it but not charged until it ends.

The complete list — filtered to show only what applies to a business like
yours — is at minerva-green.vercel.app/platform.

Would a 15-minute conversation about how this works today be useful,
starting with just your Brisbane-region sites rather than the whole
network? If a quick look is easier first, here's what it does in under a
minute: https://minerva-green.vercel.app/demo.

Jahan
[phone]

**Do not claim:** that Minerva already supports multi-region rollout at
this scale in production (it hasn't been tested at anywhere near 400
sites) — if this conversation progresses, be upfront that a pilot on a
small number of sites is the right first step to actually prove it works
at their scale, not a company-wide claim on day one.
