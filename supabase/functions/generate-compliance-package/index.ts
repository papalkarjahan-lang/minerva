// Supabase Edge Function: generate-compliance-package
// Trade-sector counterpart to package-client-verification (the industrial
// sector's "Closer") — assembles evidence already in the database for one
// completed job into a single packaged, human-reviewable compliance
// document: checklist results + photo verification status, materials
// used, the assigned technician's on-file credentials, and the invoice.
// Human-click only: { jobId }, called from DispatcherView once a job is
// complete.
//
// IMPORTANT BOUNDARY: this assembles and stores evidence for a HUMAN to
// review and send on to whoever needs it (a client, an insurer, a WorkSafe
// inspector) — it never emails, submits, or lodges anything automatically,
// and never contacts a regulator on its own. sent_at/sent_to are only ever
// set by a dispatcher clicking "Mark sent" after they've actually sent it
// themselves, exactly like package-client-verification's own evidence-only
// scope and like verify-checklist-photos being an evidence-keeper, never a
// gate. This function has no ability to alter a job, invoice, or
// credential — read-only against every table except its own insert.
//
// Deploy with the multipart /functions/deploy Supabase Management API
// (no CLI in this project — see minerva_supabase_function_deploy_method
// memory).
//
// Kill-switch/health wiring added 2026-09-23: this was never registered in
// agent_functions at all, despite being the exact trade-sector twin of
// package-client-verification (which was already registered/gated) —
// found via a directory-vs-agent_functions diff. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'generate-compliance-package').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { jobId } = await req.json()
    if (!jobId) throw new Error('jobId is required')

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, business_id, client_name, client_address, technician_id, status, completed_at, checklist_results, ai_verified_at')
      .eq('id', jobId)
      .maybeSingle()
    if (jobErr || !job) throw new Error('Job not found')

    const [{ data: photos }, { data: materials }, { data: invoice }, credentialsResult] = await Promise.all([
      supabase.from('checklist_photos').select('checklist_item, storage_path, verification_status, verification_notes, created_at').eq('job_id', jobId),
      supabase.from('job_materials').select('item_name, quantity_used, created_at').eq('job_id', jobId),
      supabase.from('invoices').select('id, total, status, paid_at, line_items').eq('job_id', jobId).maybeSingle(),
      job.technician_id
        ? supabase.from('technician_credentials').select('credential_type, credential_name, expiry_date').eq('technician_id', job.technician_id)
        : Promise.resolve({ data: [] }),
    ])
    const credentials = credentialsResult.data

    const checklistItems = Array.isArray(job.checklist_results) ? job.checklist_results : []
    const completedCount = checklistItems.filter((c: { checked?: boolean }) => c.checked).length
    const flaggedPhotos = (photos || []).filter(p => p.verification_status === 'flagged').length

    const summary = `Job for ${job.client_name || 'client'} at ${job.client_address || 'address on file'} — ` +
      `${completedCount}/${checklistItems.length} checklist item${checklistItems.length === 1 ? '' : 's'} completed, ` +
      `${(photos || []).length} photo${(photos || []).length === 1 ? '' : 's'} on file` +
      `${flaggedPhotos > 0 ? ` (${flaggedPhotos} flagged for review)` : ''}, ` +
      `${(materials || []).length} material line${(materials || []).length === 1 ? '' : 's'} logged, ` +
      `${(credentials || []).length} technician credential${(credentials || []).length === 1 ? '' : 's'} on file. ` +
      (job.ai_verified_at ? 'AI-verified against checklist photos.' : 'Not yet AI-verified.')

    const evidence = {
      job: { id: job.id, status: job.status, completed_at: job.completed_at, checklist_results: checklistItems, ai_verified_at: job.ai_verified_at },
      checklist_photos: photos || [],
      materials_used: materials || [],
      technician_credentials: credentials || [],
      invoice: invoice || null,
    }

    const { data: pkg, error: insErr } = await supabase.from('compliance_packages').insert({
      job_id: jobId,
      business_id: job.business_id,
      summary,
      evidence,
    }).select().single()
    if (insErr) throw insErr

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ businessId: job.business_id, text: `📋 Compliance package assembled for job ${job.client_name || jobId} — review and send it on from the Jobs tab.` }),
    }).catch(() => {})

    supabase.rpc('record_agent_run', { fn_name: 'generate-compliance-package', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, packageId: pkg.id, summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('generate-compliance-package error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'generate-compliance-package', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
