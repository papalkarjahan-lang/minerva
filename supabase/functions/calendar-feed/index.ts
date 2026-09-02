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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function icsEscape(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function toIcsDate(dateStr: string): string {
  // ICS wants UTC timestamps as YYYYMMDDTHHMMSSZ
  return new Date(dateStr).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const url = new URL(req.url)
    const businessId = url.searchParams.get('businessId')
    if (!businessId) {
      return new Response('Missing businessId', { status: 400 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
    return new Response('Internal error', { status: 500 })
  }
})
