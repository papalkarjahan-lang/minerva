# Master execution playbook — reaching the ~$75-115K realistic ceiling

Everything below is real, drafted, and ready. Nothing has been sent —
every send is a human (you) clicking send/approve, per the standing
boundary. This document is the single "who, when, what to say" index —
it doesn't repeat the actual email copy, it points at exactly where each
piece lives and the order to run them in.

**The ceiling this targets:** ~$75-115K collected in 2026, per
`THREE_200K_STRETCH_PLANS.md`'s RECOMMENDATION section — Plan 2's 4-account
math + self-serve SMB volume, run well, for free (paid ads is an optional
add-on covered separately below, pending your budget).

**The two hard blockers that gate everything below — fix these first,
today if possible:**
1. `RESEND_API_KEY` — unset. Nothing sends (not even an approved draft)
   until this exists. Get one free at resend.com, verify your sending
   domain, paste the key in Supabase → Edge Functions → Secrets.
2. `ANTHROPIC_API_KEY` — unset. Not a hard blocker (fallback templates
   exist and are usable — see below), but every future `draft-outreach-batch`
   run will keep producing generic templates instead of AI-personalized
   ones until this is set.

---

## Part 1 — WHO, exactly, and where their draft lives

### Track A: 18 named big accounts (`big_account_targets`)
| Priority | Target | Fleet | Draft location |
|---|---|---|---|
| 1 | **Ken Hall Plumbers** (Adelaide) | 122 | `OUTREACH_DRAFTS_TOP_PICKS.md` §2 |
| 2 | **Twin Electrics & Plumbing** (Melbourne) | 30 | `OUTREACH_DRAFTS_TOP_PICKS.md` §1 |
| 3 | A. Abbott Locksmiths (Sydney) | 18 | `OUTREACH_DRAFTS_TOP_PICKS.md` §4 |
| 4 | Mr Splash Plumbing (Sydney) | 15 | `OUTREACH_DRAFTS_REMAINING_TARGETS.md` §3 |
| 5 | CLASS Locksmiths (Canberra) | 10 | `OUTREACH_DRAFTS_REMAINING_TARGETS.md` §1 |
| 6 | M.A.S.S. Electrics (Melbourne) | 9 | `OUTREACH_DRAFTS_REMAINING_TARGETS.md` §2 |
| 7 | Multisparx (Sydney) | 7 | `OUTREACH_DRAFTS_REMAINING_TARGETS.md` §4 |
| 8 | Metropolitan Plumbing (multi-state) | unconfirmed | `OUTREACH_DRAFTS_TOP_PICKS.md` §3 |
| 9 | Associated Cleaning Services (Brisbane, national) | unconfirmed | `OUTREACH_DRAFTS_TOP_PICKS.md` §5 |
| 10-16 | AFM, FM Services Australia, FMS, Fortis FM, Australian Security, Best Doors, Dorrington Plumbing, Garage Door Solutions | unconfirmed | `OUTREACH_DRAFTS_REMAINING_TARGETS.md` §5-12 |
| 17 | Liverpool City Council | n/a — tender-gated | `OUTREACH_DRAFTS_REMAINING_TARGETS.md` §13 — **LinkedIn only, not email** |

Real generated ROI numbers for the 7 confirmed-fleet targets: see
`THREE_200K_STRETCH_PLANS.md`'s RECOMMENDATION section (Ken Hall = ~$130K/yr
alone). ROI proposal pages already exist at `/proposal/:id` — find the IDs
via the Big Accounts tab in the admin console.

### Track C: 9 real SMB prospects, already drafted (`outreach_prospects`)
The Local Plumber, G. Brand & Sons Plumbing, 23 Hour Plumbing (Melbourne
plumbing) · Dawson Electric, Crusader Electrical & Air, RLC Electrical
Contractors (Brisbane electrical) · Total Air Conditioning, Synergy
Air-Conditioning (Perth HVAC) · Murray Pest Control (Adelaide pest
control). **All 9 already have real, personalized, hand-written drafts
sitting at `status='drafted'` in the admin console's Outreach tab right
now** — open the Outreach tab, review each one, edit if you want to add
your own name/phone, then use the new bulk-approve bar (or per-card
"Approve") to move them to `approved`, then click "Send approved" (safely
no-ops until `RESEND_API_KEY` is set).

**To scale Track C volume further:** repeat the same legitimate research
method used for these 9 (company's own published contact email, one trade
per city, cross-checked against `big_account_targets` for duplicates) —
30-50 more real prospects per wave is the realistic volume `THREE_200K_STRETCH_PLANS.md`
Track C already calls for. I can run another research batch any time you
want more — just say so.

---

## Part 2 — WHEN, exact calendar (2026-09-15 → 2026-12-31)

| Week | Track A (big accounts) | Track C (SMB self-serve) | Track D (ads, optional) |
|---|---|---|---|
| **Sept 15-19** | Send Ken Hall + Twin Electrics (top picks) | Set `RESEND_API_KEY` today. Review/edit the 9 drafted SMB emails, approve, send. | Tell me budget/platform if you want this track — copy is ready in `AD_CAMPAIGN_DRAFTS_PENDING_BUDGET.md` |
| **Sept 22-26** | Send Abbott, Mr Splash, CLASS, M.A.S.S. | Let `followup-outreach` auto-send day-3 nudges on wave 1 (no action needed). Request a 2nd research wave (30-50 more) if ready. | If approved last week: review first week's actual CPA/signups |
| **Sept 29-Oct 3** | Send Multisparx, Dorrington, Garage Door Solutions | Draft + review + send wave 2 | Adjust targeting based on real data |
| **Oct 6-10** | Send Metropolitan, Associated Cleaning, AFM, FM Services Australia | Day-7 nudges auto-send on wave 1; draft wave 3 | — |
| **Oct 13-17** | Send Australian Security; verify Fortis FM/Best Doors/FMS structural questions before sending those three | Continue weekly wave cadence | — |
| **Oct 20-Nov 30** | Discovery calls as replies arrive — use `BIG_ACCOUNT_EXECUTION_KIT.md` §2 script + §3 objection table on every call. Generate ROI proposals live on/right after each call. Ask the annual/multi-year contract-value question (per `THREE_200K_STRETCH_PLANS.md` gap-lever #1) on every call, especially Ken Hall. | Keep sending a new wave every 1-2 weeks — pure repetition now, not new setup | — |
| **Dec 1-31** | Close whatever's in motion; prioritize the Ken Hall contract-value conversation specifically | Keep compounding on the same cadence; log final signup count | — |

**This week's literal first 3 actions, in order:**
1. Set `RESEND_API_KEY` (resend.com → verify domain → paste into Supabase secrets).
2. Open AdminConsole → Outreach tab → review the 9 drafted SMB emails → approve → send.
3. Open AdminConsole → Big Accounts tab → send the Ken Hall Plumbers and Twin Electrics & Plumbing emails from `OUTREACH_DRAFTS_TOP_PICKS.md` (find the actual contact name via LinkedIn/a quick call first, per each draft's "Find first" note).

---

## Part 3 — WHAT TO SAY: the sales technique underneath every draft

Every draft in this project already follows the same deliberate structure
— worth naming explicitly since you asked for "the world's best sales
techniques," so you can extend it consistently to future prospects
yourself:

1. **Lead with a specific, real observation about them, not a generic
   opener.** ("I saw the ServiceTitan case study on Ken Hall Plumbers" —
   not "Dear Sir/Madam.") This is basic **personalization**, the single
   highest-leverage lever in cold outreach — genuinely specific beats
   generically flattering every time.
2. **One question, not a pitch, on message one** (Problem-focused, PAS-
   adjacent: Problem → Agitate → Solve, but the "agitate" step is a real
   question, not manufactured urgency). Message one's job is to start a
   conversation, not close — closing on message one reads as spam.
3. **Never claim a number you don't have.** Every draft that lacks a
   confirmed fleet size asks for it instead of guessing — this is the
   single biggest trust-signal in B2B cold outreach, and it's also just
   honest.
4. **Address the real, specific objection before they raise it**, when
   it's knowable in advance (Ken Hall's ServiceTitan incumbency; Fortis
   FM's contractor-not-employee structure) — this is **consultative
   selling**: you're not hiding the hard part, you're showing you did the
   homework.
5. **A low-friction, specific CTA**, never "let me know if interested."
   "15 minutes this week" beats "would love to chat sometime" every time
   — specificity reduces the cognitive cost of saying yes.
6. **The pilot offer for hesitation** (`BIG_ACCOUNT_EXECUTION_KIT.md` §5):
   a bounded, cheap, reversible first step is the standard enterprise-
   sales technique for de-risking a "not ready" response — 5-10
   vehicles/30-60 days/month-to-month, not "sign here for a year."
7. **Self-serve friction removal for the SMB segment**: this is the one
   genuinely new lever this round — a solo/small prospect doesn't need a
   discovery call at all anymore, `/start` goes straight to Stripe
   Checkout with a 7-day trial. The self-serve emails' CTA is "try it,"
   not "book a call," because the product itself removed that step.
8. **A real, working, no-signup demo** (`/demo`, built this round) as the
   objection-free fallback CTA for anyone not ready to reply to an email
   at all — "see it before you talk to anyone."

None of this uses manufactured scarcity, fake urgency, fabricated social
proof, or claims about features/certifications that don't exist — per
`SALES_CLAIMS_ACCURACY_NOTE.md`, which every draft in this project is
checked against. Honest, specific, and low-friction consistently
outperforms hype in B2B software sales — that's the actual "world's best
technique" here, not a trick.

---

## Part 4 — WHAT WAS BUILT this round

- **`/demo`** (`src/pages/Demo.jsx`) — a real, public, no-signup page
  showing what a client receives (live tracking + auto ETA texts), pure
  CSS/SVG animation (no Mapbox dependency — that's still blocked on
  billing), clearly labeled as sample data. This closes a real gap: over
  a dozen already-written outreach drafts referenced a `[demo link]` that
  didn't point anywhere until now. Wired into `App.jsx`, `sitemap.xml`,
  and every existing draft doc updated to the real URL.
- **9 personalized SMB outreach drafts**, written directly (not via the
  AI-drafting function, since `ANTHROPIC_API_KEY` is unset) using the
  trade-matched templates already proven out in
  `EXACT_OUTREACH_EMAIL_DRAFTS.md`, now sitting in `outreach_prospects`
  at `status='drafted'`, ready for your review/approval.
- **13 new big-account outreach drafts** (`OUTREACH_DRAFTS_REMAINING_TARGETS.md`),
  covering every named target that didn't already have one, each correctly
  scoped to what's actually confirmed vs. unconfirmed about that target.
- **7 real ROI proposal pages** (`generate-roi-proposal`, see prior round),
  concrete dollar figures now available for the highest-value discovery
  calls.
- **Ad campaign copy** (`AD_CAMPAIGN_DRAFTS_PENDING_BUDGET.md`) — drafted,
  not launched, pending your budget/platform decision.

## What's still needed from you specifically
- Set `RESEND_API_KEY` — the one thing blocking every send.
- Find the actual contact name for each big-account target before sending
  (every draft says "find first" — a generic "[name]" send reads as mass
  spam and undermines the whole personalization strategy above).
- Decide on the ad budget/platform if you want Track D running.
- Actually click send/approve on everything above — this is the one step
  that can't be automated, by design.
