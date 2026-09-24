// Supabase Edge Function: generate-roi-proposal
// Direct invocation: { prospectId?, bigAccountTargetId?, companyName,
// contactName?, tradeType?, fleetSize, avgMonthlyFuelSpend? } — builds a
// shareable, personalized ROI
// one-pager (see ProposalView.jsx at /proposal/:id) for a big-account
// target (multi-van company, FM company, etc.). Called from the admin
// console's Outreach tab. The resulting link is something the OPERATOR
// personally sends/presents on a call — this function only creates the
// page, it never sends anything itself.
//
// Numbers used below are the real, cited industry benchmarks researched
// for BIG_CONTRACTS_PLAYBOOK.md, not invented figures:
//   - Fleet telematics + route optimization typically cuts fuel spend by
//     10-25% conservatively (up to 40% in aggressive cases) — this uses
//     the conservative 15% midpoint so the number holds up under scrutiny.
//   - If avgMonthlyFuelSpend isn't provided, estimates it from fleet size
//     using an AU average of ~$1,200/vehicle/month fuel spend (a
//     deliberately conservative estimate — real spend varies a lot by
//     vehicle type/region, which is why providing a real number always
//     overrides the estimate).
// This is a SALES ESTIMATE, not a guarantee — ProposalView.jsx displays it
// with that framing explicitly, and this function's output should never be
// presented to a prospect as a contractual commitment.
//
// Registered in agent_functions with a real enabled-check (kill-switch
// capable, unlike stripe-webhook/xero-oauth-callback/track-review-click) —
// this is a pure admin-triggered content-generation call with no in-flight
// third party to strand, so disabling it mid-rollout is safe. (Fixed
// 2026-09-23, Round 40 — this function existed with no agent_functions row
// at all, same bug class as the earlier registration-gap rounds.)
//
// Deploy with: supabase functions deploy generate-roi-proposal
//
// Fixed 2026-09-24 (Round 43 continued further still): zero caller-identity
// check — same gap and same fix as send-outreach-batch (see that file's
// header). Here the exploitable risk is a fully attacker-controlled
// companyName/fleetSize/etc. creating spam public `/proposal/:id` pages,
// and a real bigAccountTargetId letting anyone forge that real pipeline's
// stage forward to 'proposal_sent' without an actual proposal ever being
// shown to anyone. Fixed with the same `isAdminCaller` check.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  computeMonthlyFuelSpend,
  computeFuelSavings,
  computeMinervaMonthlyCost,
  isEligibleForProposalStageAdvance,
} from "./logic.ts"
import { isAdminCaller, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'generate-roi-proposal').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ error: 'This feature is temporarily disabled.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const caller = await getAuthenticatedCaller(req, supabase)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!(await isAdminCaller(supabase, caller.id))) {
      return new Response(JSON.stringify({ error: 'You do not have access to this action.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { prospectId, bigAccountTargetId, companyName, contactName, tradeType, fleetSize, avgMonthlyFuelSpend } = await req.json()
    if (!companyName || !fleetSize || fleetSize <= 0) {
      return new Response(JSON.stringify({ error: 'companyName and a positive fleetSize are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const monthlyFuelSpend = computeMonthlyFuelSpend(fleetSize, avgMonthlyFuelSpend)
    const { monthly: estimatedMonthlyFuelSavings, annual: estimatedAnnualFuelSavings } = computeFuelSavings(monthlyFuelSpend)
    const estimatedMinervaMonthlyCost = computeMinervaMonthlyCost(fleetSize)

    const { data: proposal, error } = await supabase.from('roi_proposals').insert({
      prospect_id: prospectId || null,
      big_account_target_id: bigAccountTargetId || null,
      company_name: companyName,
      contact_name: contactName || null,
      trade_type: tradeType || null,
      fleet_size: fleetSize,
      avg_monthly_fuel_spend: monthlyFuelSpend,
      estimated_monthly_fuel_savings: estimatedMonthlyFuelSavings,
      estimated_annual_fuel_savings: estimatedAnnualFuelSavings,
      estimated_minerva_monthly_cost: estimatedMinervaMonthlyCost,
    }).select().single()
    if (error) throw error

    // Advance the big-account pipeline stage automatically when a proposal
    // is generated for it — only moves it forward (never backward past
    // negotiating/closed), and only if it's still at an early stage, so
    // this can't accidentally undo manual stage-tracking done later.
    if (bigAccountTargetId) {
      const { data: target } = await supabase.from('big_account_targets').select('stage').eq('id', bigAccountTargetId).single()
      if (isEligibleForProposalStageAdvance(target?.stage)) {
        await supabase.from('big_account_targets')
          .update({ stage: 'proposal_sent', updated_at: new Date().toISOString() })
          .eq('id', bigAccountTargetId)
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'generate-roi-proposal', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, proposalId: proposal.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('generate-roi-proposal error:', err)
    try { supabase.rpc('record_agent_run', { fn_name: 'generate-roi-proposal', status: 'error', error_msg: err.message }).then(() => {}, () => {}) } catch (_) {}
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
