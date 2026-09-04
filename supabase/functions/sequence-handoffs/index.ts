// Supabase Edge Function: sequence-handoffs
// "The Pacer" — manages human/automation handoff sequencing on active
// sites. Cron sweep (every 15 min): finds 'task_complete' checkins logged
// by an 'automated_process' in the last hour that have no matching
// 'task_start' checkin by a 'human_technician' afterward at the same site —
// i.e. an automated process finished something and no human has picked up
// the follow-on work yet. Nudges Slack once per unhandled completion.
// Deploy with: supabase functions deploy sequence-handoffs

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

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'sequence-handoffs').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: completions, error } = await supabase.from('site_checkins')
      .select('id, site_id, business_id, person_name, detail, created_at, site_projects(name)')
      .eq('role', 'automated_process')
      .eq('checkin_type', 'task_complete')
      .gte('created_at', hourAgo)
    if (error) throw error

    let nudged = 0
    for (const c of completions || []) {
      const { data: followUp } = await supabase.from('site_checkins')
        .select('id').eq('site_id', c.site_id).eq('role', 'human_technician').eq('checkin_type', 'task_start')
        .gte('created_at', c.created_at).limit(1)
      if (followUp && followUp.length > 0) continue // already picked up

      const siteName = (c as any).site_projects?.name || 'a site'
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: c.business_id, text: `🔁 *Pacer*: automated task complete at *${siteName}*${c.detail ? ` (${c.detail})` : ''} — no human tech has started the follow-on work yet.` }),
      }).catch(() => {})
      nudged++
    }

    supabase.rpc('record_agent_run', { fn_name: 'sequence-handoffs', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, evaluated: (completions || []).length, nudged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('sequence-handoffs error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'sequence-handoffs', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
