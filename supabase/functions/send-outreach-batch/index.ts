// Supabase Edge Function: send-outreach-batch
// The ONLY function that ever sends Minerva's own outbound prospecting
// emails. Direct invocation only, from the admin console's "Send approved"
// button — never on a cron, never automatic. Sends ONLY to
// outreach_prospects rows already at status='approved' (a human explicitly
// reviewed the AI-drafted or hand-written content in the admin console and
// flipped it to approved) — this function will not touch 'new' or
// 'drafted' rows even if asked to, by design, so a bug elsewhere can never
// cause an unreviewed email to go out.
//
// Direct invocation: { prospectIds?: string[] } — if omitted, sends every
// row at status='approved'. Uses send-email (Resend-backed), so this is
// itself a no-op (each send skipped, logged) until RESEND_API_KEY is set —
// consistent with every other email path in this codebase.
//
// Deploy with: supabase functions deploy send-outreach-batch

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json().catch(() => ({}))
    const prospectIds: string[] | undefined = Array.isArray(body.prospectIds) ? body.prospectIds : undefined

    // Hard gate: only ever reads rows already marked 'approved' by a human.
    let query = supabase.from('outreach_prospects').select('*').eq('status', 'approved')
    if (prospectIds) query = query.in('id', prospectIds)
    const { data: prospects, error } = await query
    if (error) throw error

    let sent = 0, skippedNoEmail = 0, failed = 0

    for (const p of prospects || []) {
      if (!p.contact_email) { skippedNoEmail++; continue }

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            to: p.contact_email,
            subject: p.draft_subject || `Quick question for ${p.company_name}`,
            html: `<p>${(p.draft_body || '').split('\n').join('</p><p>')}</p>`,
          }),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || result?.error) throw new Error(result?.error || `send-email returned ${res.status}`)
        if (result?.skipped) {
          // RESEND_API_KEY not configured — documented no-op, not a failure.
          console.warn('send-outreach-batch: send-email skipped (no RESEND_API_KEY) for', p.id)
          continue
        }

        // followup-outreach uses last_followup_sent_at (not sent_at) as the
        // baseline for stage 2/3 timing once at least one follow-up has
        // gone out — sent_at always stays the original first-touch time.
        const updates: Record<string, unknown> = { status: 'sent' }
        if (!p.sent_at) updates.sent_at = new Date().toISOString()
        if ((p.followup_stage || 0) > 0) updates.last_followup_sent_at = new Date().toISOString()
        await supabase.from('outreach_prospects').update(updates).eq('id', p.id)
        sent++
      } catch (err) {
        console.error('send-outreach-batch: send failed for', p.id, err)
        failed++
      }
    }

    return new Response(JSON.stringify({ success: true, sent, skippedNoEmail, failed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-outreach-batch error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
