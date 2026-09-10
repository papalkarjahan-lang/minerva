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
// Deploy with: supabase functions deploy generate-roi-proposal

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CONSERVATIVE_FUEL_SAVINGS_RATE = 0.15
const ESTIMATED_FUEL_SPEND_PER_VEHICLE_MONTHLY = 1200
const MINERVA_PER_TECH_MONTHLY_ESTIMATE = 89 // mid-tier estimate for a bulk/negotiated multi-tech deal

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { prospectId, bigAccountTargetId, companyName, contactName, tradeType, fleetSize, avgMonthlyFuelSpend } = await req.json()
    if (!companyName || !fleetSize || fleetSize <= 0) {
      return new Response(JSON.stringify({ error: 'companyName and a positive fleetSize are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const monthlyFuelSpend = avgMonthlyFuelSpend && avgMonthlyFuelSpend > 0
      ? avgMonthlyFuelSpend
      : fleetSize * ESTIMATED_FUEL_SPEND_PER_VEHICLE_MONTHLY

    const estimatedMonthlyFuelSavings = Math.round(monthlyFuelSpend * CONSERVATIVE_FUEL_SAVINGS_RATE)
    const estimatedAnnualFuelSavings = estimatedMonthlyFuelSavings * 12
    const estimatedMinervaMonthlyCost = Math.round(fleetSize * MINERVA_PER_TECH_MONTHLY_ESTIMATE)

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
      if (target && ['researching', 'contacted', 'discovery_call'].includes(target.stage)) {
        await supabase.from('big_account_targets')
          .update({ stage: 'proposal_sent', updated_at: new Date().toISOString() })
          .eq('id', bigAccountTargetId)
      }
    }

    return new Response(JSON.stringify({ success: true, proposalId: proposal.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('generate-roi-proposal error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
