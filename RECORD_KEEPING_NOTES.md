# Minerva — Record Keeping Notes

Started 2026-10-10, same spirit as `SECURITY_NOTES.md` / `BILLING_INTEGRITY_NOTES.md`
/ `SCALE_READINESS_NOTES.md` / `OUTREACH_INTEGRITY_NOTES.md` — a dated, honest
record of what's been checked, fixed, and deliberately deferred, specifically
around the `audit_log` ("Records" tab in both dispatcher consoles) actually
capturing what a business owner would reasonably expect it to. Prompted by a
direct question about "tracking and record keeping" across the whole product.

## Fixed 2026-10-10

- **`DispatcherView.jsx`'s `addCrewMember`/`removeCrewMember` logged
  nothing**, despite sitting immediately next to `assignJob` (which does)
  and being just as consequential — who was actually on a job matters for
  payroll and disputes. Found by listing every `async function` in the
  file and cross-checking which ones sit near a `logAudit(...)` call.
  Fixed with new `crew.added`/`crew.removed` actions, matching
  `job.assigned`'s detail shape (client name + technician name).
- **`voidInvoice` never actually logged anything — despite its own prompt
  text literally telling the dispatcher otherwise.** The prompt asks
  "Why is this invoice being voided? (**shown in the audit trail**, ...)"
  — a direct, specific, written promise about where that reason goes.
  `logAudit` was never called here at all. The reason was still saved on
  the invoice row itself (`voided_reason`), so the data wasn't lost, but
  it never reached the Records tab the UI's own copy promised it would.
  This is the same "sold vs delivered" bug class found repeatedly
  elsewhere this session, just applied to a UI promise instead of a
  marketed product capability. Fixed with a new `invoice.voided` action.
- **`enableMaxAddon`/`disableMaxAddon`/`startMaxAddonTrial` — the one
  action in this entire file with a direct Stripe charge attached to it
  — logged nothing.** `business.settings_updated` and `invoice.paid` are
  both logged; a business owner adding/removing a recurring $19-59/mo
  charge on themselves is at least as audit-worthy as either. Fixed with
  new `addon.enabled`/`addon.disabled`/`addon.trial_started` actions.

All three fixes: matching `describeAuditEntry` cases added in
`src/utils.js` so they render as readable sentences instead of falling
through to the raw action-string default, plus tests for every new case.
740/740 tests pass. `DispatcherView.jsx` re-verified with `npx esbuild`.

## Checked and found already correct

- `deactivateTech` — initially looked like a gap by name alone, but
  already calls `logAudit('technician.removed', ...)`. Caught before
  "fixing" something that wasn't broken by reading the function body
  first rather than trusting the name list.
- `addSubcontractor`/`removeSubcontractor` — already logged.
- `IndustrialDispatcherView.jsx`'s core CRUD (`lead.added`, `site.added`,
  `asset.added`, `item.added`, `incident.reported`,
  `ingestion_key.regenerated`, `business.settings_updated`) — already
  covered from this console's own earlier build-out.
- `AdminConsole.jsx` has no audit-logging convention anywhere in the
  file at all — confirmed by grep before assuming the outreach
  "Mark replied"/"Mark won" tool (built earlier this session) was
  missing something. It isn't a gap; `audit_log` is scoped to a single
  `business_id` for a business owner's own review, and AdminConsole
  operates across businesses as the operator, a genuinely different
  context with no established convention to be inconsistent with.

## Fixed 2026-10-18

The "probably worth it" tier below (then unfixed) was resolved in full —
3 genuinely fixed, 1 found already done:

- **`approveDraft` / `rejectDraft` / `approveWeatherDraft`** — new
  `marketing_draft.approved`/`marketing_draft.rejected`/
  `weather_draft.approved` actions, logged right after the real send (or
  real status flip) succeeds, same placement convention as `job.assigned`.
  `rejectDraft` only logs on the branch where its own `.eq('status',
  'pending')` guard actually matched a row — not on the "already actioned
  elsewhere" branch, consistent with that function's existing concurrency
  guard (see its own 2026-09-29 comment).
- **`assignAsset` / `setAssetStatus`** — new `asset.assigned`/
  `asset.unassigned`/`asset.status_changed` actions.
- **`syncInvoiceToXero`** — new `invoice.synced_to_xero` action.
- **`addWorkflow` / `removeWorkflow`** — turned out to be a stale catalog
  entry, not a real gap: both already call `onLogAudit?.('workflow.added'
  / 'workflow.removed', ...)` with matching `describeAuditEntry` cases
  already in `src/utils.js`. Caught by reading the actual function bodies
  before editing instead of trusting this file's own "not yet fixed"
  listing — moved to "Checked and found already correct" below. Worth
  the reminder: this file is a point-in-time record, not live state,
  same as any other memory/notes doc in this project.

All new cases have matching `describeAuditEntry` entries + tests.
744/744 tests pass (test count unchanged — new assertions landed inside
an existing `it()` block, not new ones). `DispatcherView.jsx`/`utils.js`
re-verified with `npx esbuild`. No SQL delta, ships with `DispatcherView.jsx`'s
next normal deploy (static frontend, no function redeploy either).

**Left deliberately asymmetric, worth a future look:** `rejectDraft` is
now logged but its weather-side equivalent, `dismissWeatherDraft`, isn't
— that asymmetry already existed in the original catalog (only
`rejectDraft` was listed as "probably worth it", not `dismissWeatherDraft`)
and wasn't this pass's call to resolve either way, so it was left alone
rather than unilaterally extending scope beyond what was catalogued.

## Found, deliberately not fixed yet — needs a scope decision, not a quick patch

A full sweep of every `async function` in `DispatcherView.jsx` found 14
more mutating actions with zero `logAudit` coverage. Unlike the ones
fixed above, none of these have the same "the UI explicitly promises
this" or "real money changes hands" clarity — deciding which deserve a
permanent audit-trail entry is a real product-scope call (how much
granularity does the Records tab need to stay useful rather than
noisy), not a bug fix, so none were added unilaterally.

**Lower priority — routine CRM/profile edits, closer to "normal
business operation" than "needs a dispute trail":**
- `markLeadStatus`, `convertLeadToJob`, `assignLead` (lead pipeline
  management)
- `updateInventoryQty` (routine stock-level correction)
- `updateTechSkills` (routine profile tag edit)
- `resendReferralSms` (re-sending an already-sent message, not a new
  action)

If this list gets acted on, the pattern to follow is already
established and consistent across every fix above and every existing
entry: one `logAudit('domain.verb', { entityType, entityId, details })`
call right after the write succeeds, one matching `case` in
`describeAuditEntry` (`src/utils.js`), and matching tests in
`src/utils.test.js`'s existing `describeAuditEntry` block.

## Fixed 2026-10-23

Acted on the list above, re-enumerated rather than trusted at face value
— the 6 "lower priority" items were named explicitly and left alone
exactly as scoped (deliberately not re-litigated: `markLeadStatus`,
`convertLeadToJob`, `assignLead`, `updateInventoryQty`, `updateTechSkills`,
`resendReferralSms` stay unlogged). The original "14" count wasn't
re-derived exactly — this pass's own sweep, applying the same
money/consequential-state-or-explicit-UI-promise test, surfaced 10
distinct gaps worth fixing rather than the 8 the arithmetic implied;
worth the honesty rather than forcing a match to a number from a prior,
less-documented sweep.

- **`addIncident` (trade sector's own safety-incident reporting, writes
  `technician_incidents`) had no logging at all**, despite the
  industrial-sector equivalent (`incident.reported`, used by
  `IndustrialDispatcherView.jsx`) already existing. Reused the same
  action name rather than inventing a parallel one — `audit_log` is
  always scoped to a single business, which is either trade or
  industrial, never both, so there's no cross-sector collision risk.
  Extended the existing `describeAuditEntry` case to also show a trade
  incident's `category` (industrial incidents carry `severity` instead)
  and an optional `client_name` — backward compatible, both existing
  tests for this case still pass unchanged.
- **`assignCorrectiveAction` / `closeCorrectiveAction`** (safety-incident
  follow-up tickets — who's fixing it, and confirmation it's actually
  resolved) — new `corrective_action.assigned`/`.unassigned`/`.closed`
  actions. `setCorrectiveActionDueDate` left alone — a due-date tweak is
  closer to the routine-edit tier already deferred above than to
  assignment or closure.
- **`toggleAgentFunction`** (the platform automation kill-switch in the
  Agent Ops tab) — logged nothing despite being exactly as consequential
  as `addon.enabled`/`addon.disabled` (an owner turning off real
  automated customer communication, not a cosmetic toggle). New
  `agent_function.enabled`/`.disabled` actions.
- **`dismissWeatherDraft`** — the specific asymmetry the 2026-10-18 entry
  flagged as "worth a future look" (its sibling `rejectDraft` was already
  logged). New `weather_draft.dismissed` action, same claim-scoped-to-
  'pending' placement as `rejectDraft`'s own fix.
- **`markCompliancePackageSent`** — its own UI is a `prompt()` literally
  asking "Who was this sent to?" for a compliance/safety handoff record;
  same "explicit UI promise" shape as `voidInvoice`'s fix on 2026-10-10,
  just a prompt instead of static copy. New `compliance_package.sent`
  action, with the prompt's answer as the logged detail.
- **`optimizeTechRoute`** — the single-technician route optimizer had no
  logging while its fleet-wide sibling (`optimizeFleetDay` →
  `fleet.optimized`) already did. New `route.optimized` action.
- **`AddTechnicianModal` / `AddAssetModal` / `AddInventoryItemModal`**
  (the 3 "Add X" modals reachable from the dispatcher's own + buttons) —
  all 3 insert real rows (`technicians`, `assets`, `inventory_items`)
  with zero logging and no `onSaved`/`onLogAudit` prop even wired up,
  unlike their sibling `AddCredentialModal` (already logged via
  `onSaved`). Creating a technician in particular is consequential —
  they get billed once their phone connects. Wired the same `onSaved?.()`
  callback pattern `AddCredentialModal` already established: each modal
  now reports back what it created, the parent logs it. New
  `technician.added` action; `asset.added`/`item.added` already existed
  (reused from the industrial-sector build-out, same backward-compatible
  reuse as `incident.reported` above) — no new `describeAuditEntry` case
  needed for those two.

**Left alone, deliberately, beyond the already-deferred 6:**
- `dismissNudge` (dismissing a usage-triggered upsell suggestion) — not
  money, not dispute-relevant, closer to a UI preference than a record.
- `generateCompliancePackage` (the generation step) — the package's
  existence isn't itself a disputable event; its `sent_at`/`sent_to` is
  (now logged via `markCompliancePackageSent` above).
- `markLeadDuplicate`, `updateLeadPipelineStage`, `updateLeadDealValue`,
  `updateLeadNextAction`, `toggleLeadActivity`, `logLeadActivity` — all
  lead-pipeline management, the same bucket as the 3 lead actions already
  explicitly deferred (`markLeadStatus`/`convertLeadToJob`/`assignLead`).
  Not re-litigated — that classification was already made deliberately.
- `resendTechSMS` — re-sending an already-sent setup text, same
  "re-send, not a new action" reasoning already applied to
  `resendReferralSms`.
- `generatePayrollHours` — read-only (computes rows for on-screen
  display); `savePayrollRun`, the function that actually persists a
  payroll run, was already logged on 2026-10-10.

797/797 tests pass (0 new — every new assertion landed inside the
existing `describeAuditEntry` `it()` block, same test-count-unchanged
shape as the 2026-10-18 entry). `DispatcherView.jsx`/`utils.js`
re-verified with `npx esbuild`. No SQL delta — `audit_log` already
accepts any `action` string; ships with `DispatcherView.jsx`'s/
`utils.js`'s next normal deploy (static frontend, no function redeploy).
