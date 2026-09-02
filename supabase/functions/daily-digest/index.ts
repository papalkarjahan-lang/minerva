// Supabase Edge Function: daily-digest
// Autonomous agent, run daily via pg_cron (see supabase_schema.sql).
// Posts a Slack summary of the last 24 hours for every business that has a
// slack_webhook_url configured. Richer than the old weekly-digest: alongside
// jobs/leads/invoicing, it also surfaces the business's top suburb by jobs
// completed, average invoice value, and anything currently waiting on the
// owner's attention (pending marketing drafts, low-stock inventory items) —
// so the digest doubles as a daily "here's what needs a look" nudge, not
// just a activity count.
// Also flags "silent automation" cases — a lead that got both autonomous
// nurture touches (nurture-stale-leads) and is still 'new', or an invoice
// that's had 3+ reminder sends (chase-unpaid-invoices) and is still unpaid.
// In both cases the automation clearly isn't landing, so this stops being
// something the software quietly keeps retrying forever and becomes
// something a human is explicitly told about — flagged once via
// escalation_flagged_at so it doesn't repeat in every digest thereafter.
// Businesses without Slack configured are skipped entirely (no other
// notification channel exists for this digest — it's Slack-only by
// design, since there's no dispatcher email/login to send it to).
// Formatted as a "morning meeting" — grouped by named department (Front
// Desk, Dispatch & Crew, Ledger, Watchtower) rather than one flat block —
// same underlying data, just organized like a standup report each
// department is giving the owner, matching the rest of the agent-domain
// naming used across the system (2026-09-01).
// Deploy with: supabase functions deploy daily-digest

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

    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, name, slack_webhook_url')
      .not('slack_webhook_url', 'is', null)
    if (error) throw error

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let posted = 0

    for (const biz of businesses || []) {
      const [
        { data: completedJobs },
        { data: newLeads },
        { data: invoices },
        { data: pendingDrafts },
        { data: lowStockItems },
        { data: silentLeads },
        { data: stuckInvoices },
      ] = await Promise.all([
        supabase.from('jobs').select('id, client_address').eq('business_id', biz.id).eq('status', 'complete').gte('completed_at', dayAgo),
        supabase.from('leads').select('id').eq('business_id', biz.id).gte('created_at', dayAgo),
        supabase.from('invoices').select('total, status').eq('business_id', biz.id).gte('created_at', dayAgo),
        supabase.from('marketing_drafts').select('id').eq('business_id', biz.id).eq('status', 'pending'),
        supabase.from('inventory_items').select('id').eq('business_id', biz.id).not('low_stock_alert_sent_at', 'is', null),
        // Both autonomous nurture touches sent, lead still untouched by a human — the
        // automation has done everything it can, this needs a person now.
        supabase.from('leads').select('id, client_name').eq('business_id', biz.id).eq('status', 'new')
          .not('second_nurture_sent_at', 'is', null).is('escalation_flagged_at', null),
        // 3+ reminder SMS sent, still unpaid — automation is clearly not landing.
        supabase.from('invoices').select('id, client_name, total').eq('business_id', biz.id).eq('status', 'unpaid')
          .gte('reminder_count', 3).is('escalation_flagged_at', null),
      ])

      const jobsDone = completedJobs?.length || 0
      const leadsIn = newLeads?.length || 0
      const invoiced = (invoices || []).reduce((sum, i) => sum + Number(i.total || 0), 0)
      const unpaid = (invoices || []).filter(i => i.status === 'unpaid').reduce((sum, i) => sum + Number(i.total || 0), 0)
      const avgInvoice = (invoices && invoices.length > 0) ? invoiced / invoices.length : 0

      const suburbCounts: Record<string, number> = {}
      for (const j of completedJobs || []) {
        const suburb = (j.client_address || '').split(',').pop()?.trim()
        if (!suburb) continue
        suburbCounts[suburb] = (suburbCounts[suburb] || 0) + 1
      }
      const topSuburb = Object.entries(suburbCounts).sort((a, b) => b[1] - a[1])[0]

      const pendingDraftsCount = pendingDrafts?.length || 0
      const lowStockCount = lowStockItems?.length || 0
      const silentLeadsCount = silentLeads?.length || 0
      const stuckInvoicesCount = stuckInvoices?.length || 0

      // Skip a genuinely quiet day — no point pinging an empty digest.
      if (jobsDone === 0 && leadsIn === 0 && invoiced === 0 && pendingDraftsCount === 0 &&
          lowStockCount === 0 && silentLeadsCount === 0 && stuckInvoicesCount === 0) continue

      // "Morning Meeting" format: grouped like reports from named departments
      // instead of one flat block, so it reads as a standup, not a log dump.
      // Same underlying data as before — this is presentation, not new logic.
      let text = `🗓️ *Morning meeting — ${biz.name}*\n` +
        `_The last 24 hours, department by department._\n\n` +
        `*Front Desk* (leads & customer contact)\n` +
        `• New leads: ${leadsIn}\n\n` +
        `*Dispatch & Crew* (jobs & technicians)\n` +
        `• Jobs completed: ${jobsDone}${topSuburb ? ` (top suburb: ${topSuburb[0]}, ${topSuburb[1]} job${topSuburb[1] === 1 ? '' : 's'})` : ''}\n\n` +
        `*Ledger* (invoicing & finance)\n` +
        `• Invoiced: $${invoiced.toFixed(2)}${avgInvoice > 0 ? ` (avg $${avgInvoice.toFixed(2)}/invoice)` : ''}${unpaid > 0 ? ` — $${unpaid.toFixed(2)} still unpaid` : ''}`

      const waitingOn: string[] = []
      if (pendingDraftsCount > 0) waitingOn.push(`${pendingDraftsCount} marketing draft${pendingDraftsCount === 1 ? '' : 's'} awaiting your review`)
      if (lowStockCount > 0) waitingOn.push(`${lowStockCount} low-stock item${lowStockCount === 1 ? '' : 's'}`)
      if (waitingOn.length > 0) text += `\n\n*Waiting on your approval*\n• ${waitingOn.join('\n• ')}`

      // Watchtower: silent-automation flags — the software has done everything
      // it autonomously can, surface these explicitly so nothing sits
      // assumed-handled forever.
      if (silentLeadsCount > 0 || stuckInvoicesCount > 0) {
        text += `\n\n*Watchtower* (needs a human)`
        if (silentLeadsCount > 0) {
          const names = (silentLeads || []).slice(0, 3).map(l => l.client_name || 'unknown').join(', ')
          text += `\n⚠️ ${silentLeadsCount} lead${silentLeadsCount === 1 ? '' : 's'} gone quiet after both nurture texts — no reply, still 'new': ${names}${silentLeadsCount > 3 ? ', ...' : ''}. Worth a personal follow-up.`
        }
        if (stuckInvoicesCount > 0) {
          const names = (stuckInvoices || []).slice(0, 3).map(i => `${i.client_name || 'unknown'} ($${Number(i.total).toFixed(2)})`).join(', ')
          text += `\n⚠️ ${stuckInvoicesCount} invoice${stuckInvoicesCount === 1 ? '' : 's'} still unpaid after 3+ reminders: ${names}${stuckInvoicesCount > 3 ? ', ...' : ''}. Automated reminders aren't working here — may need a call.`
        }
      }

      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: biz.id, text }),
      }).catch(err => console.error('daily-digest: notify-slack failed', err))
      posted++

      // Mark flagged rows so the same silent lead/invoice isn't re-listed every day —
      // it's been surfaced once, that's the point.
      if (silentLeadsCount > 0) {
        await supabase.from('leads').update({ escalation_flagged_at: new Date().toISOString() })
          .in('id', (silentLeads || []).map(l => l.id))
      }
      if (stuckInvoicesCount > 0) {
        await supabase.from('invoices').update({ escalation_flagged_at: new Date().toISOString() })
          .in('id', (stuckInvoices || []).map(i => i.id))
      }
    }

    return new Response(JSON.stringify({ success: true, businesses: (businesses || []).length, posted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('daily-digest error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
