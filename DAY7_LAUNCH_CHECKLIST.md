# Day 7 launch checklist — one clean pass

Tightened, reordered version of README.md's "Testing checklist (Day 7)".
Run this **after** every item in `ACCOUNT_SETUP_WALKTHROUGH.md` is done
(real Mapbox token, real Twilio number, live-mode Stripe — Anthropic key
optional). Ordered so each section's output feeds the next, instead of
jumping around. Needs two real devices (your phone = "technician", your
laptop = "dispatcher") and, ideally, a third phone or a friend's number to
act as "client" so client-facing SMS links are opened on a device you're
not also using as dispatcher/technician.

Stop and fix before continuing if any box fails — don't skip ahead.

---

## 0. Before you start

- [ ] `.env.local` and Vercel env vars both have the real (not placeholder)
      `VITE_MAPBOX_TOKEN`
- [ ] Vercel shows a successful deploy after the last env var change
- [ ] Supabase secrets (`npx supabase secrets list`) show `TWILIO_PHONE_NUMBER`,
      `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, and the three
      `STRIPE_PRICE_ID_*` vars set (no need to see values, just that they exist —
      note it's `APP_URL`, not `VITE_APP_URL`, for the Supabase secret)

---

## 1. Signup → billing (live mode, real card)

- [ ] Open `/start` → complete onboarding form → Stripe checkout loads
- [ ] Pay with a **real card** (test card no longer works in live mode) —
      pick the Starter plan, cheapest to reverse if something's wrong
- [ ] Success page loads and shows the dispatch link
- [ ] Stripe Dashboard (live mode) → Customers → the new signup appears
      with an active subscription in `trialing` status
- [ ] **Immediately go to Settings → Billing → Manage subscription in the
      app (or ask Stripe support) and cancel/note this test subscription**
      so you're not charged when the 7-day trial ends — do this now, not
      at the end, in case you get distracted later
- [ ] Declined-card path (optional, needs the Stripe CLI — skip if you
      don't have it installed): `stripe trigger invoice.payment_failed`
      against this webhook endpoint → confirm both the operator inbox AND
      this test business's `contact_email` receive a "payment didn't go
      through" email (not just one or the other), this business's Slack
      (if you set one up) gets a matching alert, and the in-app billing
      banner appears on next dispatcher login. Hard to trigger with a
      real card in live mode on purpose, so the CLI trigger is the
      practical way to confirm this path before a real customer ever
      hits it for real.
- [ ] Cancellation path (same CLI prerequisite): `stripe trigger
      customer.subscription.deleted` → confirm the business email,
      business Slack, AND operator email all arrive, worded as a
      self-serve confirmation (no mention of a declined card) — Stripe's
      CLI trigger fires with no `cancellation_details.reason`, which this
      code correctly treats as voluntary. There's no practical way to
      simulate the *involuntary* wording without exhausting a real
      dunning cycle, so take that branch on trust from the code/tests
      rather than trying to force it live.
- [ ] Recovery path (same CLI prerequisite): right after the
      declined-card test above, `stripe trigger invoice.payment_succeeded`
      → confirm a "you're all set" email + Slack alert arrive this time
      (they shouldn't have on any OTHER successful-payment event during
      this checklist — this one only fires because the test business's
      `payment_failed_at` is genuinely set from the step above)

## 2. Dispatcher + technician live tracking

- [ ] Dispatcher → "+ Add" a technician from the sidebar → they receive a
      setup SMS with their unique link (confirms real Twilio number works)
- [ ] Technician opens link on phone → GPS permission prompt → tap Allow
- [ ] Technician dot appears on dispatcher map at the correct location on
      an actual street map (confirms real Mapbox token — a blank grey box
      here means the token or Vercel redeploy didn't take)
- [ ] Walk 10 metres → dot moves on the dispatcher map within 15 seconds,
      no page refresh needed
- [ ] Turn on flight mode on the technician's phone for ~1 minute while
      tracking → an "Offline - X pending" badge appears; turn flight mode
      back off → badge clears and the map catches up with the latest
      position

## 3. Client-facing job flow (tracking → completion)

- [ ] Add a test job with a real address you can walk near as the client
      address
- [ ] Walk within 2km of that address → client SMS arrives with a
      tracking link (use the "client" device/number, not the dispatcher
      or technician one, so you can see exactly what a real client sees)
- [ ] Open the tracking link → technician dot is visible → walk further →
      dot updates
- [ ] On the current job card, tap "Add voice note" (Chrome/Android only)
      → speak a short note → transcribed text appends to the job's notes
- [ ] Technician taps Complete Job → job status updates to "complete" in
      the dispatcher view
- [ ] Client receives a "job complete" SMS right after Complete Job is
      tapped

## 4. Quotes (all tiers)

- [ ] Dispatcher → add a quote with a plain-English job description →
      "Draft with AI" produces line items (or the fixed-template fallback
      if `ANTHROPIC_API_KEY` isn't set yet — both are correct behavior,
      just confirm one of them actually happens, not a silent failure)
- [ ] Tap "Send to client" → client SMS arrives with a quote link
- [ ] Open the quote link (as "client") → Accept or Decline → dispatcher
      view updates to reflect the client's response

## 5. Missed calls + CSV exports (all tiers)

- [ ] Call the business's real Twilio number and let it go unanswered →
      caller receives the "missed you" auto-reply SMS (confirms the Voice
      webhook from `ACCOUNT_SETUP_WALKTHROUGH.md` step 8 is wired up)
- [ ] Jobs tab / Leads tab → Export CSV → files download with correct data

## 6. Lead intake widget (all tiers)

- [ ] Open `/intake/:businessId` (the business's real ID) → send a message
      describing a plausible job → assistant replies (AI free-text if the
      Anthropic key is live, fixed five-question template if not — either
      is correct, just confirm it responds)
- [ ] Finish the conversation → dispatcher's Leads tab shows the new lead,
      scored by urgency
- [ ] Dispatcher phone/Slack (if configured) receives a notification for
      the new lead

## 7. Dispute pack (all tiers, uses the job you just completed)

- [ ] Dispatcher → Recently Completed → open the completed job's dispute
      pack link → GPS route, checklist photos (if any), materials, and
      invoice for that one job all display correctly on `/dispute/:jobId`

## 8. Pro tier only (sign up a second test business on the Pro plan)

- [ ] Dispatcher → set up a completion checklist → add 2-3 items → save
- [ ] Technician → complete a job → checklist appears → "Continue" is
      disabled until every item is ticked
- [ ] Technician → after the checklist, add an invoice line item → tap
      "Send Invoice" → client receives an SMS with the invoice link
- [ ] Open the invoice link → totals (subtotal, 10% GST, total) are correct
- [ ] Dispatcher → Invoices tab → tap "Mark paid" → status updates
- [ ] Dispatcher → Assets tab → add an asset → assign it to a technician
- [ ] Technician opens their tracking link and starts tracking → Stripe
      Dashboard → Subscriptions → this business's subscription → quantity
      updates to match technician count
- [ ] Dispatcher → set up a technician onboarding checklist → a brand-new
      technician's first "Start Tracking" tap shows the checklist first;
      reopening the link later does NOT show it again
- [ ] Dispatcher → Inventory tab → add an item with a reorder threshold
      above its starting quantity → confirm it's flagged "LOW STOCK"
- [ ] Client-history portal: complete a job, then open the client-history
      link generated from the tracking view's job-complete screen →
      `/client/:token` shows this client's past jobs and invoices
- [ ] **Cross-tenant data isolation (important — this is what this
      session's biggest security fix protects, worth running once with
      real test data before any real customer exists)**: you now have two
      real business ids (this one and section 1's). In the Supabase SQL
      Editor, run the authenticated cross-tenant check at the bottom of
      `supabase_schema_delta_businesses_select_scoping.sql` (grab each
      business's `owner_user_id` from Table Editor first) → confirm it
      returns 0 rows, not the other business's data
- [ ] Cancel/note this second test subscription the same way as step 1

## 9. Standard tier (added 2026-10-09, extended 2026-10-18 — Standard's 7
##    automations are new; test this even if you're not specifically
##    selling Standard, since it also confirms the gate correctly excludes
##    Starter and industrial)

Standard ($79/tech/mo) and Pro both get 7 proactive automations Starter
doesn't: lead nurture, lead win-back, client retention check-ins, invoice
reminders, no-show detection, weather reschedule alerts, and whole-fleet
route optimization — but only for
`sector = 'trade'` businesses (industrial doesn't use the `jobs`/`leads`/
`invoices` tables these read, so it correctly gets none of this on any
tier — that's by design, not a bug, see `_shared/tierEligibility.ts`).
Reuse the Pro test business from section 8 (it qualifies too) or sign up a
third one on Standard, sector left as the trade default.

- [ ] Confirm the test business's `sector` is `trade` and
      `subscription_tier` is `standard` or `pro` (Table Editor → businesses)
- [ ] Create an invoice, confirm its `status` is `unpaid`, then backdate
      `created_at` to 4+ days ago (Table Editor → invoices) → invoke
      `chase-unpaid-invoices` from Supabase Dashboard → Edge Functions →
      "Invoke" → confirm `{"success": true, ...}` and the client receives
      a payment reminder SMS
- [ ] Create a lead, backdate `created_at` 3+ hours → invoke
      `nurture-stale-leads` → confirm a first-touch nurture SMS goes out
      (a second, 24+ hour backdate triggers the follow-up touch instead)
- [ ] Set a lead's `status` to `lost` and backdate `created_at` 15+ days →
      invoke `winback-lost-leads` → confirm a win-back SMS goes out
- [ ] Complete a job, backdate `completed_at` 31+ days, clear
      `retention_sent_at` → invoke `retention-checkin` → confirm the client
      receives a check-in SMS
- [ ] No-show detection: schedule a job for today with a real client
      lat/lng and an assigned technician, then add a `technician_locations`
      row for that `job_id` with `recorded_at` 16+ minutes ago at a point
      more than ~150m from the client → invoke `detect-wasted-trips` →
      confirm the job gets flagged and the client gets a reschedule SMS
- [ ] Weather risk: add the business's trade type to
      `weather_sensitive_trade_types` and schedule tomorrow's job with a
      real client lat/lng → invoke `check-weather-risk` → confirm
      `jobsChecked` includes it (a drafted reschedule only appears if
      tomorrow's forecast is actually risky there — that part depends on
      real weather, not something you can force)
- [ ] Whole-fleet route optimization — **unlike every other Standard-tier
      item above, this one is owner-authenticated (same as the "Optimize
      today's route" button), not a raw cron sweep, so test it through the
      real dispatcher UI, not Dashboard → Edge Functions → Invoke**: get 2
      technicians sharing a real, far-apart `current_lat`/`current_lng`
      (have both open their tracking link from two different real
      locations, or set it directly in Table Editor), then schedule a job
      for today near Technician B's position but assign it to Technician A
      instead — a deliberately wrong assignment. In the dispatcher view,
      click "⚡ Optimize today's whole fleet" → confirm the result message
      reports 1 job reassigned and a non-zero km saved, the job's assigned
      technician is now B not A, and the "~Xkm saved so far" stat appears
      underneath the button. Click the button again immediately → confirm
      it now reports nothing worth changing (already optimal).
- [ ] **Negative test — confirm the gate actually excludes Starter**:
      repeat the chase-unpaid-invoices or retention-checkin case on the
      Starter-tier business from section 1 → confirm it reports scanning/
      sending zero for that business, not an error
- [ ] **Negative test — industrial exclusion is by design**: if you also
      have an industrial test business (section 10) on Standard or Pro,
      confirm the same functions skip it too

## 10. Industrial sector (only if you plan to sell to an industrial client —
##    skip entirely if your first customers are trades/home-services)

- [ ] Sign up a test business, then set its `sector` to `industrial` in
      Supabase (Table Editor → businesses) → dispatcher login now shows
      `/industrial/:businessId` (list-based console) instead of the
      street-map dispatcher view
- [ ] Add a lead, a site, an asset, a consumable/inventory item, and a
      safety incident from their respective tabs → each saves and lists
      correctly
- [ ] Expand an asset → confirm the asset_telemetry_events section loads
      (empty is fine if no telemetry has been sent yet)
- [ ] **Technician site assignment + check-in (added 2026-10-10 — run the
      `supabase_schema_delta_technician_site_assignment.sql` delta first,
      or this entire step will fail RLS silently)**: add a technician to
      this industrial business in Onboarding (or directly in the
      Supabase Table Editor), then from the Sites tab use "+ Assign
      technician..." on the site you created above → the technician's
      name appears as a badge on that site card. Open the technician's
      own `/tech?pin=...` setup link (a different browser/incognito
      window) → confirm a "CURRENT SITE" card appears with the site's
      name and scope of work, NOT an empty screen → tap "Check in" →
      confirm it flips to "Check out" with no error → back in the
      dispatcher, expand "View check-ins ▼" on that site → the check-in
      row appears (HUMAN · arrival). This is the one flow that was
      completely unbuilt before today — confirm it end to end, don't
      just spot-check one side.
- [ ] **Client verification package view (added 2026-10-10 — run the
      `supabase_schema_delta_verification_package_view.sql` delta first)**:
      from the Sites tab, click "Generate verification package" on the
      site you checked into above → switch to the Verification tab → the
      new package appears → click "Copy client link" → paste the copied
      URL into a different browser/incognito window (logged out, no
      session) → confirm the summary, your check-in, and the safety log
      render correctly with no login prompt → back in the dispatcher,
      click "Mark signed off" → confirm the badge updates to "signed
      off" and the public page (refresh it) now shows the signed-off
      timestamp too.

## 11. Autonomous layer (only if you ran the pg_cron setup block)

- [ ] Dispatcher → Settings → paste a Slack webhook URL → save → capture a
      test lead via the intake widget → alert appears in Slack
- [ ] Dispatcher → Settings → copy calendar link → subscribe in
      Google/Apple Calendar → a scheduled job appears on the calendar
- [ ] Dispatcher → Settings → enable auto-dispatch → add a job with a
      free, connected technician nearby → job auto-assigns within seconds
      (check Slack for the dispatch alert)
- [ ] `reconcile-billing`, `check-inventory-levels`, `generate-growth-drafts`,
      `notify-trial-ending` are scheduled agents — hard to trigger
      naturally with real 3-90 day data, so invoke each directly once from
      Supabase Dashboard → Edge Functions → function → "Invoke" and
      confirm `{ "success": true, ... }` with no error (`retention-checkin`
      is tested separately in section 9, since it's now gated to
      Standard/Pro trade businesses specifically — invoking it here on the
      wrong tier/sector would just report zero sent and look like a false
      pass). For `notify-trial-ending` specifically, your own step-1 test
      business is genuinely `trialing` right after signup, so confirm it
      correctly scans without alerting yet (`trial_end` is 7 days out,
      outside the 3-day window) — to actually see the email + Slack
      alert fire, you'd need a trial within 3 days of ending, which the
      step-1 business won't be yet
- [ ] Marketing tab → after `generate-growth-drafts` has run at least
      once, a draft card appears → tap Reject on one → status updates to
      REJECTED and the pending badge count drops
- [ ] Settings → paste Meta access token / ad account ID / Page ID for a
      **test or sandbox ad account, never a live-spending one** → save →
      approve an `ad_campaign` draft → confirm a PAUSED campaign appears
      in Meta Ads Manager
- [ ] Approve an `outreach_sms` draft → confirm the SMS arrives on the
      test lead's phone and the draft's status updates to SENT

## 12. Corrective-action tickets + fatigue-aware dispatch (added 2026-09-13
##     — no extra credentials needed, works on any tier/sector today)

- [ ] Industrial sector: from a site's Safety tab, log an incident that
      creates a proximity hazard the same way `detect-safety-hazards`
      checks for (a technician and an automated process both active at the
      same site at once) → next scheduled run (or manual "Invoke" from
      Supabase Dashboard → Edge Functions) creates a linked ticket in the
      corrective-actions list under that incident, with Assign/Due
      date/Close controls
- [ ] Trade sector: flag a checklist photo as `flagged` directly in
      Supabase (Table Editor → `checklist_photos` → set
      `verification_status='flagged'` on a test row) → the completed job's
      expanded view in `DispatcherView.jsx` shows the linked ticket — **only
      test this manually if `ANTHROPIC_API_KEY` isn't live yet**, since the
      real AI photo-review path only ever produces a `flagged` status once
      that key is set (see `SALES_CLAIMS_ACCURACY_NOTE.md`'s 2026-09-13
      correction — don't be surprised if a real photo submission never
      flags anything with no key configured, that's expected, not a bug)
- [ ] Assign the ticket to a technician, set a due date, then close it →
      all three controls persist and reflect immediately in the list
- [ ] Fatigue-aware dispatch: give one technician a high
      `rolling_week_hours` value (Table Editor → `technicians`, or let
      `update-technician-workload` accumulate it naturally over real
      tracked hours) and a second, less-fatigued technician roughly the
      same distance from a new job → confirm the auto-assign trigger
      (`auto-assign-technician`) picks the less-fatigued one; this is a
      soft tiebreak, so it should only change the outcome when the two
      technicians are close in distance, not override a clearly-closer tech
- [ ] Technician reliability badge (added 2026-09-28): with the same high
      `rolling_week_hours` technician from above (or a `checklist_photos`
      row flagged for their job), confirm `DispatcherView.jsx`'s
      technician roster shows a "Reliability: Watch/Review (score)" badge
      under their name — a technician with neither signal should show no
      badge at all (that's expected, not a bug)
- [ ] Outreach prospect priority (added 2026-09-28): in the admin console
      Outreach tab, set `replied_at` on one drafted/approved prospect
      (Table Editor → `outreach_prospects`) → confirm it sorts to the top
      of the list with a "Hot" badge, and that the badge's tooltip lists
      the reason

## 13. Voice receptionist (`voice-intake-agent`, added 2026-09-13 — genuinely
##     blocked on Twilio's own number-verification step; skip entirely
##     until that's done, no point testing before then)

- [ ] Confirm the business's Twilio number has completed Twilio's own
      phone/identity verification (account-level, in the Twilio Console —
      unrelated to this codebase)
- [ ] In the Twilio Console, point that number's "A CALL COMES IN" (Voice)
      webhook at `voice-intake-agent` instead of the default
      `missed-call-webhook`
- [ ] Call the number from a real phone → hear the opening question, speak
      a plausible job description → confirm each follow-up question comes
      back correctly (job description → urgency → name → suburb)
- [ ] Finish all four answers → confirm the closing line plays and the call
      hangs up
- [ ] Dispatcher's Leads tab shows the new lead with `source:
      'voice_intake_agent'`, scored, with urgency set correctly (say
      something like "it's an emergency, water's flooding everywhere" on a
      test call to confirm the emergency keyword path works)
- [ ] Business phone/Slack (if configured) receives the same notification
      pattern as a text-widget lead
- [ ] Say nothing for the full timeout on one test call (or call from a bad
      line) → confirm one re-prompt happens, then a graceful fallback SMS +
      hangup on the second silence, not a dead call
- [ ] Hang up mid-conversation on a separate test call → confirm the
      partial session doesn't block future calls from the same number (call
      again — it should start a fresh session, not resume the abandoned one)
- [ ] If testing with `ANTHROPIC_API_KEY` unset, confirm the same call still
      completes end-to-end via the fixed 4-question script — say so
      explicitly, don't just assume the AI path works and skip the fallback
      test, since these are two genuinely different code paths

---

## Go / no-go

**Do not call a single real client until sections 1-7 are all ticked.**
Section 8 only applies if you're selling Pro; section 9 is worth running
regardless of which tier you're selling first, since it's the only place
the Standard/Pro automation gate gets tested in both directions; section
10 only if you're selling to an industrial client; section 11 only if
pg_cron is set up; section 12 applies to any tier/sector and needs no
extra credentials; section 13 only once Twilio's number verification is
actually done. If anything in 1-7 fails, that's the actual blocker — fix
it before booking the first real call, not after.
