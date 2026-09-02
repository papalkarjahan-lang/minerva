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
underlying mechanism runs either way:

- "Minerva automatically re-texts leads that went cold, trying to win them
  back." — true (template SMS if no key, Claude-drafted if key is live)
- "Minerva drafts weekly ad copy for suburbs you're under-booked in." — true
  either way, drafts are always human-approved before sending
- "Minerva flags billing mismatches / overdue invoices / expiring
  credentials automatically." — true, the anomaly detection logic itself
  isn't AI-dependent, only the plain-English explanation attached to it is
- "Minerva watches technician hours and flags burnout risk." — true, pure
  threshold logic, no AI involved at all
- "Minerva reschedules around bad weather automatically." — true, uses a
  free weather API, not AI

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

## On the Industrial sector specifically

See the honesty note already written into
`supabase_schema_delta_industrial.sql` and repeated in
`CLIENT_PITCHES_ADDENDUM.md`: no real RFID/BLE/drone/telematics hardware
integration exists. Never imply live equipment tracking is turnkey — it
requires the client's own hardware or vendor feed connected to a real, but
currently unconnected, ingestion endpoint.

## Rule of thumb for any new agent capability going forward

Before it goes into a pitch script, ask: *does this claim hold true on the
fallback path, with no API key and no real external data source connected?*
If yes, it's safe to say plainly (drop the word "AI," say "automatically"
instead). If the claim is only true once a key/hardware/vendor feed is
connected, don't put it in front of a prospect until that's actually live —
update this note the day it is.
