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
