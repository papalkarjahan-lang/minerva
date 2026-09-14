# The Grand End-of-2026 Plan — updated 2026-09-15

This supersedes the status sections of `MINERVA_200K_PLAN.md` and
`THREE_200K_STRETCH_PLANS.md` with the real, live-queried numbers as of
today, plus the new tier/segmentation positioning built this round. It does
not throw away either document — the week-by-week structure and honest-range
math in `MINERVA_200K_PLAN.md` and the three stretch bets in
`THREE_200K_STRETCH_PLANS.md` are unchanged and still the plan. This is the
"where do we actually stand, right now" correction layer on top of them.

**Every figure below was pulled live from the production database on
2026-09-15, not estimated or carried forward from memory.** Where a number
is a goal rather than a fact, it's labeled "target," never stated as if
already achieved.

---

## 1. The real baseline — no rounding, no optimism

| Metric | Real value (queried 2026-09-15) | Note |
|---|---|---|
| Real paying businesses | **0** | The only row in `businesses` is `[TEST] Theoretical Co` — a test account, not a customer |
| Real revenue collected | **$0** | Stripe live mode is still blocked on the bank-account gate (Mapbox/Twilio/Anthropic/Stripe — see `minerva_setup_progress.md`) |
| Big-account targets researched | **18** | Real named companies (multi-van trades, FM firms, one council) — see `THREE_200K_STRETCH_PLANS.md` base layer |
| Big-account targets actually contacted | **0** | All 18 are still at `stage='researching'` — the outbound step from Week 1 of `MINERVA_200K_PLAN.md` has not happened yet |
| SMB cold-outreach prospects loaded | **0** | `outreach_prospects` table is empty — `draft-outreach-batch` has never been run against a real prospect list |
| ROI proposals generated/sent | **0** | `roi_proposals` is empty |
| Public `/enterprise` inbound leads received | **0** | Page shipped today (2026-09-14/15), zero real-world traffic yet |
| Support requests received | **0** | No real client-facing traffic of any kind yet |

**The honest headline: nothing has gone out the door yet.** Every prior
round built and tested infrastructure (outreach engine, ROI tool, big-account
CRM, the new tiered positioning). None of it has touched a real prospect. As
of today, nine days into the Week 1 (Sept 10-16) window from
`MINERVA_200K_PLAN.md`, the setup portion of Week 1 is done but the "send the
first outreach" portion is not.

This changes the framing of "updated figures and clients": there are no
clients yet to report on. The correct update is the baseline above, not a
fabricated client list — the 18 target companies are real research, not
customers, and must never be described as "clients" until one actually signs
up.

---

## 2. What's new since the last plan revision — the size-tier positioning

This round added a market-segmentation layer on top of the two dimensions
that already existed in the schema (`sector`: trade/industrial,
`subscription_tier`: starter/standard/pro). No new Stripe price or billing
object was created — this is framing over real objects, per the standing
boundary on account/billing changes:

- **Solo** — Starter tier at technician-count 1. Same $49/mo Starter price,
  reframed for the smallest possible customer (one-van operators), who were
  previously invisible in the pricing story.
- **Small / growing teams** — Starter or Standard, 2-30 techs, same as before.
- **Multi-site / fleet** — any tier + Industrial sector, for asset-heavy
  operations (the real, already-built industrial feature set: asset
  telemetry, multi-day site tracking, safety incidents, consumables alerts).
- **Enterprise** — a new public `/enterprise` page and lead-capture form,
  feeding the existing manual `big_account_targets` admin pipeline. No
  self-serve enterprise checkout, no new SLA, no account-manager promise —
  a real person (the user) reviews every inbound enterprise lead, same as
  the 18 hand-researched targets today.

**What this actually buys, honestly:** a wider top-of-funnel story (the
pricing page and features page now explicitly speak to a one-person operator
AND a 50-van fleet, instead of reading as one flat SMB product) and one new,
currently-empty inbound channel (`/enterprise`). It does not change the
underlying math in `THREE_200K_STRETCH_PLANS.md` — the 18-account pipeline
still caps around $60-90K collected even in an impossible instant-close
scenario, and this positioning work doesn't add new named accounts, it makes
the existing ones (and any future public inbound lead) land on a site that
now visibly has "a plan for you" instead of one-size pricing.

**Do not claim in any pitch:** that Minerva has "enterprise customers,"
"multiple product tiers like separate products," or a dedicated
enterprise team. It's one product, one codebase, framed across a size
spectrum — matching `SALES_CLAIMS_ACCURACY_NOTE.md`'s existing rule of
"say what's true on the fallback path, plainly."

---

## 3. The updated end-of-2026 target range

Unchanged from `MINERVA_200K_PLAN.md`, because nothing in the real data above
gives grounds to move it up or down — it's still a projection, not yet
supported or contradicted by real conversions:

**$5-25K actually collected in 2026 from cold-start SMB volume alone;
$10-30K MRR / $120-360K annualized run-rate by Dec 31 IF the outreach engine
converts normally AND at least one big-account target closes.**

What's different today vs. when that range was written: there are now 3.5
months left in the year (today is 2026-09-15, not Sept 10), and zero of the
Week 1 outbound tasks have been executed. The range itself doesn't need to
move yet, but the window to hit the top of it is now shorter, and every day
without a first outreach batch sent is a day subtracted from an
already-tight 16-week plan.

---

## 4. The single most important correction this update makes

Every previous planning document assumed outreach would already be moving
by now. It isn't. The concrete, unblocked, zero-cost-to-attempt next actions
are:

1. **Load a first real prospect batch.** `parse-prospect-text` and
   `draft-outreach-batch` are live and tested — `outreach_prospects` being
   empty is not a technical blocker, it's simply that no real prospect list
   has been pasted in yet. This is the highest-leverage single action
   available today.
2. **Contact at least 2-3 of the 18 researched big-account targets.** They've
   sat at `stage='researching'` since 2026-09-10. Every week they stay
   untouched is a week subtracted from the 4-12+ week B2B close timeline
   `MINERVA_200K_PLAN.md` already flags as the real constraint for Track B.
3. **`RESEND_API_KEY` is still unset** — until it is, even an approved
   outreach send will safely no-op. This one credential is the actual gate
   between "drafted" and "sent" for the entire SMB track.
4. **The bank-account-gated blockers** (Mapbox, Twilio SMS, Anthropic,
   Stripe live mode) remain the same 4 items from every prior round —
   nothing about the tier/enterprise work changes their status.

None of the above requires any new code. The infrastructure built across
every round to date (outreach engine, ROI proposals, big-account CRM, and
now the size-tier positioning) is sitting ready and completely unused in
production. The gap between "built" and "used" is the real story of this
update.

---

## 5. What this document deliberately does not do

- Does not invent a client list. The only companies named anywhere in this
  plan are the 18 real researched targets already in `big_account_targets`,
  and they are described as targets, never as clients or customers.
- Does not raise or lower the $200K framing beyond what `MINERVA_200K_PLAN.md`
  and `THREE_200K_STRETCH_PLANS.md` already establish — those documents'
  honest-range math stands unchanged.
- Does not claim the new `/enterprise` page or tier positioning has produced
  any lead, reply, or dollar yet — it hasn't; it shipped today.
