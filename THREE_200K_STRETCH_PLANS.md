# Three separate $200K stretch-case plans (Sept 13 → Dec 31, 2026)

Same honest starting fact for all three, stated once so it isn't repeated
in every section: the existing 18-account named-target pipeline, sold at
real Minerva pricing ($49/$79/$119 per technician/month), caps at roughly
**$60-90K collected by Dec 31 even in a physically-impossible instant-
simultaneous-close scenario**. That number doesn't change across any of
the three plans below — it's the base layer every plan either sits on
top of or explicitly tries to leapfrog. Nothing below claims $200K is
likely. Each plan is the most realistic, most granular version of "how
would you actually try, step by step," not a guarantee dressed up as one.

Nothing in this document has been sent. All drafts are yours to review,
personalize, and send yourself — no autonomous outreach. Every "find the
decision-maker" step below means public research (company site, LinkedIn,
public reviews) — not compiling a personal dossier on a named individual.

---

## RECOMMENDATION (added 2026-09-15) — the single most-likely-to-work path, stated directly, not as a guarantee

**The honest math, combining every real lever that exists today, run
perfectly:**

| Lever | Best-case 2026 cash | Why |
|---|---|---|
| Plan 2 (diversified 4 named accounts below) | ~$60-90K | Same ceiling as always — physically-impossible instant-close case, unchanged |
| Self-serve solo/small volume (organic outreach only, no ad spend) | ~$15-25K | High scenario from `GRAND_PLAN_END_OF_2026.md` §4 — real, because signup is now instant, but bounded by how many prospects you can personally review and approve |
| Plan 1 (Jim's Group wildcard) | ~$0 in 2026 | Explicitly modeled as a 2027 revenue event even in the best real case — a franchisor pilot doesn't invoice this year |
| **Combined realistic ceiling, everything run perfectly** | **~$75-115K** | 15-25x today's $0 baseline — genuinely excellent, still not $200K |

**What would actually have to be true to close the remaining ~$85-125K gap
— ranked by realistic likelihood, most likely first:**

1. **One named account closing at a materially larger contract value than
   simple per-tech pricing assumes.** Most plausible on Ken Hall Plumbers
   (100+ technicians) or an FM/council target — ask directly in the
   discovery call whether they'd consider an annual or multi-year
   agreement instead of month-to-month per-tech billing. One account
   closing this way is a single signature adding $30-60K, which is a much
   higher-odds path than needing dozens of smaller deals to overperform
   simultaneously.

   **Updated 2026-09-15 with a real generated number, not an estimate:**
   ran `generate-roi-proposal` against the 7 named targets that already
   have a researched fleet size (Ken Hall Plumbers, Twin Electrics &
   Plumbing, A. Abbott Locksmiths, Mr Splash Plumbing, CLASS Locksmiths,
   M.A.S.S. Electrics, Multisparx) — this only creates a shareable
   `/proposal/:id` page for you to personally send/present; it does not
   contact anyone and does not advance any pipeline stage (deliberately
   called without `bigAccountTargetId` so `big_account_targets.stage`
   stays honestly at `researching` until you actually present one). Real
   output at standard per-tech pricing (conservative 15% fuel-savings
   estimate, $89/tech/mo bulk-deal midpoint):

   | Target | Fleet | Est. monthly Minerva cost | Est. annualized |
   |---|---|---|---|
   | **Ken Hall Plumbers** | 122 | **$10,858/mo** | **~$130K/yr** |
   | Twin Electrics & Plumbing | 30 | $2,670/mo | ~$32K/yr |
   | Mr Splash Plumbing | 15 | $1,335/mo | ~$16K/yr |
   | A. Abbott Locksmiths | 18 | $1,602/mo | ~$19K/yr |
   | CLASS Locksmiths | 10 | $890/mo | ~$11K/yr |
   | M.A.S.S. Electrics | 9 | $801/mo | ~$10K/yr |
   | Multisparx | 7 | $623/mo | ~$7K/yr |

   Ken Hall Plumbers alone, at full standard pricing, is worth more than
   the entire Plan-2 ceiling on its own — it is the single highest-
   leverage account in the whole pipeline and the most concrete version
   of lever #1. This is still 0% likely to close itself: the proposal
   page exists now, but nobody has been contacted yet (still true as of
   this update — see `GRAND_PLAN_END_OF_2026.md` §1). Sending/presenting
   it is the one step only you can take.
2. **Paid customer acquisition to scale self-serve signups beyond what
   free cold-outreach volume can produce.** `launch-ad-campaign` already
   exists in the codebase and is real, but running it means spending the
   user's real ad budget on a real payment method — that's your call to
   make and fund directly, not something to launch autonomously. If you
   want this lever: tell me a monthly budget and target
   platform/audience, and I'll draft the campaign copy/targeting for your
   review — nothing gets spent without your explicit go-ahead per
   campaign. Rough real-world benchmark for local-service SaaS: $30-60
   cost-per-acquisition, so $1-2K/month over the remaining ~3.5 months
   could plausibly add 15-65 signups — real, but bounded by what you're
   willing to spend, not a free lever.
3. **Jim's Group producing an actual signed single-division pilot fast
   enough to invoice in 2026, not just a conversation.** Ranked last
   because even Plan 1's own honest note below says this is realistically
   a 2027 outcome — worth running regardless (it's one email), just don't
   plan the $200K case around it happening early.

**The exact sequence to run, starting today (2026-09-15):** run Plan 3
(Combined, below) exactly as written — Track A (diversified named
accounts) and Track B (Jim's Group) in parallel — and add a third,
new **Track C (self-serve volume)** alongside both, since none of the
three compete for the same hours:

- **This week (Sept 15-19):** Track A — send Twin Electrics + Ken Hall
  Angle A emails (drafts below). Track B — send the Jim's Group inquiry to
  the first division. Track C — set `RESEND_API_KEY`; paste your first
  30-50 real SMB prospects into `parse-prospect-text`; run
  `draft-outreach-batch`; personally review and edit every draft; click
  "Send approved."
- **Sept 22-26:** Track A — Associated Cleaning sent, Metropolitan contact
  identified. Track B — second division if no reply. Track C — second
  wave of 30-50 prospects; let `followup-outreach` handle automatic
  day-3/7/14 nudges on wave 1, so you only touch a thread again when
  someone replies.
- **October:** Track A — discovery calls as replies arrive, ask the
  contract-value question above on every one. Track B — qualify only, no
  pricing pitch yet. Track C — keep sending a new wave every 1-2 weeks;
  this is now pure repetition, not new setup.
- **November-December:** close whatever's in motion on Track A (prioritize
  the contract-value conversation on Ken Hall specifically); Track B
  becomes a 2027 seed, log it as a win either way; Track C keeps
  compounding on the same cadence.
- **Ongoing, your decision:** if you want to add the paid-ads lever, tell
  me the budget and I'll prepare campaign copy for your review — that's
  the one piece of this sequence that needs your explicit input to start.

**Said plainly:** running all three tracks perfectly, for free, most
realistically lands around $75-115K — a genuinely strong year from zero.
Reaching $200K specifically depends on one of the three items in the gap
list above breaking your way, most likely #1 (an outsized single contract)
or #2 (funded ad spend), not on the base plans below overperforming their
own stated ceilings.

---

# PLAN 1 — Jim's Group-centric (the wildcard swing)

**The bet:** one relationship (a Jim's Group divisional lead) multiplies
reach across 5,000-5,700+ franchisees instead of closing accounts one at
a time. This is the only lever researched this session with the
mathematical shape to reach $200K-class numbers — nothing in the named-
account pipeline does, at any close rate.

**The honest cost of that bet:** franchisor-level partnership deals run
on months, not weeks — procurement review, a pilot division, a rollout
timeline. Realistically this is a 2027 revenue outcome being planted in
2026, not a Dec 31 number. Anyone telling you otherwise about a cold
franchisor conversation is guessing, not planning.

**Why it's still worth running:** even a "no" or a slow "let's talk in
Q1" costs one email and doesn't consume time that would otherwise close
the base-case pipeline — upside-only optionality, not a resource trade-off
against Plan 2.

## Step-by-step

**Step 1 (Sept 13-14) — identify the real entry point, not a generic inbox.**
- Go to jims.net.au and look specifically for a "franchise enquiry" or
  "become a franchisee" contact for the Jim's Plumbing and Jim's
  Electrical divisions specifically (not Jim's Group head office
  generally) — divisional support staff are the realistic first contact,
  not the group founder.
- Search LinkedIn for "Jim's Plumbing" and "Jim's Electrical" with a
  title filter for "division manager," "franchise development," or
  "state manager" — company-level role search, not compiling a personal
  profile on any one named individual.
- Write down two candidate contact points (one per division) before
  sending anything — don't send to both divisions with an identical
  email on the same day; that reads as a mail-merge blast rather than a
  considered inquiry.

**Step 2 (Sept 15) — send one email to the higher-confidence of the two
divisions first** (whichever has a clearer public contact — Plumbing and
Electrical are both real candidates, pick based on which contact you
actually found, not a coin flip). Use the draft below. Send to one
division only in week one — this is a deliberate, considered approach,
not a volume play.

**Step 3 (Sept 22) — if no response, send the identical inquiry to the
second division** (Electrical if you led with Plumbing, or vice versa).
Still one email each, still no automated follow-up sequence.

**Step 4 (Sept 29) — if neither division has responded, send the single
fallback follow-up**: reframe as a single-franchisee pilot offer (see
draft variant below) rather than repeating the group-level ask a third
time. This is the realistic path that doesn't require franchisor
sign-off at all — an individual Jim's Plumbing or Jim's Electrical
franchisee can adopt Minerva exactly like any other named account.

**Step 5 (Oct onward, only if a real reply arrives) — qualify, don't
pitch.** Use the same discovery framework as `BIG_ACCOUNT_EXECUTION_
KIT.md` section 2: ask how individual franchisees currently handle
fleet/compliance tracking today (independently vs. a group
recommendation), whether there's an existing preferred-vendor process for
tools franchisees adopt, and who actually owns that decision (division
manager vs. individual franchisee vs. group procurement). Do not propose
pricing, a rollout plan, or a network-wide number on the first real call
— get the real structure of how a "yes" would even work before designing
one.

**Step 6 (Nov-Dec) — if a real conversation is underway:** the realistic
next milestone this year is agreement to a single-division pilot (one
franchisee, or a small handful, opted in through the divisional contact's
introduction) — not a signed network-wide deal. Log this as a real,
valuable outcome for the year even though it won't produce Dec 31 revenue
— the revenue from a pilot-to-rollout path realistically lands in 2027.

**Step 7 (ongoing) — track it like any other pipeline account:** one line
in whatever CRM/spreadsheet already tracks the 18 named accounts — date
sent, division, response, next step. Don't let this become an
untracked side conversation that's easy to let go cold.

## Draft — Jim's Group inquiry (initial, group-level)

Subject: GPS/compliance tracking for Jim's Plumbing & Electrical franchisees

Hi [name],

I build Minerva, a GPS fleet-tracking and compliance record-keeping tool
(vehicle checks, licence/credential expiry, incident logging) for trade
businesses — priced per technician, not as a bundled enterprise suite.

I'm reaching out because I imagine individual Jim's Plumbing and Jim's
Electrical franchisees currently handle fleet tracking and compliance
record-keeping independently, franchisee by franchisee. I'd be interested
in understanding whether that's accurate, and whether a lighter-weight
shared option would be useful — either as something individual
franchisees could opt into directly, or as a longer conversation about a
group-level arrangement if there's appetite for one.

Happy to start with whichever is easier on your end: a quick call to
understand how this is currently handled, or simply being pointed to the
right person if franchise development / divisional support isn't the
right team for this.

[your name]
[phone]

## Draft — fallback single-franchisee pilot (send only if Step 2/3 get no response)

Subject: a smaller version of my last question — one franchisee, not the network

Hi [name],

Following up on my note about GPS/compliance tracking for Jim's Plumbing
and Electrical franchisees — I realize a network-wide conversation is a
bigger ask than a first email should be.

Simpler version: if there's a single franchisee you think would be open
to trying this directly (no group-level commitment needed on your end at
all), I'd welcome an introduction. It's priced per technician and works
for a single-vehicle operation the same way it would for a larger one.

No pressure either way — happy to also just be pointed to whoever handles
this if it's not you.

[your name]
[phone]

**Do not claim:** any existing relationship with Jim's Group, any specific
per-franchisee savings number (unresearched), or any network-scale
deployment history (none exists — be upfront that a single-franchisee
pilot is the real first step if this progresses).

**What "everything associated" means here, concretely:** the two drafts
above are the entire buildable asset for this plan. No additional
software, page, or feature is needed — the gap is a sales relationship,
not a product gap. Building speculative "franchise network" dashboards or
multi-tenant features before a single franchisee or franchisor
conversation actually exists would repeat the exact mistake
`SCALING_PLAN.md` was written to avoid.

---

# PLAN 2 — Diversified multi-mid-large-client (no single point of failure)

**The bet:** several separate, real, verified pain points across
different named businesses, each closed independently — no single deal
determines the outcome, and each has a shorter, more realistic sales
cycle than the franchisor conversation in Plan 1.

**The honest ceiling, restated:** this is the same 18-account pipeline
already priced at $49-119/tech/month — the $60-90K ceiling applies
directly to this plan. Diversification doesn't raise the ceiling, it
raises the odds of hitting closer to it instead of $0, by not depending
on any one account saying yes.

## Step-by-step, per target, in priority order

### Target 1 of 4 — Twin Electrics & Plumbing (Melbourne, 30+ vans) — lead with this one, highest confidence, no caveat

**Step 1 (Sept 13-14):** find the actual owner/GM name (Darren or Matt
Cross per public research, or whoever currently runs day-to-day
operations) via LinkedIn or the company's own "About/Team" page. Don't
send to "Owner" generically.
**Step 2 (Sept 15):** send the email draft below.
**Step 3 (Sept 18, if no reply):** one phone call using the phone-opener
script below — don't wait past 3 business days on the highest-confidence
target.
**Step 4 (on any reply):** run the 5-question discovery script from
`BIG_ACCOUNT_EXECUTION_KIT.md` section 2 — ask specifically how they
currently track van locations and compliance records (manual, spreadsheet,
or nothing formal), then quote real numbers for a fleet their size only
after they've told you their actual technician count.
**Step 5 (if "not ready to commit"):** offer the 5-10 vehicle, 30-60 day,
month-to-month pilot (`BIG_ACCOUNT_EXECUTION_KIT.md` section 5) — no
lock-in, this is the real mechanism for a cautious buyer.
**Step 6 (if pilot accepted):** onboard exactly like any other pilot
account already documented in the deploy/setup process — no new steps
needed, this is the same onboarding flow as any named account.

#### Email draft

Subject: Quick question about how Twin Electrics tracks your 30 vans

Hi [name],

I came across Twin Electrics & Plumbing while looking at established
family-run trade businesses in Melbourne — 40+ years and still
family-owned is genuinely rare, so congratulations on that.

I'm reaching out because I built Minerva, a GPS/compliance tracking tool
for trade businesses with a fleet — it's priced per technician, not as a
bundled enterprise suite, so you're not paying for anything you don't
need.

Quick question rather than a pitch: with a fleet your size, how are you
currently tracking where your vans/techs are and keeping compliance
records (vehicle checks, licence/credential expiry) up to date? If it's
mostly manual right now, I'd like to show you the actual numbers for a
fleet your size — no cost, no obligation.

Do you have 15 minutes this week or next?

[your name]
[phone]

#### Phone opener

"Hi, is this [name]? I run a small GPS/compliance tracking company for
trade businesses called Minerva. I was looking at established Melbourne
trade companies and Twin Electrics stood out — 40+ years, still
family-run. I had a quick question: how are you currently tracking your
vans and keeping compliance records up to date across the fleet?"

**Do not claim:** any security certification, any specific savings number
before you've actually asked their fuel spend, or any existing client
testimonial (none exist yet).

---

### Target 2 of 4 — Ken Hall Plumbers (Adelaide, 100+ technicians) — the biggest single account, two angles, run both

**Step 1 (Sept 13-14):** confirm whether to approach Brad Hall (CEO)
directly or an operations/fleet manager first — at 100+ technicians there
may be a layer worth identifying before the first call. Check the
company site's leadership page and LinkedIn for an operations-manager
title.
**Step 2 (Sept 15):** send Angle A (ServiceTitan-complement) as the email
draft below — critical constraint: every message leads with "complement,"
never "replace."
**Step 3 (Sept 22, same thread or follow-up call):** raise Angle B
verbally, not in writing on the first email — ask the generic dispute-
process question ("when a job ends up in a pricing or workmanship
dispute, what's the current process for showing exactly what was done and
when?") only once a real conversation is underway. Never reference the
specific public review that surfaced this signal — raising it unprompted
would read as having dug through their complaints rather than identified
a general operational gap.
**Step 4 (on any reply):** explicitly ask "how is compliance
record-keeping currently handled — is that inside ServiceTitan, or
somewhere else?" This single question determines whether Minerva has a
genuine gap to fill alongside ServiceTitan.
**Step 5 (for dollar framing on Angle B):** ask their actual dispute/
refund frequency and average disputed-job value before naming any savings
figure — don't lead with an invented number.
**Step 6 (if "not ready to commit"):** same pilot offer as Twin Electrics
— 5-10 vehicles/technicians, 30-60 days, month-to-month, no lock-in.

#### Email draft (Angle A)

Subject: A compliance/GPS layer that works alongside ServiceTitan

Hi [name],

I saw the ServiceTitan case study on Ken Hall Plumbers — really strong
story, 40+ years family-run and still growing. I'm not reaching out to
pitch a replacement for what's clearly working for you.

I built Minerva, which focuses specifically on GPS fleet tracking and
compliance record-keeping (vehicle checks, licence/credential expiry,
incident logging) for trade businesses — an area that's not
ServiceTitan's specialty. It's priced per technician, and several
businesses use it as an add-on layer alongside their existing job-
management software rather than a replacement.

Given your fleet size, I'd like to put together the actual numbers for
Ken Hall specifically — no cost, no obligation, and no pressure to change
anything that's already working. Would you (or whoever handles fleet/
compliance decisions) have 15-20 minutes in the next couple of weeks?

[your name]
[phone]

#### Phone opener

"Hi, I'm looking to speak with Brad Hall or whoever handles fleet/
compliance decisions. I saw the ServiceTitan case study on Ken Hall
Plumbers — I'm not calling to replace that, I actually built something
that's meant to sit alongside it: GPS and compliance-record tracking
specifically, which isn't ServiceTitan's focus. Do you have a few minutes,
or is there a better time to call back?"

**Do not claim:** that Minerva can replace ServiceTitan, that it
integrates with ServiceTitan (unconfirmed — don't promise an integration
that doesn't exist), or any specific savings number before the real
call's numbers are known.

---

### Target 3 of 4 — Associated Cleaning Services (400+ sites, national) — real scale, real access caveat, start early (longest lead time)

**Step 1 (Sept 15-19):** find the actual Brisbane-region operations
manager (not a generic head-office contact) via the company site and
LinkedIn — a 400-site national operation needs a regional entry point, not
a company-wide one.
**Step 2 (Sept 22):** send the email draft below, explicitly scoped to
Brisbane-region sites only, not the national network.
**Step 3 (on any reply):** ask how site-arrival verification is currently
handled across their network today (manual sign-in sheets, phone
check-ins, nothing formal) — this tells you whether the real gap is as
open as assumed.
**Step 4 (if a conversation progresses):** treat any "yes" as a regional
pilot on a handful of sites, never a company-wide close — be upfront that
Minerva hasn't been tested at anywhere near 400-site scale, and that
proving it on a small number of sites first is the honest and correct
first step, not a sales delay tactic.
**Step 5:** budget this as the longest sales cycle of the four targets —
don't count it in any near-term forecast, and don't let a slow response
here crowd out faster-moving targets.

#### Email draft

Subject: verifying arrival at 400 sites — Associated Cleaning

Hi [name],

I build Minerva — automatic GPS-based arrival/departure logging for
service crews, so you get a timestamped confirmation the moment a crew
checks in and out at each site, without anyone having to call around to
confirm.

At your scale, I'd guess this is already something you've had to solve
for internally in some form — I'm not assuming it's broken, just curious
how it's currently handled across your site network, and whether a
lighter-weight automatic version would be useful for even a handful of
sites as a trial.

Would a 15-minute conversation about how this works today be useful,
starting with just your Brisbane-region sites rather than the whole
network?

[your name]
[phone]

**Do not claim:** that Minerva already supports multi-region rollout at
this scale in production (it hasn't been tested at anywhere near 400
sites) — if this progresses, be upfront that a small-site pilot is the
right first step, not a company-wide claim on day one.

---

### Target 4 of 4 — Metropolitan Plumbing (multi-state) — real pain signal, real caveat, lowest priority of the four

**Step 1 (Sept 22-26):** find the actual state-level operations manager
or franchise owner — a generic head-office email is unlikely to reach
anyone who can decide.
**Step 2 (Sept 29):** send the email draft below — lead only with the
operational ETA question, never reference any review or their pricing
model.
**Step 3 (on any reply):** if pricing/upsell complaints come up in their
own words during the call, that's their disclosure to make, not yours to
raise — don't probe for it.
**Step 4:** budget this as a longer, lower-probability conversation than
the other three — this is a large multi-state operation more likely to
have layers between you and any real decision-maker, and more likely to
already run enterprise software, and their commercial model may have less
incentive to adopt a transparency-increasing tool. Send it, but don't
lead the quarter with it.

#### Email draft

Subject: the "no update call" ETA problem — Metropolitan Plumbing

Hi [name],

I build Minerva, a live GPS tracking + automatic client-texting tool for
trade businesses. Quick, direct question: for jobs where a tech is running
behind, what's the current process for getting the client an updated ETA
without someone on your team having to call them?

Most of the trade businesses I talk to solve this reactively — a client
calls in annoyed, then someone rings the tech, then someone calls the
client back. Minerva does that automatically: a live tracking link plus an
auto-text the moment a tech is within 15 minutes, no manual calls needed
either direction.

Given your scale, happy to walk through what that would actually look like
for one region first, no commitment. Worth 15 minutes?

[your name]
[phone]

**Do not claim:** anything about their pricing model or reference any
review — lead only with the operational ETA question.

---

### Deliberately excluded from active priority order

A. Abbott Locksmiths' own research notes no visible pain point to lead
with — it's a reputation-protection pitch, not a problem-solving one,
making it the lowest-confidence of the original five targets. Keep its
draft on file (below, unchanged from prior research) but don't spend Q4
outreach cycles on it ahead of the four above; only revisit it once the
four above are fully worked.

#### A. Abbott Locksmiths draft (on file, lower priority)

Subject: a small idea for A. Abbott Locksmiths' next busy season

Hi [name],

I noticed A. Abbott has built a genuinely strong reputation over 50+
years — the reviews are some of the most consistently positive I've seen
for a locksmith business your size. I'm not reaching out because
something's broken; I'm reaching out because that reputation is worth
protecting as you grow.

I build Minerva — live GPS tracking so a locked-out customer can watch
your tech's ETA on their phone instead of calling to ask, plus a
timestamped job record for every callout. For a business built on trust
the way yours clearly is, it's a way to make that trust visible to a
customer before you've even arrived, and to have a clean record on hand
if a job's ever disputed.

No pressure at all — happy to send a 2-minute self-serve demo if that's
easier than a call: [demo link].

[your name]
[phone]

**Do not claim:** that anything is currently wrong with their operation.

## Weekly sequence, all four targets on one timeline

- **Sept 15:** Twin Electrics sent (email); Ken Hall Angle A sent (email).
- **Sept 18:** Twin Electrics phone follow-up if no reply.
- **Sept 19-22:** identify Associated Cleaning's Brisbane-region contact.
- **Sept 22:** Associated Cleaning sent; Ken Hall Angle B raised verbally
  if a conversation is underway.
- **Sept 22-26:** identify Metropolitan Plumbing's state-level contact.
- **Sept 29:** Metropolitan Plumbing sent; any non-responder from Sept
  15-22 gets one follow-up, not a second cold pitch.
- **Oct (ongoing):** discovery calls, real-numbers gathering, pilot offers
  wherever "not ready to commit" comes up.
- **Nov-Dec:** close whatever's closeable this quarter — Twin Electrics is
  the most likely to land first based on confidence level; treat Ken
  Hall as the biggest-dollar prize worth the most follow-through time;
  treat Associated Cleaning and Metropolitan as longer-odds background
  threads, not the quarter's centerpiece.

**What "everything associated" means here, concretely:** all five drafts
above (four active, one on file) are the complete, real, sendable
collateral — this plan's actual work is prioritization, sequencing, and
finding each real decision-maker, not new collateral. No product-side
gap exists for any of these four: the dispute pack (Ken Hall), GPS ETA
texting (Metropolitan), multi-site arrival logging (Associated Cleaning),
and core GPS/compliance tracking (Twin Electrics) are all already built
and live in the codebase.

---

# PLAN 3 — Combined (both tracks, one calendar, explicit honesty about which produces 2026 vs. 2027 revenue)

**The structure:** Plan 1 and Plan 2 run in parallel, not sequentially —
they don't compete for the same time, since Plan 1 is one email plus
whatever follow-up a response earns, and Plan 2 is the same outreach
motion already planned regardless.

## Combined week-by-week

**Week of Sept 15:**
- Track A: Twin Electrics sent (email); Ken Hall Angle A sent (email).
- Track B: Jim's Group inquiry sent to first division contact.

**Week of Sept 18-19:**
- Track A: Twin Electrics phone follow-up if no reply; begin identifying
  Associated Cleaning's Brisbane-region contact.
- Track B: no action yet (waiting the full week before a second division
  contact, per Plan 1 Step 3's Sept 22 timing).

**Week of Sept 22:**
- Track A: Associated Cleaning sent; Ken Hall Angle B raised verbally if
  a conversation is underway; begin identifying Metropolitan Plumbing's
  state-level contact.
- Track B: send identical inquiry to second Jim's division if first
  produced no reply.

**Week of Sept 29:**
- Track A: Metropolitan Plumbing sent; one follow-up to any Sept 15-22
  non-responder.
- Track B: if neither division has responded, send the single-franchisee
  pilot fallback.

**October (ongoing):**
- Track A: discovery calls, real-numbers gathering, pilot offers per
  target as responses arrive.
- Track B: if a real reply arrived, qualify only — don't pitch
  network-wide, don't propose pricing on the first real call.

**November-December:**
- Track A: close whatever's closeable this quarter (Twin Electrics most
  likely first; Ken Hall the biggest-dollar prize; Associated Cleaning
  and Metropolitan as longer-odds background threads).
- Track B: any real movement here (e.g., agreement to a single-division
  pilot) is a genuinely excellent 2026 outcome to have set up — but
  it's a 2027 revenue event, not a Dec 31 number, and shouldn't be
  counted as one.

## Tracking mechanism

One shared list (spreadsheet or whatever already tracks the 18 named
accounts) with every target from both tracks as rows: target name, track
(A/B), date sent, contact found (Y/N), response (Y/N), next action, and
whether it's a 2026-forecast account or a 2027-seed account. This single
list is the actual mechanism that prevents Track B's slower cadence from
either being neglected or accidentally over-prioritized against Track A's
faster-moving, more-likely-to-close accounts.

## The one honest sentence this plan needs, said directly

If you hit $200K this year, it will be because Track A's diversified
accounts closed faster and larger than the $60-90K ceiling assumption
(possible only if close rates or deal sizes beat the conservative
estimate, which would need to be verified as it happens, not assumed) —
not because Track B produced Dec 31 revenue. Track B is real, worth doing,
and should be run anyway, but budget it as planting a 2027 seed, not part
of this year's number.

**What "everything associated" means here, concretely:** the shared
tracking list above, plus the five total outreach drafts from Plan 2 and
the two from Plan 1, are the complete, real, buildable/sendable
collateral for the whole combined plan. No further product features,
pages, or infrastructure are needed to execute any of the three plans —
the gap in all three is sales execution and time, not anything buildable
in the codebase.
