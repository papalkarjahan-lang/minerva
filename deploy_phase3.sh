#!/bin/bash
# Minerva — Phase 3: redeploy all 65 functions with pending code changes.
# Generated 2026-10-19 by diffing against 10d4fca (the last commit origin/main
# held before this session's push), plus every function that imports a
# changed _shared/ file (batch.ts, claudeDraft.ts, leadTriage.ts, maxAddons.ts,
# outreachEligibility.ts, sms.ts, suburbs.ts, tierEligibility.ts) even where
# that function's own index.ts/logic.ts didn't change directly — safe to
# over-include here (redeploying unchanged behavior is harmless), unsafe to
# under-include (a real fix stays live-but-stale).
#
# Excludes: respond-to-quote (already deployed), launch-ad-campaign and
# send-growth-message (a separate background session has uncommitted changes
# to these right now — do NOT deploy until that's finished and committed).
#
# 4 functions below have no "Deploy with:" header comment to confirm their
# verify_jwt setting from (client-support-chat, create-invoice-payment-intent,
# notify-addon-trial-ending) — these run with the plain command, which
# preserves whatever verify_jwt is currently set on the Supabase side rather
# than guessing. optimize-fleet-day's comment uses a different phrasing my
# grep missed; it needs verify_jwt=true, which is what omitting the flag does.
#
# Run: bash deploy_phase3.sh
# Takes a while (65 sequential deploys) — that's normal, let it run.
# If any single one fails, note which, then re-run just that one line by hand
# rather than re-running the whole script (the successful ones don't need to
# repeat, and most use plain insert/deploy semantics that are safe to retry
# individually either way).

set -e  # stop on first real error rather than silently continuing past one

REF="xiikytqxevivrupkljwc"

npx supabase functions deploy agent-council-report --project-ref $REF
npx supabase functions deploy ai-intake-chat --project-ref $REF
npx supabase functions deploy auto-assign-technician --project-ref $REF
npx supabase functions deploy chase-unpaid-invoices --project-ref $REF
npx supabase functions deploy check-credential-expiry --project-ref $REF
npx supabase functions deploy check-inventory-levels --project-ref $REF
npx supabase functions deploy check-weather-risk --project-ref $REF
npx supabase functions deploy client-support-chat --project-ref $REF
npx supabase functions deploy create-checkout-session --project-ref $REF
npx supabase functions deploy create-invoice-payment-intent --project-ref $REF
npx supabase functions deploy daily-digest --project-ref $REF
npx supabase functions deploy detect-idle-assets --project-ref $REF
npx supabase functions deploy detect-safety-hazards --project-ref $REF
npx supabase functions deploy detect-wasted-trips --project-ref $REF
npx supabase functions deploy draft-outreach-batch --project-ref $REF
npx supabase functions deploy draft-quote --project-ref $REF
npx supabase functions deploy enrich-industrial-leads --project-ref $REF
npx supabase functions deploy estimate-job-carbon --project-ref $REF
npx supabase functions deploy flag-abandoned-signups --project-ref $REF
npx supabase functions deploy followup-outreach --project-ref $REF
npx supabase functions deploy forecast-demand --project-ref $REF
npx supabase functions deploy generate-growth-drafts --project-ref $REF
npx supabase functions deploy generate-roi-proposal --project-ref $REF
npx supabase functions deploy incoming-sms-webhook --no-verify-jwt --project-ref $REF
npx supabase functions deploy industrial-conductor --project-ref $REF
npx supabase functions deploy missed-call-webhook --no-verify-jwt --project-ref $REF
npx supabase functions deploy new-subscriber-checkin --project-ref $REF
npx supabase functions deploy notify-addon-trial-ending --project-ref $REF
npx supabase functions deploy notify-new-enterprise-lead --project-ref $REF
npx supabase functions deploy notify-new-support-request --project-ref $REF
npx supabase functions deploy notify-rebooking-request --project-ref $REF
npx supabase functions deploy notify-trial-ending --project-ref $REF
npx supabase functions deploy nurture-stale-leads --project-ref $REF
npx supabase functions deploy optimize-fleet-day --project-ref $REF
npx supabase functions deploy optimize-industrial-routes --project-ref $REF
npx supabase functions deploy outreach-unsubscribe --no-verify-jwt --project-ref $REF
npx supabase functions deploy parse-prospect-text --project-ref $REF
npx supabase functions deploy predict-asset-maintenance --project-ref $REF
npx supabase functions deploy reconcile-billing --project-ref $REF
npx supabase functions deploy reconcile-technician-state --project-ref $REF
npx supabase functions deploy recover-abandoned-signup --project-ref $REF
npx supabase functions deploy retention-checkin --project-ref $REF
npx supabase functions deploy send-completion-sms --project-ref $REF
npx supabase functions deploy send-eta-sms --project-ref $REF
npx supabase functions deploy send-invoice-sms --project-ref $REF
npx supabase functions deploy send-job-assignment-sms --project-ref $REF
npx supabase functions deploy send-job-cancelled-sms --project-ref $REF
npx supabase functions deploy send-job-rescheduled-sms --project-ref $REF
npx supabase functions deploy send-outreach-batch --project-ref $REF
npx supabase functions deploy send-quote-sms --project-ref $REF
npx supabase functions deploy send-referral-code-sms --project-ref $REF
npx supabase functions deploy send-review-request-sms --project-ref $REF
npx supabase functions deploy send-setup-sms --project-ref $REF
npx supabase functions deploy send-weather-reschedule-sms --project-ref $REF
npx supabase functions deploy sequence-handoffs --project-ref $REF
npx supabase functions deploy stripe-webhook --no-verify-jwt --project-ref $REF
npx supabase functions deploy technician-login --project-ref $REF
npx supabase functions deploy track-consumables --project-ref $REF
npx supabase functions deploy update-addon-billing --project-ref $REF
npx supabase functions deploy update-technician-workload --project-ref $REF
npx supabase functions deploy verify-checklist-photos --project-ref $REF
npx supabase functions deploy voice-intake-agent --no-verify-jwt --project-ref $REF
npx supabase functions deploy winback-lost-leads --project-ref $REF
npx supabase functions deploy xero-oauth-connect --no-verify-jwt --project-ref $REF
npx supabase functions deploy xero-sync-invoice --project-ref $REF

echo ""
echo "All 65 deploys submitted. Scroll up to check for any red/error lines."
