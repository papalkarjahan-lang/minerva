// Supabase Edge Function: detect-safety-hazards
// "The Warden" — Safety & Compliance Audit agent for active sites. Cron
// sweep (every 15 min): for each active site_project, checks whether a
// 'human_technician' and an 'automated_process' both have an open
// (arrival-without-departure) presence at the same site simultaneously —
// a proximity condition worth a human's attention before it becomes an
// incident. Writes a safety_incidents row (once per open overlap, not
// re-flagged every run) and notifies Slack.
// Deploy with: supabase functions deploy detect-safety-hazards

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'detect-safety-hazards').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: sites, error } = await supabase.from('site_projects').select('id, business_id, name').eq('status', 'active')
    if (error) throw error

    let flagged = 0
    for (const site of sites || []) {
      const { data: checkins } = await supabase.from('site_checkins')
        .select('id, person_name, role, checkin_type, created_at')
        .eq('site_id', site.id)
        .order('created_at', { ascending: true })

      const openByPerson = new Map<string, string>() // person_name -> role, while "on site"
      for (const c of checkins || []) {
        const key = c.person_name || c.id
        if (c.checkin_type === 'arrival' || c.checkin_type === 'task_start') openByPerson.set(key, c.role)
        if (c.checkin_type === 'departure' || c.checkin_type === 'task_complete') openByPerson.delete(key)
      }

      const roles = Array.from(openByPerson.values())
      const hasHuman = roles.includes('human_technician')
      const hasMachine = roles.includes('automated_process')
      if (!hasHuman || !hasMachine) continue

      // Avoid re-flagging the same still-open overlap every 15 min.
      const { data: existing } = await supabase.from('safety_incidents')
        .select('id').eq('site_id', site.id).is('acknowledged_at', null)
        .eq('description', `Human technician and automated process both active on site simultaneously.`)
        .limit(1)
      if (existing && existing.length > 0) continue

      await supabase.from('safety_incidents').insert({
        site_id: site.id, business_id: site.business_id, severity: 'warning',
        description: `Human technician and automated process both active on site simultaneously.`,
      })
      // Also written as an agent_insights row (not just Slack) so recurring
      // proximity hazards at the same site show up as a pattern in the
      // weekly agent-council-report, not just as one-off business Slack
      // pings that never reach the platform-wide operator view.
      await supabase.from('agent_insights').insert({
        agent: 'core', insight_type: 'safety_incident',
        summary: `Proximity hazard at "${site.name}": human technician and automated process both active on site simultaneously.`,
        related_table: 'safety_incidents',
      }).then(() => {}, () => {})
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: site.business_id, text: `⚠️ *Warden*: site *${site.name}* has a human technician and an automated process both active at once — proximity hazard, worth a check.` }),
      }).catch(() => {})
      flagged++
    }

    supabase.rpc('record_agent_run', { fn_name: 'detect-safety-hazards', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, sitesEvaluated: (sites || []).length, flagged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('detect-safety-hazards error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'detect-safety-hazards', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
