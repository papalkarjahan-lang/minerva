// Supabase Edge Function: auto-assign-technician
// Event-driven agent, called once by the on_job_created_auto_assign
// trigger (see supabase_schema.sql) right after a new job is inserted
// with no technician_id. Only actually assigns anyone if the job's
// business has auto_dispatch_enabled = true (checked here, not in the
// trigger, so businesses that don't use the feature pay zero cost beyond
// one cheap lookup).
//
// Picks the nearest active technician who currently has no current_job_id
// (i.e. free), using the same haversine formula as the frontend
// (src/utils.js) reimplemented here since edge functions can't import
// from src/. Falls back to "no technician available" (leaves the job
// unassigned for a human to pick up) if every technician is busy or none
// have a known GPS position yet.
//
// Fair-Rotation / Burnout Guard (additive, see supabase_schema.sql):
// selection is nearest-by-distance PLUS a soft tiebreak that
// deprioritizes — never hard-excludes — a technician who has been getting
// more than their share of emergency jobs lately (technicians.
// rolling_emergency_job_count, recomputed daily by
// update-technician-workload). Implemented as a small distance penalty
// (EMERGENCY_TIEBREAK_KM per recent emergency job) added on top of the
// real haversine distance before comparing candidates — a technician who
// is genuinely much closer still wins, but among comparably-close
// technicians the one who's been getting fewer emergency callouts lately
// is preferred. This never changes who's eligible (still "free,
// active, known position"), only who's picked among them.
//
// Fatigue tiebreak (added 2026-09-12): update-technician-workload has
// computed technicians.rolling_week_hours (real GPS-breadcrumb-derived
// hours worked in the trailing 7 days) for a while, but nothing in
// dispatch actually used it — a technician already at 60+ hours this week
// could still be picked over someone comparably close who's had a lighter
// week, same "who gets today's job" blind spot the emergency tiebreak
// already covers for emergency-call load. Same soft-penalty pattern: hours
// worked beyond FATIGUE_BASELINE_HOURS (a normal full-time week) add a
// small distance penalty, so a genuinely much-closer technician still
// wins the job, but among comparably-close technicians the less-fatigued
// one is preferred. Hours at or under the baseline add nothing — this
// isn't a punishment for a normal week, only a nudge away from someone
// already working unusually long hours.
//
// Hybrid workforce fallback (added 2026-09-04): if no employed technician
// is free, falls back to the nearest active subcontractor (subcontractors
// table) with a known position, same haversine-nearest logic, no emergency
// tiebreak (rolling_emergency_job_count doesn't apply to non-employees).
// Assigns via jobs.assigned_subcontractor_id, a separate column from
// technician_id, so nothing about existing technician-only logic elsewhere
// in the app (payroll, FBT-style hours tracking, etc.) is touched by a
// subcontractor assignment.
//
// Geofenced radius cap (added 2026-09-05, supabase_schema_delta_
// auto_dispatch_radius.sql): businesses.auto_dispatch_max_km, null by
// default (= unlimited, unchanged behaviour). If set, the nearest
// candidate (technician or subcontractor) is only auto-assigned when
// within that radius of the job's client_lat/client_lng — otherwise the
// job is left unassigned for a human to route, same as "nobody free"
// today. Prevents auto-dispatching someone absurdly far away just because
// everyone closer happened to be busy.
//
// Credential-compliance hard filter (added 2026-09-06, supabase_schema_
// delta_credential_dispatch.sql): jobs.required_credential_name, null by
// default (= no requirement, unchanged behaviour). If a dispatcher set it
// when creating the job, any free technician who does NOT hold a
// currently-valid (expiry_date >= today) technician_credentials row with
// that exact credential_name is excluded from the candidate pool BEFORE
// distance/tiebreak scoring — this is a hard exclude, unlike the soft
// Fair-Rotation tiebreak above, because sending someone to a job requiring
// a licence they don't hold is a compliance/safety risk, not a fairness
// optimization. If this empties the pool, behaves exactly like "nobody
// free" today (falls through to the subcontractor fallback, then to
// no_technician_available) — UNLESS a credential was required (see next
// paragraph).
//
// Credential-required jobs skip the subcontractor fallback entirely (fixed
// 2026-09-16): no credential data exists for subcontractors in this build,
// so there was previously no way to verify a fallback subcontractor held
// the required licence — meaning a job that explicitly required one could
// silently auto-dispatch an unverified subcontractor anyway, once no
// employed technician was free. That's a compliance/safety gap, not a
// capacity-fairness one, so it gets the same hard-exclude treatment as the
// technician filter above: if required_credential_name is set, the
// subcontractor pool is skipped outright and the job falls through to
// no_technician_available for a human to route, instead of ever guessing.
//
// Skill-based hard filter (added 2026-09-27, supabase_schema_delta_
// skill_dispatch.sql): jobs.required_skill, null by default (= no
// requirement, unchanged behaviour). technicians.skills (text[]) was
// INCORRECTLY believed to already exist via supabase_schema_delta_
// minerva_max.sql — that delta only added `skills` to the separate
// `subcontractors` table, never to `technicians`. The column was actually
// missing on the live DB from 2026-09-27 until this was caught and the
// migration applied directly (2026-10-01); see the `techsErr` check a few
// lines below in the code for how this silently degraded every
// auto-dispatch in the meantime instead of erroring loudly. If a
// dispatcher sets a required skill on
// the job (e.g. "confined_space"), any free technician whose skills list
// doesn't contain that exact tag (case-insensitive) is excluded from the
// candidate pool — same hard-exclude treatment as the credential filter,
// applied independently (a job can require a credential, a skill, both,
// or neither). Same subcontractor-fallback-skip rationale as credentials:
// subcontractors have no skills data in this build, so a skill-required
// job falls straight to no_technician_available once no employed
// technician qualifies, rather than ever guessing.
//
// Pure scoring/filtering logic lives in ./logic.ts so it can be unit tested
// without a database or the Deno runtime — this file just wires that logic
// up to real Supabase reads/writes.
//
// Custom Workflows (added 2026-09-28): fires the 'job.assigned' trigger via
// run-custom-workflows (internal service-role call, same pattern as the
// existing notify-slack/send-job-assignment-sms fires) on every successful
// assignment — technician OR subcontractor. DispatcherView's manual
// assignJob fires the same trigger for the human-assigned path, so a
// business's 'job.assigned' workflow rules fire consistently regardless of
// whether auto-dispatch or a dispatcher's own click assigned the job.
//
// Recency window added 2026-09-30: this function's only legitimate caller
// (trigger_auto_assign_technician() in supabase_schema.sql) fires via
// net.http_post with the anon key baked into the trigger body — it has to
// be the anon key, since a Postgres trigger function's SQL is committed to
// git and can never safely hold the real service-role secret (this
// codebase never puts that key in any .sql file, confirmed by grep — same
// reason the internal-service-key check used by send-job-assignment-sms/
// run-custom-workflows can't be reused verbatim here). That means anyone
// holding the public anon key can also POST straight to this function with
// any job_id — and since `jobs` SELECT is intentionally anon `using(true)`
// (the public tracking/invoice/quote-link model, see SECURITY_NOTES.md
// "Phase 2 priority: The big one" — a documented, deliberately-deferred
// gap, not something this delta re-opens or attempts to close), a job_id
// belonging to a business the caller doesn't own isn't even a secret to
// guess. The real risk isn't reading it — it's forging a call that fires a
// REAL SMS to a real technician and a REAL Slack post for a business that
// never asked for this dispatch to happen right now, most plausibly by
// replaying an old job that a business deliberately left unassigned (e.g.
// enabled auto-dispatch only after the fact) for a human to route by hand.
// The legitimate trigger always fires within milliseconds of insert, so
// requiring the job to still be within a short window of its own
// created_at closes that replay case without inventing new shared-secret
// infrastructure this function's one real caller has no safe way to
// present anyway.
// Deploy with: supabase functions deploy auto-assign-technician

const RECENT_JOB_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { filterQualifiedTechnicians, filterSkilledTechnicians, pickNearestTechnician, pickNearestSubcontractor, isBeyondMaxKm } from "./logic.ts"
import { isAddonActive } from "../_shared/maxAddons.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { job_id } = await req.json()
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'auto-assign-technician').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, business_id, technician_id, client_lat, client_lng, client_name, client_address, required_credential_name, required_skill, created_at')
      .eq('id', job_id)
      .single()
    if (jobErr || !job) throw new Error('Job not found')

    // See header comment (recency window) — reject a call for a job that's
    // no longer fresh, rather than trusting a bare job_id from a caller we
    // can't otherwise verify is really the insert trigger.
    if (!job.created_at || Date.now() - new Date(job.created_at).getTime() > RECENT_JOB_WINDOW_MS) {
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'job_not_recent' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Already assigned (e.g. dispatcher beat the agent to it) — nothing to do.
    if (job.technician_id) {
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'already_assigned' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('auto_dispatch_enabled, auto_dispatch_max_km, name, max_addons, max_addon_trials')
      .eq('id', job.business_id)
      .single()
    const maxKm = business?.auto_dispatch_max_km
    // subcontractor_pool is a paid Minerva Max add-on — the insert-time
    // trigger (supabase_schema_delta_subcontractor_pool_addon.sql) stops new
    // subcontractor rows being created without it, but a business that let
    // an active trial/subscription lapse could still have old subcontractor
    // rows sitting in the table, so this fallback needs its own check too.
    const subcontractorPoolActive = isAddonActive(business, 'subcontractor_pool')

    if (!business?.auto_dispatch_enabled) {
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'auto_dispatch_disabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Error intentionally checked and thrown here (unlike a bare `const {
    // data } = ...`) — a prior version of this query silently discarded
    // its error, so when technicians.skills briefly didn't exist on the
    // live DB (see supabase_schema_delta_skill_dispatch.sql's now-corrected
    // comment), this select failed on every call but `(techs || [])`
    // masked it as "no technician free," silently degrading every
    // auto-dispatch to the subcontractor/no_technician_available fallback
    // with no error ever recorded. Fail loud instead, consistent with
    // every other query in this function (see job/subClaim/techClaim above).
    const { data: techs, error: techsErr } = await supabase
      .from('technicians')
      .select('id, name, current_lat, current_lng, current_job_id, is_active, rolling_emergency_job_count, rolling_week_hours, skills')
      .eq('business_id', job.business_id)
      .eq('is_active', true)
      .is('current_job_id', null)
    if (techsErr) throw techsErr

    let free = (techs || []).filter(t => t.current_lat != null && t.current_lng != null)

    // Hard-exclude technicians lacking a currently-valid required credential —
    // see header comment. No requirement set = no filtering, same as before.
    if (job.required_credential_name && free.length > 0) {
      const today = new Date().toISOString().slice(0, 10)
      const { data: validCreds } = await supabase
        .from('technician_credentials')
        .select('technician_id')
        .eq('business_id', job.business_id)
        .eq('credential_name', job.required_credential_name)
        .gte('expiry_date', today)
      const qualifiedIds = new Set((validCreds || []).map(c => c.technician_id))
      free = filterQualifiedTechnicians(free, qualifiedIds)
    }

    // Hard-exclude technicians lacking the job's required skill tag — see
    // header comment. No requirement set = no filtering, same as before.
    if (job.required_skill && free.length > 0) {
      free = filterSkilledTechnicians(free, job.required_skill)
    }

    if (free.length === 0) {
      // No employed technician free — fall back to the subcontractor pool
      // before giving up entirely (only if the business's add-on is
      // actually active — see comment above). Skipped entirely when a
      // credential or skill is required, since subcontractors have no
      // credential/skill data to verify against (see header comment) —
      // falling through straight to no_technician_available instead of
      // ever guessing.
      const { data: subs } = (subcontractorPoolActive && !job.required_credential_name && !job.required_skill) ? await supabase
        .from('subcontractors')
        .select('id, name, current_lat, current_lng')
        .eq('business_id', job.business_id)
        .eq('is_active', true)
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null) : { data: null }

      if (!subs || subs.length === 0) {
        supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
        return new Response(JSON.stringify({ success: true, skipped: 'no_technician_available' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }

      const { nearest: nearestSub, nearestDist: nearestSubDist } = pickNearestSubcontractor(subs, job.client_lat, job.client_lng)

      if (isBeyondMaxKm(maxKm, nearestSubDist)) {
        supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
        return new Response(JSON.stringify({ success: true, skipped: 'nearest_beyond_max_km' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }

      // Atomically claim the job before assigning/notifying — without this,
      // two overlapping invocations for the same job (e.g. the trigger's
      // net.http_post retrying, or a duplicate delivery) could both read
      // technician_id as null and both proceed, double-booking two
      // different subcontractors/technicians onto the same job. Same
      // claim-before-write pattern as chase-unpaid-invoices (fixed
      // 2026-09-24).
      const { data: subClaimed, error: subClaimErr } = await supabase
        .from('jobs')
        .update({ assigned_subcontractor_id: nearestSub!.id })
        .eq('id', job.id)
        .is('technician_id', null)
        .is('assigned_subcontractor_id', null)
        .select('id')
      if (subClaimErr) throw subClaimErr
      if (!subClaimed || subClaimed.length === 0) {
        supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
        return new Response(JSON.stringify({ success: true, skipped: 'already_assigned' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({
          businessId: job.business_id,
          text: `🚚 No technician was free — auto-dispatched subcontractor *${nearestSub!.name}* to job for *${job.client_name || 'client'}*.`,
        }),
      }).catch(() => {})
      await fetch(`${supabaseUrl}/functions/v1/run-custom-workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({
          businessId: job.business_id,
          event: 'job.assigned',
          payload: { client_name: job.client_name, client_address: job.client_address, technician_name: nearestSub!.name },
        }),
      }).catch(() => {})
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, assigned_subcontractor_to: nearestSub!.id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { nearest, nearestDist } = pickNearestTechnician(free, job.client_lat, job.client_lng)

    if (isBeyondMaxKm(maxKm, nearestDist)) {
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'nearest_beyond_max_km' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Atomically claim the job before assigning/notifying — see the
    // subcontractor branch above for why (double-booking risk on
    // overlapping invocations for the same job).
    const { data: techClaimed, error: techClaimErr } = await supabase
      .from('jobs')
      .update({ technician_id: nearest!.id })
      .eq('id', job.id)
      .is('technician_id', null)
      .is('assigned_subcontractor_id', null)
      .select('id')
    if (techClaimErr) throw techClaimErr
    if (!techClaimed || techClaimed.length === 0) {
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'already_assigned' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    await supabase.from('technicians').update({ current_job_id: job.id }).eq('id', nearest!.id)

    await fetch(`${supabaseUrl}/functions/v1/send-job-assignment-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ jobId: job.id, technicianId: nearest!.id }),
    }).catch(() => {})

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        businessId: job.business_id,
        text: `🚚 Auto-dispatched *${nearest!.name}* to job for *${job.client_name || 'client'}*.`,
      }),
    }).catch(() => {})

    await fetch(`${supabaseUrl}/functions/v1/run-custom-workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        businessId: job.business_id,
        event: 'job.assigned',
        payload: { client_name: job.client_name, client_address: job.client_address, technician_name: nearest!.name },
      }),
    }).catch(() => {})

    supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, assigned_to: nearest!.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('auto-assign-technician error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      createClient(supabaseUrl, supabaseServiceKey)
        .rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
