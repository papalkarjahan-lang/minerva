# Outreach pipeline integrity notes

Same convention as `SECURITY_NOTES.md` / `BILLING_INTEGRITY_NOTES.md` /
`SCALE_READINESS_NOTES.md` — a dated, append-only log of what was found
and fixed in Minerva's own client-acquisition pipeline
(`outreach_prospects`, `parse-prospect-text`, `draft-outreach-batch`,
`followup-outreach`, `send-outreach-batch`, `outreach-unsubscribe`, the
Outreach tab in `AdminConsole.jsx`). Not the client-facing Growth
pillar (`leads`, `marketing_drafts`, `generate-growth-drafts` — a
Minerva *customer's* own re-engagement tool) and not the industrial
Growth feature (`industrial_leads`) — both of those are product
features for paying customers, not this. See `CUSTOMER_ACQUISITION_PLAN.md`
for why those are explicitly two different things sharing similar names.

## 2026-10-10 — full pipeline audit ahead of real campaign volume

Triggered by finishing the subscription-billing-lifecycle work and
turning to the next phase of the plan this project is being built
toward: real outreach sending. Commissioned a full read-only trace of
the pipeline end to end (every function, the human-approval gate, the
data model/lifecycle, and the same bug classes already found repeatedly
in billing — sold-vs-delivered copy, forgeable gates, missing
notifications) before any real email goes out. Full findings and fixes
below; the audit itself also *confirmed* several things as already
correct, listed at the bottom so they aren't re-checked needlessly
later.

### Fixed: trade/industrial content mismatch in automated drafting

`draft-outreach-batch`'s `REAL_FEATURES` constant (fed to the Claude
prompt) and its non-AI fallback template (`logic.ts`'s
`fallbackTemplate`) both quoted the same thing to every prospect
regardless of `trade_type`, including the $119/tech/mo Pro-tier ceiling
and one-click Xero sync to `'industrial'` prospects — Pro isn't offered
for Industrial (`isTierAvailableForSector`, established 2026-10-08) and
`xero_sync` is a trade-only Minerva Max add-on
(`isAddonAvailableForSector`, established 2026-10-09). The
"(Industrial tier)" label on the old safety/credential-tracking bullet
also conflated two different real things under one wrong label:
trade-Pro's compliance checklists/technician credential tracking
(`checklist_templates`/`technician_credentials`, never reachable by an
industrial business) with industrial's own, genuinely separate safety
incident log (`safety_incidents`). Same sold-vs-delivered bug class
found four times already in billing this session, this time reached
through outreach copy instead of the product itself.

Fix: split `REAL_FEATURES` into `REAL_FEATURES_TRADE` /
`REAL_FEATURES_INDUSTRIAL`, selected by `p.trade_type`, each describing
only genuinely-reachable capability and the correct price ceiling for
that sector (Pro excluded from the industrial list entirely). Same
split applied to `fallbackTemplate`. 4 new tests on the fallback
template's sector branching (`logic.test.ts`). Commit:
"Fix trade/industrial content mismatch in automated outreach drafting".

**Follow-up, caught 2026-10-10 re-reading my own earlier work:** the
original audit flagged this exact bug in *two* places —
`draft-outreach-batch` (fixed same day, above) and
`src/pages/ProposalView.jsx`'s disclaimer paragraph on the public
`/proposal/:id` ROI page, which unconditionally told every viewer
"(on the Industrial tier) safety/compliance incident logging and
technician credential tracking" — the identical conflation of
trade-Pro's credential tracking with industrial's own safety log,
shown to 100% of viewers regardless of `proposal.trade_type`. Only the
first ever actually got fixed at the time; the second sat unactioned
for a full day despite being flagged in the same report. Fixed now:
the disclaimer branches on `proposal.trade_type?.toLowerCase() === 'industrial'`
(case-insensitive — `outreach_prospects.trade_type` is free text, not
an enum, so an operator-typed CSV value like "Industrial" needs to
still match). Worth remembering generally: a multi-finding report
needs every finding individually checked off against the commit log,
not just the ones that happened to get fixed in the moment — "I fixed
the thing this report was about" isn't the same claim as "I fixed
everything this report found."

### Fixed: unsubscribe was keyed to a database row, not an email address

`outreach_prospects` had no uniqueness constraint on `contact_email` —
re-importing the same business from a second CSV, or re-running the
AI-paste extraction over text covering someone already in the table,
silently created a second, fully independent row with its own id and
its own `unsubscribed_at`. `outreach-unsubscribe`'s self-service link is
keyed to the *one row id* a specific email was sent from
(`?id=<outreach_prospects.id>`), so a real person clicking "unsubscribe"
only silenced that one row — any duplicate sibling stayed fully eligible
to be drafted, approved, and sent to the same person again. The Spam Act
2003 (Cth) opt-out requirement this function exists for doesn't
meaningfully tolerate that gap; `AdminConsole.jsx`'s own manual "Mark
unsubscribed" tool already did the right thing here (an `ILIKE` match
across every row with that email, no row limit) — the self-service link
was the weaker of the two paths.

Two-part fix:
1. `outreach-unsubscribe/index.ts` now sweeps every other row sharing
   the clicked row's `contact_email` (case-insensitive `ILIKE`) in
   addition to the row the link was keyed to, matching the admin tool's
   already-correct behavior exactly.
2. New unique index (`supabase_schema_delta_outreach_prospects_dedup.sql`,
   not yet applied live) on `contact_email` (case-sensitive — see that
   file's own header for why case-insensitive wasn't worth the added
   upsert complexity, given the unsubscribe sweep above is the layer
   that actually has to be case-insensitive for compliance, and is).
   Both insert sites — `AdminConsole.jsx`'s `importCsv()` and
   `parse-prospect-text/index.ts` — switched from a plain `.insert()` to
   `.upsert(rows, { onConflict: 'contact_email', ignoreDuplicates: true })`,
   so a batch that happens to include an already-known email skips just
   that row instead of failing the whole import (a plain insert would
   have done the latter the moment the constraint existed). Both now
   report a "N already on the list, skipped" count back to the operator
   rather than silently dropping rows.


### Fixed: the approve-to-send action had no server-side status guard

`approveProspect`/`approveSelected` (`AdminConsole.jsx`) wrote
`status: 'approved'` with no `.eq('status', 'drafted')` guard at the
write itself — the UI only *rendered* the approve button for a drafted,
non-dirty card, and `outreach_prospects.status` has no DB-level
check constraint, so that UI condition was the only thing standing
between "a human reviewed real content" and `send-outreach-batch`
picking a row up on its next "Send approved" click.
`send-outreach-batch` itself already independently re-checks
`status='approved'` server-side (hardened 2026-09-24, per
`SECURITY_NOTES.md`) — this was the one remaining write in the pipeline
that hadn't gotten the same treatment. Not an externally-reachable
bypass (still requires a genuine `admin_users`-authenticated action),
but inconsistent with how every other state transition in this specific
pipeline is guarded, and a stale-id click or a future UI bug could have
flipped a `new` (never-drafted, empty body) or `closed_lost` row
straight to `approved`.

Fix: both `approveProspect` and `approveSelected` now add
`.eq('status', 'drafted')` to their UPDATE, matching
`send-outreach-batch`'s already-correct pattern.

### Fixed: the "never contact someone who unsubscribed" rule existed only as unlinked, untested copies

All three functions that touch a prospect (`draft-outreach-batch`,
`followup-outreach`, `send-outreach-batch`) correctly filter
`.is('unsubscribed_at', null)` at the query level — but each one did it
as its own inline copy, with nothing testing any of them and nothing
stopping a future edit from accidentally dropping the filter from one.

Fix: new `_shared/outreachEligibility.ts`
(`isOutreachEligible(prospect)`, 4 tests), applied as a second,
in-memory filter on the fetched result in all three functions, on top
of the existing query-level filter (which stays — it's still the more
efficient check, no point fetching rows about to be discarded). A
regression in the query itself still can't reach an unsubscribed
prospect now, because the second layer is independently tested and
doesn't depend on the query being correct.

### Fixed: a real reply or a real conversion had no way to be recorded

`outreach_prospects.replied_at` is read by `followup-outreach`
(`.is('replied_at', null)` — correctly stops the follow-up cycle once
set) and `status='replied'`/`'closed_won'` are both displayed in the
Outreach tab's own summary counter — but nothing in the codebase ever
wrote either one. There's no inbound-email-reply-parsing webhook (a
much larger feature, correctly out of scope here), and there was also
no manual control to record one, unlike the existing "Mark
unsubscribed" tool. Net effect: a prospect that genuinely replied kept
being drafted follow-ups indefinitely (up to the existing 3-stage cap,
then `closed_lost` — treating a real responder the same as someone who
never answered), and the "closed won" counter read 0 regardless of
real conversions, directly undermining the ability to track first
customers from this exact campaign.

Fix: new "Record a reply or a win" tool in the Outreach tab, mirroring
"Mark unsubscribed"'s exact pattern (operator enters the email they
personally saw reply/convert, picks "Mark replied" or "Mark won
(signed up)"). Sets `replied_at` (stops the follow-up cycle via that
filter) and `status` to `'replied'` or `'closed_won'` together — the
status change also independently stops the follow-up cycle via
`followup-outreach`'s own `status='sent'` filter, belt-and-suspenders
with the `replied_at` check, same reasoning as the eligibility-filter
fix above. Realistic and sufficient at this stage: no paying customers
yet, so real reply/conversion volume is low enough an operator will
actually see each one, the same assumption the existing unsubscribe
tool already relies on.

## Checked and confirmed correct (no action needed)

- **Approval-before-send cannot be bypassed externally.** Every status
  transition that matters requires a genuine `admin_users`-authenticated
  caller (RLS on direct writes, `isAdminCaller` on the edge functions);
  no cron ever calls `send-outreach-batch`; that function independently
  re-enforces `status='approved'` server-side regardless of what the
  admin console sent.
- **Every optional secret degrades gracefully.** `ANTHROPIC_API_KEY`
  unset → plain-template fallback, not an error; `RESEND_API_KEY` unset
  → `send-outreach-batch` reverts the row to `approved` instead of
  losing it; `RESEND_FROM_EMAIL` unset → falls back to Resend's shared
  test domain (not a crash, but see `DEPLOYMENT_CHECKLIST_PENDING.md` /
  the Go-Live checklist artifact — worth a verified domain before real
  volume, already tracked there, not new).
- **The `agent_functions` kill-switch covering this pipeline is already
  admin-gated** (`rls_scoping_v2.sql`) — re-verified, not re-flagged.
- **`charge.dispute.*`/`charge.refunded` business-vs-operator-notification
  split is correct by design**, not a gap of the same shape as the
  payment-failed/cancellation fixes elsewhere this session — see
  `stripe-webhook/index.ts`'s own comment: those are disputes/refunds
  against Minerva's own Stripe account (invoice payments aren't split
  via Connect), so the operator is correctly the one who needs to act,
  not the business. Unrelated to this file's own pipeline, listed here
  only because it came up while checking for the same notification-gap
  pattern across the whole codebase.
- **2026-10-18, fresh re-read of the actual sending mechanism (not just
  the drafting/dedup side already covered above) — no new issues found.**
  `send-outreach-batch`, `followup-outreach`, and `outreach-unsubscribe`
  read line-by-line against the same bug classes this whole project
  keeps finding elsewhere (missing auth, double-send races, unescaped
  HTML, silent no-ops): admin-auth-gated, atomic claim-before-send,
  `escapeHtml` on every interpolated field, RESEND_API_KEY-unset reverts
  the claim instead of stranding it, email-wide unsubscribe sweep covers
  the dedup gap already closed elsewhere. 30/30 existing tests across
  these three functions still pass. No action taken because none was
  needed — recorded so a future session doesn't re-read the same code
  from scratch assuming it's unverified.
