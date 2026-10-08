// Supabase Edge Function: reconcile-technician-state
//
// Self-healing state reconciliation. Fixes exactly one known class of data
// drift: TechnicianView.jsx's finishTheJob() does two sequential (not
// transactional) writes — `jobs.status = 'complete'` first, then
// `technicians.current_job_id = null` second (see src/pages/
// TechnicianView.jsx). Technicians are on mobile connections that are known
// to drop mid-session (that's the whole premise of the GPS offline queue
// already built) — if the connection dies between those two writes, the
// job correctly shows complete, but the technician's current_job_id keeps
// pointing at it forever. auto-assign-technician filters on
// `.is('current_job_id', null)`, so a technician stuck like this silently
// stops receiving new auto-dispatched jobs — no error, no alert, just a
// technician who quietly never gets picked again.
//
// This is safe to auto-fix (not just flag) because it only clears an
// internal consistency pointer — no customer data, no money, no
// irreversible action. Runs daily via cron (supabase_schema_delta_
// reconcile_technician_state_cron.sql).
//
// Deploy with: supabase functions deploy reconcile-technician-state

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chunk } from "../_shared/batch.ts"

const TECH_BATCH_SIZE = 20

serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'reconcile-technician-state').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: stuckTechs } = await supabase
      .from('technicians')
      .select('id, name, business_id, current_job_id')
      .not('current_job_id', 'is', null)

    const jobIds = [...new Set((stuckTechs || []).map(t => t.current_job_id))]
    const jobStatusById = new Map<string, string>()
    if (jobIds.length > 0) {
      const { data: jobs } = await supabase.from('jobs').select('id, status').in('id', jobIds)
      for (const j of jobs || []) jobStatusById.set(j.id, j.status)
    }

    let fixed = 0
    // Bounded-concurrency batching (added 2026-10-08) — most iterations
    // here are a cheap in-memory map lookup with no I/O (drift is the
    // rare case), so this loop is lower-risk than the other cron
    // functions fixed this round. Still applied for defense in depth: a
    // correlated event (e.g. a network outage affecting many
    // technicians' mobile connections at once, exactly the scenario this
    // function exists to clean up after) could spike the drifted subset
    // well above the normal rare case, and batching costs nothing
    // functionally over the plain sequential loop it replaces. Same
    // chunk()-of-20 shape as the rest of this round, see
    // SCALE_READINESS_NOTES_ROUND2.md.
    for (const batch of chunk(stuckTechs || [], TECH_BATCH_SIZE)) {
      const results = await Promise.all(batch.map(tech => fixOneTechnicianIfDrifted(supabase, jobStatusById, tech)))
      for (const wasFixed of results) if (wasFixed) fixed++
    }

    await supabase.rpc('record_agent_run', { fn_name: 'reconcile-technician-state', status: 'ok' })
    return new Response(JSON.stringify({ success: true, checked: (stuckTechs || []).length, fixed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('reconcile-technician-state error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      await supabase.rpc('record_agent_run', { fn_name: 'reconcile-technician-state', status: 'error', error_msg: err.message })
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

// Extracted from the main loop (2026-10-08) so it can be run through
// chunk()'s bounded-concurrency batching — same logic that was previously
// inline, unchanged. Returns whether this technician's drift was fixed.
async function fixOneTechnicianIfDrifted(
  supabase: ReturnType<typeof createClient>,
  jobStatusById: Map<string, string>,
  tech: any
): Promise<boolean> {
  const status = jobStatusById.get(tech.current_job_id)
  // Drift = the job it's pointing at is already 'complete', or no longer
  // exists at all (e.g. deleted — not in the map at all). A job that's
  // still 'scheduled' or 'active' is a technician genuinely mid-job —
  // leave that alone.
  if (!status || status === 'complete') {
    await supabase.from('technicians').update({ current_job_id: null }).eq('id', tech.id)
    await supabase.from('agent_insights').insert({
      business_id: tech.business_id,
      agent: 'operations',
      insight_type: 'anomaly',
      summary: `Auto-fixed: technician ${tech.name || tech.id} was stuck pointing at a finished job and would have stopped receiving auto-dispatched jobs. Cleared automatically.`,
    })
    return true
  }
  return false
}
