# The "one big win" math, and how to actually go get it

This is the response to a real, correct point: chasing 40 individual $300-500/mo
SMBs one cold email at a time is the slow path. A handful of larger contracts
changes the math completely. Below is the actual math, the *real* targets
(not franchise networks — see why below), the automation that removes the
"can't write enough outreach in a day" bottleneck (built, see
`AdminConsole.jsx`'s Outreach tab), and the honest caveats.

---

## 1. The math — why 1 big deal + normal volume beats 40 SMBs

Minerva's price is per-technician, so a single business with many
technicians is worth as much as dozens of 3-tech SMBs, but takes the SAME
one sales conversation to close:

| Deal size | Techs | Price tier | MRR | Annualized |
|---|---|---|---|---|
| Typical SMB | 3 | $79 | $237 | $2,844 |
| Mid-size multi-van company | 20 | $89 (bulk/negotiated) | $1,780 | $21,360 |
| Larger regional fleet | 50 | $89 | $4,450 | $53,400 |
| Facilities-management contract | 100 (across client sites) | $79 (volume) | $7,900 | $94,800 |

**One facilities-management or large multi-van contract is worth 20-40 SMB
deals.** Five mid-size wins (20-50 techs each) put you at roughly
$8,900-$22,250 MRR — **$107K-$267K annualized** — which is the fastest
realistic path to the $200K conversation. This is the correct strategic
shift: stop optimizing cold-email volume as the primary lever; make it the
floor, and put real effort into 5-10 large-account targets in parallel.

---

## 2. Why franchise networks (Jim's Group etc.) are the WRONG big target

Worth naming directly since it's the obvious first idea: Jim's Group has
5,700+ franchisees across 50+ divisions — sounds like "sign one deal, get
5,700 locations." **It doesn't work that way.** Each Jim's franchisee is an
independent business owner who bought their own franchise and makes their
own software decisions — there is no single person who can say "yes" on
behalf of all 5,700. A win at Jim's Group HQ level would only ever be
"listed as a recommended/endorsed vendor," not an actual mass-install — real,
useful as a *marketing credibility signal*, not a shortcut to revenue.
Don't spend the limited outreach effort chasing a "master deal" with a
franchisor expecting it to behave like a single large customer — it won't.

## 3. The REAL single-decision-maker multi-location targets

These are structures where ONE person can actually say yes for many
technicians at once:

- **Multi-van trade companies under single ownership** — a plumbing/
  electrical/HVAC business that already has 10-50 vans and one owner or
  GM, not a franchise. These exist in every Australian capital city (search
  "plumbing company [city] fleet" or LinkedIn "Operations Manager" at
  mid-size trade companies — this is real prospecting work, not automatable,
  but is a small, targeted list, not hundreds of cold emails).
- **Facilities management (FM) companies** — they dispatch trade
  technicians across many client sites under contract and are exactly the
  buyer profile Minerva's GPS/compliance/route-optimization bundle was
  built for. One FM contract could mean 50-200 technicians under one
  decision-maker.
- **Local council / government maintenance fleets** — councils run their
  own trade maintenance crews (parks, water, electrical) and are large,
  single-decision buyers, though with a real caveat: government procurement
  cycles are slow (often 3-6+ months, formal tender processes) — worth
  starting the conversation now for a 2027 win, not counting on it landing
  within weeks.
- **Strata/property management companies** — similar structure to FM,
  smaller scale typically (5-30 techs), but faster decision cycles than
  government.

## 4. Channel partnerships — a REAL, proven precedent in this exact market

Confirmed while researching this: **BizCover (an insurance comparison
platform) is hipages' official insurance partner** — hipages is a real,
large Australian tradie lead-generation marketplace. This proves the exact
partnership model being proposed here (trade-platform + insurance broker)
already works and is already normal in this market — it's not a novel or
unproven idea.

The pitch to an insurance broker or comparison platform: Minerva's
compliance/safety logging (`detect-safety-hazards`,
`verify-industrial-compliance`, `check-credential-expiry`) gives their
trade-business clients a real incident/credential record — reduces their
claims risk. Frame it as "help your clients reduce risk" to the broker, not
"give us your client list" — brokers won't hand over client data, but they
will refer/co-market if there's a genuine mutual incentive. A formal referral
fee (15-30% of first-year value is the standard range, per real B2B
partner-program benchmarks) is worth offering upfront, not negotiating into
later.

## 5. Trade associations — real, but a marketing-reach play, not a client list

Association membership lists aren't public (privacy, checked directly this
session) — you can't cold-email a scraped member list. What IS realistic:
approach 2-3 state associations (Master Plumbers NSW/SA/WA/Tas, NECA for
electrical) directly asking about a newsletter mention, sponsored content,
or conference presence. This reaches hundreds of businesses in one motion,
but the ask is "let us put a message in front of your members," not
"give us your members' emails."

---

## 6. What's now automated vs. what still needs you personally

**Automated (built this session — see `outreach_prospects` table,
`draft-outreach-batch`, `send-outreach-batch`, `followup-outreach` edge
functions, and the Outreach tab in `AdminConsole.jsx`):**
- Bulk-adding prospects (paste a CSV, one line per prospect)
- AI-drafting a personalized (not generic-blast) email per prospect, grounded
  only in Minerva's real shipped features (the AI prompt hard-lists them, so
  it can't invent claims)
- Automatic day-3/7/14 follow-up drafting for anyone who hasn't replied
- Tracking status (drafted → approved → sent → replied/closed) so nothing
  silently falls through

**Still requires you, deliberately (per this project's standing safety
boundary — never sent automatically, always your explicit click):**
- Reviewing/editing each AI draft before approving it
- Clicking "Send approved" — the only action that actually emails anyone
- All 5-10 big-account targets above: finding the actual company names/
  contacts (LinkedIn, Google Maps "plumbing company [city]", local FM
  company websites), and the actual conversation/relationship-building —
  a $20K-90K/year decision is not won by a cold email alone; it needs a
  real call/meeting, which nobody but you can do

## 7. Revised honest range for Dec 31, 2026

If normal cold-outreach volume (now running through the automated
drafting/follow-up pipeline instead of by hand) lands 8-15 SMBs, AND even
ONE of the 5-10 big-account targets above closes (a 20-50 tech multi-van
company or a smaller FM contract), realistic exit-2026 MRR moves to
**roughly $10K-30K MRR ($120K-360K annualized run-rate)** — the big-account
win is what actually gets the annualized number into $200K range, not
outreach volume alone. Landing 2+ big accounts by Dec 31 is the real
$200K-by-committed-forecast scenario, but is not something to promise as
certain — it depends on conversations that haven't started yet.
