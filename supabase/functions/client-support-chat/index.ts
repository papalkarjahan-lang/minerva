// Supabase Edge Function: client-support-chat
// A scoped, read-only Q&A/customer-service chat for an EXISTING client —
// the counterpart to ai-intake-chat (which is for prospective clients who
// don't have a job yet). Reached only via a link containing an
// unguessable jobId or invoiceId (e.g. from InvoiceView or TrackingView),
// never a general open inbox. Never initiates contact — purely answers
// questions a client types in, about that one job/invoice they already
// have the link to.
//
// Deliberately narrow and honest:
//  - Read-only. Cannot change a job's status, technician, schedule, or an
//    invoice's amount/paid state. If a client asks to reschedule/cancel/
//    dispute a charge, it says so plainly and tells them how to reach the
//    business directly (business.contact_phone) — it does not attempt to
//    action it.
//  - Scoped to exactly one job OR invoice per request, fetched by its
//    uuid — no ability to browse or query any other client's data, and no
//    free-text lookup by name/phone (which would let one client fish for
//    another's information).
//  - Same honest AI/fallback pattern as ai-intake-chat: without
//    ANTHROPIC_API_KEY, replies with the real fetched facts directly
//    (job status, ETA, invoice total/paid state) rather than losing the
//    feature — no free-text conversational ability in that path, but it
//    never fabricates numbers or statuses either way, since the system
//    prompt requires the model to answer ONLY from the real data block
//    below and to say "I don't have that information" rather than guess.
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY  (optional — see fallback above)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-provided in Edge Function runtime)
//
// Kill-switch/health wiring added 2026-09-23: this was never registered in
// agent_functions at all, despite being the same AI-chat-widget category as
// ai-intake-chat (already registered/gated) — found via a
// directory-vs-agent_functions diff. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isChatRequestTooLarge, trimToFirstUserMessage, buildFallbackReply, ChatMessage } from "./logic.ts"

const CLAUDE_MODEL = 'claude-opus-4-6'
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'client-support-chat').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ reply: "Sorry, this chat isn't available right now — please contact us directly." }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { jobId, invoiceId, messages }: { jobId?: string; invoiceId?: string; messages: ChatMessage[] } = await req.json()
    if ((!jobId && !invoiceId) || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing jobId/invoiceId or messages' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    // Same cost-abuse guard as ai-intake-chat — public, unauthenticated endpoint.
    if (isChatRequestTooLarge(messages)) {
      return new Response(JSON.stringify({ error: 'Message too long or conversation too long for this widget.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Per-job/invoice request-rate limiter (2026-09-16), same mechanism and
    // reasoning as ai-intake-chat — see supabase_schema_delta_rate_limits.sql.
    const { data: withinLimit, error: rlErr } = await supabase.rpc('check_rate_limit', {
      p_key: `support:${jobId || invoiceId}`,
      p_window_seconds: 600,
      p_max_requests: 30,
    })
    if (rlErr) {
      console.error('client-support-chat: rate limit check failed, allowing request through', rlErr)
    } else if (withinLimit === false) {
      return new Response(JSON.stringify({ error: 'Too many requests — please try again in a few minutes.' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Fetch exactly the one record the caller has the id for, plus its
    // business's public contact info — nothing else, and never a list.
    let job: Record<string, unknown> | null = null
    let invoice: Record<string, unknown> | null = null
    let businessId: string | null = null

    if (jobId) {
      const { data } = await supabase
        .from('jobs')
        .select('id, business_id, client_name, status, scheduled_time, started_at, completed_at, estimated_arrival_at, route_sequence, technician_id, technicians(name)')
        .eq('id', jobId)
        .maybeSingle()
      if (!data) return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      job = data
      businessId = data.business_id as string
    }

    if (invoiceId) {
      const { data } = await supabase
        .from('invoices')
        .select('id, business_id, client_name, total, subtotal, gst, status, paid_at, payment_method, job_id')
        .eq('id', invoiceId)
        .maybeSingle()
      if (!data) return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
      invoice = data
      businessId = data.business_id as string
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('id, name, contact_phone, contact_email')
      .eq('id', businessId!)
      .maybeSingle()
    if (!business) throw new Error('Business not found')

    const facts = {
      business_name: business.name,
      business_contact_phone: business.contact_phone || null,
      business_contact_email: business.contact_email || null,
      job: job ? {
        client_name: job.client_name,
        status: job.status,
        scheduled_time: job.scheduled_time,
        started_at: job.started_at,
        completed_at: job.completed_at,
        estimated_arrival_at: job.estimated_arrival_at,
        stop_number_today: job.route_sequence,
        technician_name: (job as { technicians?: { name?: string } }).technicians?.name || null,
      } : null,
      invoice: invoice ? {
        client_name: invoice.client_name,
        total: invoice.total,
        subtotal: invoice.subtotal,
        gst: invoice.gst,
        status: invoice.status,
        paid_at: invoice.paid_at,
        payment_method: invoice.payment_method,
      } : null,
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    let reply: string

    if (!ANTHROPIC_API_KEY) {
      // Deterministic fallback: state the real facts plainly, take no
      // free-text question into account. Honest about the limitation
      // rather than pretending to converse.
      reply = buildFallbackReply(
        { name: business.name as string, contactPhone: business.contact_phone as string | null },
        job ? {
          status: job.status as string,
          technicianName: (job as { technicians?: { name?: string } }).technicians?.name || null,
          estimatedArrivalAt: job.estimated_arrival_at as string | null,
          scheduledTime: job.scheduled_time as string | null,
        } : null,
        invoice ? { total: invoice.total as number, status: invoice.status as string } : null,
      )
    } else {
      const systemPrompt = `You are a customer-service assistant for ${business.name}. You are answering questions from a client about ONE specific job and/or invoice they already have a link to. Here are the only real facts you know — never invent, guess, or assume anything beyond this:

${JSON.stringify(facts, null, 2)}

Rules:
- Answer ONLY using the facts above. If something isn't in there, say you don't have that information and suggest they contact ${business.name} directly${business.contact_phone ? ` on ${business.contact_phone}` : ''}.
- You cannot change, cancel, reschedule, or refund anything. If asked, say so plainly and point them to contacting the business directly.
- Be brief and friendly. This is a text chat widget, not a phone call.
- Never discuss any other client, job, or invoice — you only have access to this one.

Respond with ONLY a JSON object, no markdown fences: {"reply": "<your reply>"}`

      const apiMessages = trimToFirstUserMessage(messages)

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 512,
          thinking: { type: 'adaptive' },
          system: systemPrompt,
          messages: apiMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text()
        throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`)
      }
      const anthropicData = await anthropicRes.json()
      const textBlock = anthropicData.content?.find((b: { type: string }) => b.type === 'text')
      if (!textBlock) throw new Error('No text response from Claude')
      try {
        reply = JSON.parse(textBlock.text).reply
      } catch {
        reply = textBlock.text
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'client-support-chat', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ reply }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  } catch (err) {
    console.error('client-support-chat error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'client-support-chat', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }
})
