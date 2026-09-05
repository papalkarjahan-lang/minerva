// Supabase Edge Function: flag-abandoned-signups
// Cron sweep (no body, daily) — finds businesses created 48+ hours ago that
// never completed Stripe checkout (stripe_sub_id still null). Onboarding.jsx
// creates the businesses row (and technicians rows, and sends real setup
// SMS) BEFORE the Stripe redirect, so an abandoned/failed checkout leaves
// permanently orphaned data with nothing pointing it out.
//
// Deliberately does NOT delete anything — this only flags each business
// once (abandoned_flagged_at, see supabase_schema_delta_abandoned_signups.sql)
// and writes an agent_insights row so a human can review and decide whether
// to delete it. Autonomous hard-deletion of business records, with no
// automated test suite guarding the query, is exactly the kind of
// irreversible action that stays human-in-the-loop in this codebase.
// Deploy with: supabase functions deploy flag-abandoned-signups

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

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data: stale, error: staleErr } = await supabase
      .from('businesses')
      .select('id, name, created_at')
      .is('stripe_sub_id', null)
      .is('abandoned_flagged_at', null)
      .lt('created_at', cutoff)

    if (staleErr) throw staleErr

    let flagged = 0
    for (const biz of stale || []) {
      const { count } = await supabase
        .from('technicians')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)

      await supabase.from('agent_insights').insert({
        agent: 'operations',
        insight_type: 'anomaly',
        summary: `Business "${biz.name}" (created ${biz.created_at}) never completed Stripe checkout and is now 48+ hours old with ${count ?? 0} technician(s) already sent setup SMS. Likely an abandoned signup — review and delete manually if confirmed dead.`,
        business_id: biz.id,
        related_table: 'businesses',
        related_id: biz.id,
      }).then(() => {}, (err) => console.error('flag-abandoned-signups: insight insert failed', err))

      await supabase.from('businesses').update({ abandoned_flagged_at: new Date().toISOString() }).eq('id', biz.id)
      flagged++
    }

    supabase.rpc('record_agent_run', { fn_name: 'flag-abandoned-signups', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, flagged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('flag-abandoned-signups error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'flag-abandoned-signups', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
