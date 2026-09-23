// Supabase Edge Function: calendar-feed
// Public, unauthenticated ICS (iCalendar) feed of a business's scheduled
// jobs — subscribe to it from Google Calendar / Apple Calendar / Outlook
// via "Add calendar > From URL" and it stays live-synced (those apps poll
// the URL periodically; no push/webhook needed on our side).
// Deploy with: supabase functions deploy calendar-feed --no-verify-jwt
//
// --no-verify-jwt is required: calendar apps fetch this URL directly with
// no Supabase auth header, same reason stripe-webhook and
// missed-call-webhook use it. The businessId in the URL is the only
// "secret" — same unguessable-link trust model as the tracking/dispatch
// links (see SECURITY_NOTES.md). Treat this URL like a secret link.
//
// URL shape: /calendar-feed?businessId=<uuid>
//
// Health/kill-switch wiring added 2026-09-23: this was registered in
// agent_functions but never actually checked `enabled` or called
// `record_agent_run`. Same bug class as the sync-technician-billing/
// followup-outreach fix from 2026-09-22. Kept the plain-text response
// convention (not JSON) for the disabled case, since calendar apps expect
// text/calendar or plain text here, not a JSON body.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { icsEscape, toIcsDate } from "./logic.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'calendar-feed').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response('Calendar feed temporarily unavailable', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const url = new URL(req.url)
    const businessId = url.searchParams.get('businessId')
    if (!businessId) {
      return new Response('Missing businessId', { status: 400 })
    }

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', businessId)
      .single()
    if (bizErr || !business) {
      return new Response('Business not found', { status: 404 })
    }

    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, client_name, client_address, status, scheduled_time, notes')
      .eq('business_id', businessId)
      .not('scheduled_time', 'is', null)
      .order('scheduled_time', { ascending: true })

    const now = toIcsDate(new Date().toISOString())
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Minerva//Dispatch Calendar//EN',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${icsEscape(business.name)} — Minerva Jobs`,
      'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
      'X-PUBLISHED-TTL:PT15M',
    ]

    for (const job of jobs || []) {
      const start = toIcsDate(job.scheduled_time)
      // Default 1-hour block since jobs don't have a stored duration.
      const end = toIcsDate(new Date(new Date(job.scheduled_time).getTime() + 60 * 60 * 1000).toISOString())
      lines.push(
        'BEGIN:VEVENT',
        `UID:${job.id}@minerva`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${icsEscape(job.client_name || 'Job')} (${icsEscape(job.status)})`,
        `LOCATION:${icsEscape(job.client_address || '')}`,
        `DESCRIPTION:${icsEscape(job.notes || '')}`,
        'END:VEVENT'
      )
    }

    lines.push('END:VCALENDAR')

    supabase.rpc('record_agent_run', { fn_name: 'calendar-feed', status: 'ok' }).then(() => {}, () => {})

    return new Response(lines.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="minerva.ics"',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('calendar-feed error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'calendar-feed', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response('Internal error', { status: 500 })
  }
})
