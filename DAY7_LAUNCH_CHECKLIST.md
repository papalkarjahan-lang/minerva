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
- [ ] Cancel/note this second test subscription the same way as step 1

## 9. Industrial sector (only if you plan to sell to an industrial client —
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

## 10. Autonomous layer (only if you ran the pg_cron setup block)

- [ ] Dispatcher → Settings → paste a Slack webhook URL → save → capture a
      test lead via the intake widget → alert appears in Slack
- [ ] Dispatcher → Settings → copy calendar link → subscribe in
      Google/Apple Calendar → a scheduled job appears on the calendar
- [ ] Dispatcher → Settings → enable auto-dispatch → add a job with a
      free, connected technician nearby → job auto-assigns within seconds
      (check Slack for the dispatch alert)
- [ ] `retention-checkin`, `reconcile-billing`, `check-inventory-levels`,
      `generate-growth-drafts` are scheduled agents — hard to trigger
      naturally with real 30-90 day data, so invoke each directly once
      from Supabase Dashboard → Edge Functions → function → "Invoke" and
      confirm `{ "success": true, ... }` with no error
- [ ] Marketing tab → after `generate-growth-drafts` has run at least
      once, a draft card appears → tap Reject on one → status updates to
      REJECTED and the pending badge count drops
- [ ] Settings → paste Meta access token / ad account ID / Page ID for a
      **test or sandbox ad account, never a live-spending one** → save →
      approve an `ad_campaign` draft → confirm a PAUSED campaign appears
      in Meta Ads Manager
- [ ] Approve an `outreach_sms` draft → confirm the SMS arrives on the
      test lead's phone and the draft's status updates to SENT

---

## Go / no-go

**Do not call a single real client until sections 1-7 are all ticked.**
Section 8 only applies if you're selling Pro; section 9 only if you're
selling to an industrial client; section 10 only if pg_cron is set up.
If anything in 1-7 fails, that's the actual blocker — fix it before
booking the first real call, not after.
