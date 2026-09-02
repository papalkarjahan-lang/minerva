# Minerva — "Anthropic Key Goes Live" Upgrade Note

Do this the same day `ANTHROPIC_API_KEY` is actually set in production —
not before. This is the flip side of `SALES_CLAIMS_ACCURACY_NOTE.md`: that
doc tells you what you can't say yet. This is the exact set of edits to make
once you can.

**Trigger condition:** `ANTHROPIC_API_KEY` is present in the production
Supabase secrets AND at least one Claude-drafted run has been confirmed to
work end-to-end (check `agent_functions.last_status` for the outreach/
marketing/finance-reasoning functions after the first live run, not just
that the key exists).

## What to change, function by function

- **`nurture-stale-leads`, `chase-unpaid-invoices`, `retention-checkin`,
  `winback-lost-leads`** — the win-back pitch line upgrades from *"Minerva
  automatically re-texts leads that went cold"* to *"Minerva's AI writes a
  personalized re-engagement text for every lead that's gone cold — not a
  template, it reads the job history and writes something specific to
  them."* Only make this claim once you've spot-checked a handful of real
  drafted messages and confirmed they're actually personalized, not just
  technically AI-generated but generic.
- **`generate-growth-drafts` / `launch-ad-campaign` / `send-growth-message`**
  — upgrade *"Minerva drafts weekly ad copy"* to *"Minerva's AI drafts your
  weekly ad copy, tailored to which suburbs you're under-booked in that
  specific week"* — still always human-approved before sending, that part
  of the pitch doesn't change.
- **`reconcile-billing`, `check-credential-expiry`** — the anomaly
  *detection* logic was never AI-dependent and doesn't change. What upgrades
  is the explanation text attached to a flagged item — from a fixed
  template sentence to a Claude-drafted plain-English summary. Pitch line
  can go from *"flags billing mismatches automatically"* to *"flags billing
  mismatches and explains in plain English what looks wrong and why."*
- **Weather reschedule, technician workload/burnout, `send-referral-code-sms`**
  — no change. These were never AI-dependent (pure threshold logic / a free
  weather API) and the pitch language for them doesn't move.

## What does NOT unlock yet, even once the key is live

- **The Agent Council report** (`agent-council-report`) is still
  operator-only, internal to Minerva's own ops — the key going live doesn't
  change who it's shown to. Don't start mentioning it to prospects just
  because the AI is now real; that's a separate, unrelated decision about
  whether to ever build a client-facing version of it.
- **"Learns" / "adapts over time" language is still off-limits.** A live
  API key means better single-run reasoning, not persistence or training
  between runs. Each run is still a fresh Claude call against current data.
  Don't let "the AI is real now" get rounded up to "it learns" — those are
  different claims and only one of them is now true.

## Mechanical steps

1. Update `SALES_CLAIMS_ACCURACY_NOTE.md` — move the newly-true lines from
   the "NOT safe to say" list into the "Safe to say" list, with today's date.
2. Update the 8 client pitch scripts + `CLIENT_PITCHES_ADDENDUM.md` wherever
   they currently say "automatically" for an AI-backed function, per the
   list above.
3. Spot-check 3-5 real drafted messages per upgraded function before
   updating any script — confirm the output is actually good, not just
   that the key is technically present. A live key that produces bad drafts
   is worse for sales trust than an honest template.
4. Note the go-live date somewhere in this file for the record (add it
   below once it happens):

**Go-live date:** _(not yet — fill in when it happens)_
