// Supabase Edge Function: package-client-verification
// "The Closer" — assembles telemetry, checkin, and safety evidence for a
// site into a client-facing summary ready for digital sign-off. Direct
// invocation only: { siteId }, called from the Industrial console when a
// lead technician marks a site ready to close out (mirrors the trade
// sector's Dispute Pack — see DisputeView.jsx — same "assemble evidence
// already in the DB" pattern, no new external data source needed).
// Deploy with: supabase functions deploy package-client-verification

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

    const { siteId } = await req.json()
    if (!siteId) throw new Error('siteId is required')

    const { data: site, error } = await supabase.from('site_projects').select('id, business_id, name, scope_of_work').eq('id', siteId).maybeSingle()
    if (error || !site) throw new Error('site not found')

    const [{ data: checkins }, { data: telemetry }, { data: incidents }] = await Promise.all([
      supabase.from('site_checkins').select('person_name, role, checkin_type, detail, created_at').eq('site_id', siteId).order('created_at'),
      supabase.from('asset_telemetry_events').select('asset_id, event_type, detail, created_at').eq('business_id', site.business_id).order('created_at'),
      supabase.from('safety_incidents').select('severity, description, acknowledged_at, created_at').eq('site_id', siteId).order('created_at'),
    ])

    const taskCompletions = (checkins || []).filter(c => c.checkin_type === 'task_complete').length
    const openIncidents = (incidents || []).filter(i => !i.acknowledged_at).length
    const summary = `Site "${site.name}" — ${taskCompletions} task${taskCompletions === 1 ? '' : 's'} completed, ` +
      `${(checkins || []).length} logged check-in${(checkins || []).length === 1 ? '' : 's'}, ` +
      `${openIncidents} unresolved safety flag${openIncidents === 1 ? '' : 's'}.`

    const { data: pkg, error: insErr } = await supabase.from('client_verification_packages').insert({
      site_id: siteId,
      business_id: site.business_id,
      summary,
      evidence: { checkins: checkins || [], telemetry: telemetry || [], safety_incidents: incidents || [] },
    }).select().single()
    if (insErr) throw insErr

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({ businessId: site.business_id, text: `📋 *Closer*: verification package assembled for *${site.name}* — ready to present for client sign-off.` }),
    }).catch(() => {})

    return new Response(JSON.stringify({ success: true, packageId: pkg.id, summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('package-client-verification error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
