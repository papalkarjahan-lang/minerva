# Minerva — Sales Claims Accuracy Note (2026-09-01)

Internal only — not client-facing. Purpose: stop a real sales call from
promising something the live product can't yet back up. Check this before
using any "smart"/"AI"/"adapts automatically" language from the pitch docs
or the addendum.

## The core issue

The Agent Operating System (Outreach/Marketing/Scheduling/Finance reasoning
layer) was built with a hard requirement: every function must work
correctly with plain templates/rules when `ANTHROPIC_API_KEY` is absent, and
upgrade automatically to Claude-drafted reasoning when it's present. As of
this note, **the key is not set** — blocked on the same bank-account gate as
Mapbox and Twilio's SMS-number upgrade (see
`minerva_setup_progress.md`). So right now, in production, every "AI" agent
is running its fallback path.

## Safe to say on a call today

These are true regardless of whether the Anthropic key is live, because the
underlying mechanism runs either way — **but as of 2026-10-10, most of them
are also tier/sector-gated, which this list didn't reflect until now.**
Found while correcting the same error already fixed in
`EXACT_OUTREACH_EMAIL_DRAFTS.md` — a reminder that AI-key-dependence isn't
the only thing that can make a "safe to say" claim stop being true; a
billing/tier change can too, and this file needs the same re-check
whenever one lands, not just when a new agent capability ships.

**True for every Minerva customer, any tier, any sector:**
- "Minerva flags billing mismatches automatically." — true, the anomaly
  detection logic itself isn't AI-dependent, only the plain-English
  explanation attached to it is
- "Minerva watches technician hours and flags burnout risk." — true, pure
  threshold logic, no AI involved at all

**True only for Standard tier and up, trade sector only** (this automation
bundle didn't exist as a real differentiator until 2026-10-09 — see
`BILLING_INTEGRITY_NOTES.md`'s "Standard tier had no real differentiator"
entry; industrial never gets any of these regardless of tier, since they
read `jobs`/`invoices`/`leads`, tables industrial doesn't use):
- "Minerva automatically re-texts leads that went cold, trying to win them
  back." (template SMS if no key, Claude-drafted if key is live)
- "Minerva automatically reminds clients about overdue invoices."
- "Minerva reschedules around bad weather automatically." — uses a free
  weather API, not AI, but still gated the same way as the other two
- "Minerva checks in with clients who haven't come back in a while." —
  the fourth automation in the same Standard+/trade bundle; wasn't in
  this list before even pre-dating the gate, add it alongside the other
  three now that all four are correctly scoped together

**True only for Pro tier, trade sector only** (pre-existing gate, just
never reflected in this specific list before — don't assume something's
accurate here just because it predates the Standard-tier change above):
- "Minerva drafts weekly ad copy for suburbs you're under-booked in." —
  drafts are always human-approved before sending, but the drafting
  itself only runs for `subscription_tier = 'pro'`
- "Minerva flags expiring technician credentials automatically." — reads
  `technician_credentials`, a Pro-tier-only trade table (nothing outside
  Pro/trade can ever have a row there to flag)

## NOT safe to say until `ANTHROPIC_API_KEY` is live

- "Minerva's AI writes your marketing/customer texts for you" — technically
  true only in the sense that a template is currently doing this, not an
  AI. Don't say "AI" or "smart" specifically until the key is set — say
  "automatically," which is accurate either way.
- "Minerva gives you a weekly AI-written report on your business health" —
  the Agent Council report (`agent-council-report`) exists but is
  operator-facing only (Minerva's own internal ops), not shown to any
  client business. Never mention this to a prospect at all — it's not
  their feature.
- Anything implying the system "learns" or "adapts" over time in a
  reinforcement-learning sense. It doesn't. Each run is a fresh
  rules-check or a fresh single LLM call with the current data — there is
  no model training or memory between runs beyond what's stored in
  `agent_insights` as plain rows another function might read later.

## Social proof — not safe to say until there's a real converted customer

**Fixed 2026-09-08:** the Day-7 breakup emails in `OUTREACH_EMAILS.md` and
`EXACT_OUTREACH_EMAIL_DRAFTS.md` (Clients 1, 4, 6) previously included a
line like "A few [trade type] businesses in [region] are already running
Minerva" — false with zero real customers (checked live in the database
2026-09-02). These now use an honest "founding customer" framing instead,
true regardless of actual customer count. Once there's at least one real
paying customer, it's fine to swap in real social proof — say "a [trade
type] business" (singular, true) rather than "a few" until there are
genuinely several. Any NEW pitch copy written from now on should default
to the founding-customer framing until real social proof exists, rather
than a placeholder claim that needs to be remembered and stripped later.

## On the phone AI receptionist (voice-intake-agent, added 2026-09-13)

- "Minerva can answer your phone and book the job for you" — technically
  true only once (a) the business's Twilio number has completed Twilio's
  own phone/identity verification (a real account-level step, unrelated to
  this code, still outstanding as of this note — see
  `minerva_setup_progress.md`), AND (b) their "A CALL COMES IN" webhook is
  pointed at `voice-intake-agent` specifically, not the default
  `missed-call-webhook`. Until both are true, calls get the existing
  static "we missed you, here's a text" response, not a real conversation.
- Even once live, the fallback (no `ANTHROPIC_API_KEY`) path is a fixed
  4-question script (job description, urgency, name, suburb), not free-text
  understanding — say "automatically books your call" rather than "AI"
  until the key is set, same rule as every other agent in this doc.
- Never claim the phone agent "recognizes" what's wrong from how something
  sounds, detects distress, or does anything with audio beyond what
  Twilio's own speech-to-text transcribes into text — there is no separate
  audio/voice-analysis model here.

## On corrective-action tracking and fatigue-aware dispatch (added 2026-09-12)

- "Minerva turns flagged safety issues into an assignable ticket with a
  due date" — true, real (`corrective_actions` table), no AI dependency,
  works identically with or without any API key.
- **Correction (2026-09-13):** the same is NOT true yet for photo
  problems specifically. `verify-checklist-photos` only ever marks a
  photo `'flagged'` (which is what triggers a ticket) when
  `ANTHROPIC_API_KEY` is set — without it, every photo goes
  `'unavailable'` instead, so the photo→ticket path never actually fires
  today. Don't say "flagged photo problems" becomes a ticket until the
  key is live; "flagged safety issues" (hazards) is the only half of that
  claim that's true right now.
- "Minerva avoids overloading your most burnt-out technician" — true, pure
  threshold logic on GPS-derived hours worked (`rolling_week_hours`), not
  AI, and it's a soft tiebreak among comparably-close technicians, not a
  hard block — don't imply it overrides distance/availability entirely.

## On the Industrial sector specifically

See the honesty note already written into
`supabase_schema_delta_industrial.sql` and repeated in
`CLIENT_PITCHES_ADDENDUM.md`: no real RFID/BLE/drone/telematics hardware
integration exists. Never imply live equipment tracking is turnkey — it
requires the client's own hardware or vendor feed connected to a real, but
currently unconnected, ingestion endpoint.

## On Pro tier and Industrial sector (added 2026-10-08)

**Never mention "Pro tier" or its $119/tech/mo price to an Industrial-
sector prospect, even in passing.** Pro's entire marketed differentiator
— on-site invoicing, asset tracking, compliance checklists, materials/
inventory tracking, technician credential tracking, automated growth
marketing — only exists in the trade-sector console; none of it was ever
reachable for an industrial business. The signup flow itself won't offer
or charge Pro to a business that picked Industrial (fixed 2026-10-08, see
`BILLING_INTEGRITY_NOTES.md`'s "Pro tier has nothing for Industrial"
entry), so this isn't just a pitch-accuracy issue anymore — promising it
on a call would promise something the product will then visibly fail to
deliver at signup, which is worse than a vague overclaim. For Industrial,
pitch purely on capability (site check-ins, safety log, asset register,
consumables alerts, client verification packages — see Client 9 below),
never on tier name or price point.

**Correction (2026-10-10): don't say "Starter/Standard" as if both are a
live option worth discussing.** Checked while fixing the same error in
`EXACT_OUTREACH_EMAIL_DRAFTS.md`'s Client 9 pricing (it had invented a
fictional flat per-site rate that was never built — industrial is billed
the same per-technician way as trade): nothing in the industrial-specific
code path checks `subscription_tier` at all, so Standard ($79/tech) costs
more than Starter ($49/tech) for zero functional difference on this
sector — the exact same "tier costs more, delivers nothing extra" bug
already found and fixed for trade's own Starter/Standard gap on
2026-10-09. Industrial's real price is just $49/tech/month; don't invent
a reason to upsell to $79 that doesn't exist today. Flagged to the user
as a real product question (same as the trade one was) — this note will
need updating if/when Standard gets real industrial-specific value.

**The "Asset Intelligence" Minerva Max add-on ($39/mo) is the same
story, narrower scope:** its predictive-maintenance/idle-asset alerts
only ever read industrial-sector asset data. Don't offer it to a trade-
sector prospect — same reasoning, same "the product will visibly fail to
deliver what was promised" consequence, now also prevented at the point
of sale in-app (same fix).

## Rule of thumb for any new agent capability going forward

Before it goes into a pitch script, ask: *does this claim hold true on the
fallback path, with no API key and no real external data source connected?*
If yes, it's safe to say plainly (drop the word "AI," say "automatically"
instead). If the claim is only true once a key/hardware/vendor feed is
connected, don't put it in front of a prospect until that's actually live —
update this note the day it is.
