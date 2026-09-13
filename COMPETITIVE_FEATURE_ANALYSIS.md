# Minerva vs. best-in-class: an honest function-by-function comparison

**What this document is NOT:** a claim that Minerva's 60 edge functions were
originally designed by studying ServiceTitan, Samsara, Apollo, Deel, etc.
They weren't — they were built incrementally in response to specific asks
across many sessions. This document does the comparison retroactively,
now, for real: what do the actual category leaders in FSM, fleet/asset
tracking, outbound lead-gen, HR, compliance, and reputation management do
well, and how does each of Minerva's functions stack up against that —
honestly, including where Minerva is thinner and where a "copy the best
idea" upgrade would actually be worth building.

Source research was done via live web search this session (company docs +
G2/Capterra-style reviews); vendor-stated stats (e.g. "95% data accuracy,"
"180B minutes of video") are flagged as vendor claims, not independently
verified.

---

## 1. Field Service Management (FSM) — ServiceTitan, Jobber, Housecall Pro, FieldEdge

**What the leaders do well:**
- ServiceTitan: proximity/route-aware dispatch board, huge trade-specific
  pricebook, embedded consumer financing at the estimate, membership/
  service-agreement renewal tracking, dozens of built-in revenue/close-rate
  KPIs.
- Jobber: **Client Hub** — a self-serve customer portal for quote approval,
  payment (with tipping), and viewing tech photos/history. Widely cited as
  its signature UX differentiator.
- Housecall Pro: **HCP Finance** — job financing built directly into the
  app, no third-party redirect.
- FieldEdge: Coolfront flat-rate pricebook; deep two-way QuickBooks
  Desktop sync (most competitors dropped Desktop support entirely).

**Minerva's equivalent functions:** `auto-assign-technician` (proximity-
based dispatch, event-driven not a visual board), `draft-quote` (AI line-
item estimator, not a pricebook), `send-job-assignment-sms`,
`send-quote-sms`, `send-invoice-sms`, `calendar-feed`, `xero-sync-invoice`/
`xero-oauth-connect`/`xero-oauth-callback` (Xero, not QuickBooks Desktop),
`create-checkout-session`/`create-billing-portal-session`/
`reconcile-billing`/`sync-technician-billing`.

**CORRECTION (2026-09-12):** this section originally claimed Minerva has
"nothing like Jobber's Client Hub." That was wrong — I hadn't actually
read the relevant files before writing it. Minerva already has both
`ClientHistoryView.jsx` (a persistent client portal at `/client/:token`,
opaque per-business+client-phone token via `client_portal_links`, showing
full job + invoice history) and `TrackingView.jsx` (a live real-time
Mapbox ETA-tracking page with a job-complete/rebooking screen linking
into the same client history view) — both built in an earlier session
("round-2 batch, 2026-09-04"), well before this document was written.

**Honest gap, corrected:** Minerva has no visual drag-and-drop dispatch
board (it's all backend auto-assignment + SMS) and no pricebook
(draft-quote free-forms an estimate via Claude instead of pulling from a
priced catalogue of tasks/materials). The Client Hub / self-serve portal
gap does NOT exist — it's already built and reasonably comparable in
spirit to Jobber's Client Hub (persistent history + live tracking),
though without Jobber's in-portal quote-approval or payment/tipping flow.

**What copying the best idea here would actually look like:** the
remaining real gap is in-portal actions — letting a client approve a
quote or pay an invoice directly from `ClientHistoryView`/`TrackingView`
instead of via a separate SMS-linked Stripe checkout — not a portal from
scratch.

---

## 2. Fleet / Asset Tracking & Telematics — Samsara, Verizon Connect, Geotab, Motive

**What the leaders do well:**
- Samsara: AI dashcams doing real-time in-cab coaching (distracted
  driving, drowsiness, tailgating) before a collision, not just after.
- Verizon Connect: driver scorecards gamifying harsh-braking/cornering
  coaching; route optimization aware of vehicle size/load and restricted
  roads.
- Geotab: **open platform** — 250+ third-party Marketplace integrations,
  the defining differentiator vs. closed competitor ecosystems.
- Motive: **DRIVE Safety Score** — a weighted risk score blending driver
  behavior, road conditions, vehicle type, weather; used to flag the
  highest-risk drivers proactively.

**Minerva's equivalent functions:** `detect-wasted-trips` (15-min GPS
sweep), `optimize-industrial-routes` (30-min sweep, industrial sector),
`monitor-asset-telemetry`, `detect-idle-assets`, `predict-asset-maintenance`,
`track-consumables`, `estimate-job-carbon`, `update-technician-workload`
(burnout/fair-rotation, not safety scoring).

**Honest gap:** Minerva has real-time-ish GPS and predictive maintenance
(genuinely comparable in spirit to Geotab's diagnostics + Motive's
maintenance features), but nothing resembling a driver safety/risk score,
no dashcam/vision layer (not remotely in scope — that's hardware Minerva
doesn't build), and no Geotab-style open marketplace of third-party
integrations. `update-technician-workload`'s burnout guard is actually a
genuinely different (HR-flavored, not fleet-flavored) idea that none of
Samsara/Verizon/Geotab/Motive have — worth noting as a place Minerva does
something the leaders *don't*, rather than only gaps.

**UPDATE (2026-09-12):** `update-technician-workload` computed
`rolling_week_hours` (fatigue) for a while but `auto-assign-technician`
never actually used it in scoring — only `rolling_emergency_job_count`
fed the dispatch tiebreak. Fixed: dispatch now also applies a soft
distance penalty for hours worked beyond a 40hr/week baseline
(`FATIGUE_TIEBREAK_KM_PER_HOUR`), same non-exclusionary tiebreak pattern
as the emergency-count penalty. This closes the "fatigue signal computed
but unused" gap, though it's still not a full Motive-style weighted risk
score (no harsh-braking/behavioral signal exists in this build).

**What copying the best idea here would actually look like:** a
lightweight "technician risk/reliability score" derived from data Minerva
already has (late arrivals, missed checklist verifications from
`verify-checklist-photos`, and now fatigue) — a Motive-DRIVE-Score
analogue built from existing signals rather than new hardware. Fatigue is
now one input to dispatch; a fuller composite score is still unbuilt.

---

## 3. Outbound Lead Generation / Sales Engagement — Apollo, ZoomInfo, Outreach.io, Salesloft, Clay

**What the leaders do well:**
- Apollo: contact database + sequencing in one SKU, AI email writer,
  intent signals layered onto search filters.
- ZoomInfo: intent engine from IP-to-org + keyword signals; Chorus call-
  intelligence; GTM Context Graph fusing intent+CRM+conversation data.
- Outreach.io: multi-channel branching sequences; **Kaia** live in-call
  coaching + auto-updating CRM fields from call transcripts.
- Salesloft: **Rhythm** — re-ranks each rep's daily task list by live
  buyer signals, split into pipeline-gen vs. close-stage focus zones.
- Clay: **waterfall enrichment** across 150+ providers; **Claygent**, an
  AI research agent that pulls unstructured web data per-row on a prompt.

**Minerva's equivalent functions (for Minerva's OWN client acquisition,
not a feature Minerva sells to customers):** `harvest-industrial-leads`
("Signal"), `enrich-industrial-leads` ("Enrich"), `draft-outreach-batch`,
`send-outreach-batch`, `followup-outreach`, `parse-prospect-text`,
`generate-roi-proposal`.

**Honest gap:** this is the category Minerva's own outreach engine most
directly mirrors — and it's a real, working, if much smaller-scale,
analogue of the Apollo/Clay pattern: `parse-prospect-text` is a crude,
manual-paste version of Clay's Claygent (no autonomous web crawling —
explicitly documented as a deliberate honesty boundary, not a missing
feature), `draft-outreach-batch`+`followup-outreach` is a single-channel
(email-only), much simpler version of Outreach/Salesloft's multi-channel
branching sequences, and there is no lead-scoring or intent-signal layer
at all (every prospect is treated equally, no ZoomInfo/Apollo-style
prioritization).

**What copying the best idea here would actually look like:** a simple
scoring field on `outreach_prospects` (e.g. "fleet size confirmed" +
"decision-maker named" + "responded to prior contact" as weighted signals)
so the admin console can sort by likely-to-convert instead of by
`next_action_date` alone — a lightweight Rhythm/lead-scoring analogue
using data Minerva already collects, not a new data source.

---

## 4. HR / Workforce Management — Deel, Gusto, BambooHR, Rippling

**What the leaders do well:**
- Deel: EOR in 130+ countries, standardized fast onboarding, compliance
  monitoring tied to worker classification.
- Gusto: automated payroll tax filing, auto-reroute of failed direct
  deposits, time-tracking auto-synced to payroll/PTO.
- BambooHR: native ATS + job board integrations, org chart, custom
  PTO policies by location/department.
- Rippling: **unified employee database as system of record** across
  HR/IT/Finance — the architectural differentiator that lets automations
  know "who has what device, what team, still employed" in one place.

**Minerva's equivalent functions:** `check-credential-expiry` (licence/
ticket expiry — a real, direct analogue of BambooHR/Deel's compliance-
document tracking, scoped to trade credentials specifically),
`update-technician-workload` (burnout/fair-rotation — genuinely closer to
an HR wellbeing feature than a fleet feature), `send-setup-sms`
(onboarding), `agent-council-report`/`test-agent-health` (internal
ops-health, not HR, but structurally similar to an "employee/system
directory" concept).

**Honest gap:** Minerva has no payroll, no PTO/leave tracking, no ATS,
and nothing like Rippling's unified employee-record architecture spanning
HR/IT/Finance — this is explicitly out of scope for what Minerva is (a
GPS/compliance/dispatch tool for trade businesses, not an HR platform),
so this is the category with the least realistic overlap. The one
genuinely well-matched idea already present is `check-credential-expiry`,
which is Minerva's version of exactly what Deel/BambooHR do for
compliance documents, just scoped to trade licences instead of visas/
work-permits.

**What copying the best idea here would actually look like:** nothing
urgent — HR/payroll is a different product category, and expanding into
it would be scope creep away from Minerva's actual pitch (GPS +
compliance for trade fleets), not a natural extension.

---

## 5. Compliance / Safety Inspection — SafetyCulture (iAuditor), Procore

**What the leaders do well:**
- SafetyCulture: huge pre-built template library, AI-suggested checklist
  generation from a text prompt, offline mobile inspections with photo/
  video evidence, corrective-action assignment straight from a flagged
  item.
- Procore: incident logging with witness statements/photos and auto-PM
  notification; full timestamped audit trail explicitly positioned as
  OSHA due-diligence documentation.

**Minerva's equivalent functions:** `verify-checklist-photos` ("Watchtower"
— AI vision review of uploaded checklist photos), `verify-industrial-
compliance` ("Sentry" — industrial sector's equivalent),
`detect-safety-hazards` ("The Warden" — checks human+automated-process
pairing on active sites), `package-client-verification` ("The Closer" —
assembles telemetry/checkin/safety evidence into a client-facing sign-off
summary).

**Honest gap — this is Minerva's strongest, closest match to a category
leader.** `verify-checklist-photos` using Claude's vision to review
photos is a genuine, real analogue of SafetyCulture's AI-assisted
inspection layer, and `package-client-verification` assembling a full
evidence trail for client sign-off is directly comparable in spirit to
Procore's audit-trail/due-diligence positioning. The gap: no pre-built
template library (every checklist is presumably bespoke per business, not
selected from 100,000+ ready-made templates), and no explicit corrective-
action *workflow* (assign, due-date, track-to-close) — `detect-safety-
hazards` flags a hazard but the actual doc set doesn't show a structured
"corrective action ticket" object the way Procore's Observations tool has.

**BUILT (2026-09-12):** a `corrective_actions` table now exists
(`supabase_schema_delta_corrective_actions.sql`) with assignee/due-date/
status/closed-at. Both `detect-safety-hazards` (source_type=
'safety_incident') and `verify-checklist-photos` (source_type=
'checklist_photo') now create a linked row whenever they flag something,
referencing the source by (source_type, source_id). This closes the gap
described below — pending: a UI surface in `IndustrialDispatcherView.jsx`
(safety tab) and `DispatcherView.jsx` (flagged-photo view) to actually
assign/due-date/close these tickets, not yet built.

**What copying the best idea here would actually look like:** a
corrective-action record type (linked to whatever `detect-safety-hazards`
or `verify-checklist-photos` flags) with assignee + due date + closed-at,
so a flagged issue becomes a trackable object instead of just a Slack
alert — the single most valuable, closest-to-existing-architecture
addition in this whole document. (Now built at the data layer — see
UPDATE above; UI still pending.)

---

## 6. Customer Review / Reputation Management — Podium, Birdeye

**What the leaders do well:**
- Podium: webchat-to-SMS handoff, automated post-transaction review
  requests, unified inbox across channels, multi-location rollup
  reporting.
- Birdeye: aggregates 200+ review sites into one dashboard, AI-generated
  on-brand review responses at scale, competitor benchmarking.

**Minerva's equivalent functions:** `send-review-request-sms`,
`track-review-click`, `send-referral-code-sms`.

**Honest gap:** Minerva's review flow is a single SMS-triggered request +
click-tracking — real, but a small fraction of what Podium/Birdeye do.
No aggregation across review platforms, no AI-generated response
drafting, no multi-location dashboard (irrelevant at Minerva's current
single-location-per-business scale, but would matter if a Ken-Hall-scale
multi-branch client signed on), no competitor benchmarking.

**What copying the best idea here would actually look like:** nothing
urgent given Minerva's current customer size — Podium/Birdeye's depth
here is built for businesses managing reputation across many public
review sites at scale, which isn't the immediate problem for a 3-30-
technician trade business. Lowest-priority category to expand.

---

## Overall honest summary

**CORRECTION (2026-09-12):** the original version of this table claimed
Minerva lacked a client self-serve portal and listed it as the top
priority to build. That was false — `ClientHistoryView.jsx` and
`TrackingView.jsx` already implement it (built 2026-09-04, before this
document existed). Table and priority list corrected below.

| Category | Best-matched existing function | Where Minerva is thin | Worth building next? |
|---|---|---|---|
| FSM | `auto-assign-technician`, `draft-quote`, `ClientHistoryView`/`TrackingView` | No pricebook, no in-portal quote-approval/payment | Medium — in-portal actions, not a new portal |
| Fleet/asset tracking | `predict-asset-maintenance`, `monitor-asset-telemetry`, fatigue tiebreak (built) | No full composite risk/safety score | Medium — data exists, partly scored now |
| Outbound lead-gen | `draft-outreach-batch`, `parse-prospect-text` | No lead scoring/prioritization | Medium — cheap to add |
| HR/workforce | `check-credential-expiry` | Everything else (by design — out of scope) | No — not Minerva's product |
| Compliance/safety | `verify-checklist-photos`, `package-client-verification`, `corrective_actions` (built) | UI to assign/due-date/close tickets | **Yes — data layer done, UI next** |
| Reputation management | `send-review-request-sms` | Aggregation, AI responses, benchmarking | No — premature at current scale |

**Built this session (2026-09-12):**
1. **Corrective-action record** (`corrective_actions` table + linked
   inserts from `detect-safety-hazards` and `verify-checklist-photos`) —
   done at the data layer.
2. **Fatigue-aware dispatch** — `auto-assign-technician` now applies a
   soft tiebreak penalty for technicians working beyond a 40hr/week
   baseline, using the previously-unused `rolling_week_hours` signal.

**Still open, in priority order:**
1. Corrective-action **UI** — surface `corrective_actions` in
   `IndustrialDispatcherView.jsx`'s safety tab and `DispatcherView.jsx`'s
   flagged-photo view so a dispatcher can actually assign/due-date/close
   a ticket, not just see that one exists in the database.
2. In-portal quote-approval/payment inside `ClientHistoryView`/
   `TrackingView`, closing the remaining gap vs. Jobber's Client Hub
   (the portal itself already exists, this is about admin actions).
