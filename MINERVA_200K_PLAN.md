# The Full Plan: Sept 10 → Dec 31, 2026

This is the single, complete plan — what's built, what you personally have to
do, in what order, week by week, and exactly what happens if each step
underperforms. It supersedes nothing; it stitches together
`BIG_CONTRACTS_PLAYBOOK.md` (the big-account math and targets),
`DEPLOYMENT_CHECKLIST_PENDING.md` (the technical setup steps), and
`ACCOUNT_SETUP_WALKTHROUGH.md` (the account-by-account how-to) into one
sequenced timeline, plus the one thing none of those documents state plainly
enough on their own: **the honest range and why**.

**The honest range, stated once, up front:** $5-25K actually collected in
2026 from cold-start SMB volume alone; **$10-30K MRR / $120-360K annualized
run-rate by Dec 31** if the automated outreach engine converts normally AND
at least one big-account target closes. A literal $200K *collected in 2026*
from a cold start is not realistic under any researched benchmark — that's
not pessimism, it's the same math ServiceM8/Tradify's own growth curves and
B2B cold-email conversion rates produce for anyone starting at zero. The
plan below is built to hit the top of the realistic range, not to manufacture
a fake path to $200K collected.

---

## Part 1 — Every bottleneck identified, and what removes it

This is the actual answer to "find a way around it." Nothing below is
theoretical — each row names the specific file that does the work.

| Bottleneck | Why it blocks growth | What removes it | Status |
|---|---|---|---|
| Can't hand-write enough cold emails per day | 1 person can realistically write 5-10 genuinely personalized emails/day by hand; volume caps at ~150-300/month | `draft-outreach-batch` AI-drafts personalized emails at scale, grounded in a hard-coded real-features list so it can't invent claims | **Built** |
| Can't manually track follow-ups without dropping leads | No-reply leads silently die without a system nudging them | `followup-outreach` daily cron auto-drafts day-3/7/14 follow-ups, auto-closes after 3 unanswered | **Built** |
| Compiling a clean prospect CSV by hand is slow | Manually retyping company/contact/email from a directory page takes real time per row | `parse-prospect-text` — paste raw copied text, AI extracts structured rows | **Built** |
| Big-account pitches need a quantified, credible number, not a generic deck | "Save money with GPS tracking" is vague; a Fortune-style ROI number is what actually moves a 20-50-tech decision-maker | `generate-roi-proposal` + `/proposal/:id` — real conservative benchmark math (15% fuel savings), shareable link | **Built** |
| No visibility into whether outreach is even working | Can't fix what you can't see | Outreach tab in `AdminConsole.jsx` shows counts at every stage: drafted / approved / sent / replied / closed | **Built** |
| Franchise networks look like a shortcut but aren't | Jim's Group etc. have 5,700+ independent decision-makers — a franchisor deal ≠ a mass install | Redirected targeting to real single-decision-maker structures (see Part 3) | **Solved by research, not code** |
| Finding actual named multi-van/FM/council targets | This is real prospecting — no API or scrape can legally/reliably produce this list | Cannot be automated further — see "What stays 100% manual" below | **Not automatable — budget real hours for it** |
| Closing a $20-90K/year deal | A contract this size is never won by cold email alone | Cannot be automated — needs a real call/meeting. The ROI proposal tool makes that call more effective, but doesn't replace it | **Not automatable** |
| Actually sending real emails to real prospects | Standing safety boundary: no autonomous outbound messaging to third parties | Deliberately NOT automated — `send-outreach-batch` requires your explicit "Send approved" click every time, hard-filtered server-side to `status='approved'` | **Intentional, permanent limit** |

**The honest remainder:** two bottlenecks in that table cannot be automated
away no matter what — finding real named big-account targets, and having the
actual closing conversation. Every plan that promises otherwise is lying to
you. What the automation above buys you is *time*: every hour that used to go
into typing prospect rows, writing first-draft emails, and remembering to
follow up now goes into those two irreducible, human-only tasks instead.

---

## Part 2 — Deployment order (do this first, before any outreach)

Nothing in Part 3 works until this is live. In order:

1. **Account-setup blockers** (all block core product functionality, not just
   outreach — see `ACCOUNT_SETUP_WALKTHROUGH.md` for the click-by-click steps):
   - Connect a bank account, then: Twilio SMS-capable upgrade, Mapbox billing,
     Anthropic Console billing (unlocks `ANTHROPIC_API_KEY` — every AI-drafting
     function, including the new outreach ones, silently no-ops without it).
   - Stripe live-mode switch (needed before any real client pays you).
2. **Run the outstanding SQL deltas**, in this order, in the Supabase SQL
   Editor: `supabase_schema_delta_twilio_number_unique.sql`,
   `supabase_schema_delta_outreach_engine.sql`,
   `supabase_schema_delta_roi_proposals.sql`.
3. **Deploy the new edge functions** (via the multipart `/functions/deploy`
   API method — see `minerva_supabase_function_deploy_method.md` memory,
   never PATCH+JSON): `draft-outreach-batch`, `send-outreach-batch`,
   `followup-outreach`, `generate-roi-proposal`, `parse-prospect-text`.
4. **Run `supabase_schema_delta_outreach_engine_cron.sql`** (registers only
   the daily follow-up draft sweep — nothing else runs unattended).
5. **Set `RESEND_API_KEY`** — without it, `send-outreach-batch` safely no-ops
   instead of sending (same pattern as the existing welcome email).
6. **Get a fresh Supabase PAT** to redeploy `stripe-webhook`/
   `test-agent-health` (carrying operator-alert-email support from Round 5),
   and optionally set `OPERATOR_EMAIL`.
7. **Legal review**: have a real solicitor confirm the live Terms/Privacy
   pages match `COMPLIANCE_TEMPLATES.md` before onboarding paying clients
   with real contracts/data-sharing terms.

None of this is optional — skipping straight to outreach with `RESEND_API_KEY`
unset means every "Send approved" click will silently do nothing.

---

## Part 3 — The two parallel tracks, week by week

Two tracks run at once from day one: **Track A (volume)** uses the new
automation to run normal SMB cold outreach at a much higher sustainable rate.
**Track B (big accounts)** is the 5-10 targets that could each be worth 20-40
Track-A deals. Track B is not automatable, so it needs dedicated calendar
time every week regardless of how Track A is performing.

### Week 1 (Sept 10-16): Setup + target list
- Finish Part 2 deployment order completely.
- Track B: build the actual candidate list — 10-15 named companies across the
  4 real target types from `BIG_CONTRACTS_PLAYBOOK.md` §3 (multi-van trade
  companies with 10-50 vans under one owner, FM companies, council fleets,
  strata managers). Source via LinkedIn ("Operations Manager" + trade
  company, city-by-city) and Google Maps ("[trade] company [city]" filtered
  for obvious multi-van signals — large fleet photos, "commercial/industrial"
  language on their site). This is real research time — budget 4-6 hours.
- Track A: paste your first 30-50 prospects (CSV or `parse-prospect-text`),
  run "Draft new," review/edit every draft personally before approving any.

### Weeks 2-4 (Sept 17 – Oct 7): First outreach wave + first big-account contact
- Track A: approve and send the first wave (aim for 100-150 sent across these
  3 weeks — sustainable with the AI-drafting in place, review time is now the
  limiter, not writing time). Let `followup-outreach` handle day-3/7/14
  nudges automatically; you only touch a thread again when someone replies.
- Track B: reach out to all 10-15 Track B targets directly (LinkedIn message,
  cold call, or email — whichever gets a real human on the phone fastest for
  each). For anyone who engages, generate a `/proposal/:id` ROI page with
  their real (or best-estimated) fleet size and lead the follow-up
  conversation with that number.
- Reply-rate checkpoint at end of Week 4: 3-9% reply rate on ~150 sent should
  produce roughly 5-13 replies, 1-3 real conversations started.

### Weeks 5-8 (Oct 8 – Nov 4): Second wave + first big-account close attempt
- Track A: second wave of 100-150 sent, same review discipline. Cumulative
  ~250-300 sent by end of Week 8.
- Track B: at least one of the Week 2-4 conversations should be far enough
  along to attempt a close, or clearly dead (in which case, replace it on the
  list with a new target — don't let the list shrink to zero). Also start
  the channel-partnership outreach here (§4 of the playbook): approach 1-2
  insurance brokers/comparison platforms with the "help your clients reduce
  claims risk" framing, offering a 15-30% first-year referral fee.
- Also start the trade-association reach play here (§5): contact 2-3 state
  associations about a newsletter mention or sponsored content slot — long
  lead time on these, so starting now is what makes them useful before Dec 31.

### Weeks 9-12 (Nov 5 – Dec 2): Third wave + big-account push
- Track A: third wave, another ~100-150 sent. Cumulative ~350-450 sent.
  At 0.2-2% cold-to-close, this alone should produce roughly 1-9 closed SMBs
  from this wave, on top of whatever closed from earlier waves.
- Track B: this is the real decision window — any big account that hasn't
  had a serious conversation started by now is very unlikely to close before
  Dec 31 (these deals run 4-12+ weeks from first real conversation to signed
  deal in normal B2B timelines; council/government targets specifically
  should be treated as 2027 wins, not counted here at all).
- Checkpoint: by now you should know, realistically, whether 2026 lands at
  the low end ($5-10K MRR, no big account) or the high end ($15-30K MRR,
  1-2 big accounts) of the honest range.

### Weeks 13-16 (Dec 3-31): Close what's in motion, don't start new big swings
- Track A: keep sending waves on the same cadence — this is now pure
  compounding, no new setup needed.
- Track B: focus entirely on closing whatever is already in motion. Starting
  a brand-new big-account conversation this late has very low odds of
  closing before Dec 31 — better to nurture it into a strong Q1 2027 start
  than to force it.
- End of year: tally actual MRR against the honest range above, and use
  whatever the real number is (not a projection) as the actual baseline for
  a 2027 plan — this is exactly the same discipline the project's original
  internal docs already used ($35-80K MRR by month 14 projection), just
  re-grounded in real 2026 results instead of a pre-launch estimate.

---

## Part 4 — What stays permanently manual, and why that's the right call

- **Finding named big-account targets** — no legal/reliable data source
  exists for this; it has to be real research.
- **The actual sales conversation for anything over ~10 techs** — no AI
  drafting replaces a real relationship for a five-figure annual contract.
- **Clicking "Send approved"** — this is not a temporary limitation to be
  removed later. It is the same standing safety boundary already applied to
  every other outbound channel in this codebase (the Growth pillar's
  `launch-ad-campaign`/`send-growth-message`). Automating past this point
  would mean an AI sending real messages to real people with no human in the
  loop — that line does not move regardless of how good the drafting gets.
- **Government/council targets** — genuinely can't be sped up; their
  procurement cycles are structurally slow. Worth pursuing for 2027, not
  counted toward Dec 31, 2026 at all.

This plan gets you to the top of a real, researched range by removing every
bottleneck that automation can legitimately remove. It does not, and cannot,
manufacture a guaranteed $200K collected by Dec 31 — no honest plan can.
