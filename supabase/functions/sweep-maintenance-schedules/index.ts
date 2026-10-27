// Supabase Edge Function: sweep-maintenance-schedules
// Cron sweep (daily) — the preventive-maintenance half of the Maintenance
// & Inspections gap: owners can now define a real maintenance_schedules
// row ("250-hour service", "annual safety inspection") and have it turn
// into a real, assignable, due-dated corrective_actions ticket the moment
// it's due, instead of only ever finding out reactively (monitor-asset-
// telemetry) or via a Slack prediction (predict-asset-maintenance) with
// nothing to assign or track to completion.
//
// Raises a corrective_actions row with source_type='maintenance_schedule',
// source_id=schedule.id — reuses that table's existing assign/due-date/
// close UI in IndustrialDispatcherView.jsx rather than building a parallel
// work-order screen. See supabase_schema_delta_maintenance_schedules.sql
// for why.
//
// Deploy with: supabase functions deploy sweep-maintenance-schedules

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isScheduleDue } from "./logic.ts"
import { isAddonActive } from "../_shared/maxAddons.ts"
import { chunk } from "../_shared/batch.ts"

const SCHEDULE_BATCH_SIZE = 20

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'sweep-maintenance-schedules').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: schedules, error } = await supabase.from('maintenance_schedules')
      .select('id, business_id, asset_id, title, trigger_type, interval_hours, interval_days, last_completed_at, last_completed_hours, work_order_raised_at')
      .eq('active', true)
    if (error) throw error

    const { data: businesses } = await supabase.from('businesses').select('id, max_addons, max_addon_trials')
    const addonActive = (bizId: string) => {
      const biz = (businesses || []).find((b: any) => b.id === bizId)
      return isAddonActive(biz, 'asset_intelligence')
    }

    const { data: assets } = await supabase.from('industrial_assets').select('id, name, engine_hours')
    const assetById = (id: string) => (assets || []).find((a: any) => a.id === id)

    // Same Minerva Max gating as predict-asset-maintenance/detect-idle-
    // assets — this is an extension of the asset_intelligence add-on, not
    // a free base feature. Schedules an owner without the add-on created
    // stay stored but inert until they enable it.
    const eligible = (schedules || []).filter(s => addonActive(s.business_id) && !s.work_order_raised_at)

    let evaluated = 0
    let raised = 0
    for (const batch of chunk(eligible, SCHEDULE_BATCH_SIZE)) {
      const results = await Promise.all(batch.map(s => evaluateOneSchedule(supabase, s, assetById(s.asset_id))))
      for (const wasRaised of results) { evaluated++; if (wasRaised) raised++ }
    }

    supabase.rpc('record_agent_run', { fn_name: 'sweep-maintenance-schedules', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, evaluated, raised }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('sweep-maintenance-schedules error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'sweep-maintenance-schedules', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Claim-before-raise: same atomic conditional-update pattern as
// predict-asset-maintenance's maintenance_predicted_at claim, so two
// overlapping runs (or a retry) can't both pass the "not already raised"
// check and both insert a duplicate corrective_actions ticket for the
// same schedule. work_order_raised_at is cleared back to null by
// closeCorrectiveAction in IndustrialDispatcherView.jsx once the ticket
// closes, which is what lets the NEXT cycle raise again.
async function evaluateOneSchedule(
  supabase: ReturnType<typeof createClient>,
  schedule: any,
  asset: any
): Promise<boolean> {
  const due = isScheduleDue(schedule, asset?.engine_hours ?? null, new Date())
  if (!due) return false

  const { data: claimed, error: claimErr } = await supabase
    .from('maintenance_schedules')
    .update({ work_order_raised_at: new Date().toISOString() })
    .eq('id', schedule.id)
    .is('work_order_raised_at', null)
    .select('id')
  if (claimErr) { console.error('sweep-maintenance-schedules: claim failed:', claimErr.message); return false }
  if (!claimed || claimed.length === 0) return false // already raised by a concurrent/prior run

  const assetName = asset?.name || 'this asset'
  const { error: insertErr } = await supabase.from('corrective_actions').insert({
    business_id: schedule.business_id,
    source_type: 'maintenance_schedule',
    source_id: schedule.id,
    title: `${schedule.title} — ${assetName}`,
    description: schedule.trigger_type === 'calendar'
      ? `Calendar-based preventive maintenance is due (every ${schedule.interval_days} days).`
      : `Meter-based preventive maintenance is due (every ${schedule.interval_hours} engine hours).`,
    status: 'open',
    due_date: new Date().toISOString().slice(0, 10),
  })
  if (insertErr) {
    console.error('sweep-maintenance-schedules: insert failed:', insertErr.message)
    // Release the claim so this isn't silently lost until the schedule happens to be touched again.
    await supabase.from('maintenance_schedules').update({ work_order_raised_at: null }).eq('id', schedule.id)
    return false
  }

  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ businessId: schedule.business_id, text: `🔧 *Preventive Maintenance Due*: *${schedule.title}* on *${assetName}* — work order raised, assign it from the Assets tab.` }),
  }).catch(() => {})
  return true
}
