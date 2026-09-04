// Supabase Edge Function: verify-industrial-compliance
// "Sentry" — the Industrial sector's Verification Layer, mirroring the
// trade sector's verify-checklist-photos in spirit: a final gatekeeper
// check, not a blocker of day-to-day work. Cron sweep (every hour): finds
// safety_incidents still unacknowledged 24h+ after being raised, and
// escalates them distinctly from detect-safety-hazards' initial flag (that
// one fires once on detection; this one is the "still nobody's dealt with
// this" backstop, same two-stage pattern as nurture-stale-leads).
// Deploy with: supabase functions deploy verify-industrial-compliance

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

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'verify-industrial-compliance').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: stale, error } = await supabase.from('safety_incidents')
      .select('id, business_id, description, severity, created_at, site_projects(name)')
      .is('acknowledged_at', null)
      .lt('created_at', dayAgo)
    if (error) throw error

    let escalated = 0
    for (const inc of stale || []) {
      const siteName = (inc as any).site_projects?.name || 'a site'
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: inc.business_id, text: `🛡️ *Sentry*: unresolved ${inc.severity} at *${siteName}*, open 24h+: "${inc.description}". Needs sign-off before this site's work is considered compliant.` }),
      }).catch(() => {})
      escalated++
    }

    supabase.rpc('record_agent_run', { fn_name: 'verify-industrial-compliance', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, escalated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('verify-industrial-compliance error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'verify-industrial-compliance', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
