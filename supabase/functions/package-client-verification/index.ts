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

    // asset_telemetry_events has no site_id column — only asset_id — so
    // scoping "this site's telemetry" means first finding which assets were
    // assigned to this site (industrial_assets.geofence_site_id), then
    // filtering events by that asset id list. Without this step, evidence
    // would include telemetry from every asset the business owns, not just
    // this site's, which would misrepresent what happened on-site.
    const { data: siteAssets } = await supabase.from('industrial_assets').select('id').eq('geofence_site_id', siteId)
    const siteAssetIds = (siteAssets || []).map(a => a.id)

    const [{ data: checkins }, { data: telemetry }, { data: incidents }] = await Promise.all([
      supabase.from('site_checkins').select('person_name, role, checkin_type, detail, created_at').eq('site_id', siteId).order('created_at'),
      siteAssetIds.length > 0
        ? supabase.from('asset_telemetry_events').select('asset_id, event_type, detail, created_at').in('asset_id', siteAssetIds).order('created_at')
        : Promise.resolve({ data: [] }),
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

    supabase.rpc('record_agent_run', { fn_name: 'package-client-verification', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, packageId: pkg.id, summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('package-client-verification error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'package-client-verification', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
