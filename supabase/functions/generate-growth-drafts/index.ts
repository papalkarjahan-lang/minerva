// Supabase Edge Function: generate-growth-drafts
// Autonomous agent, run weekly via pg_cron. Growth pillar (Sales & Marketing) —
// the ONE pillar the user explicitly required human confirmation on before
// anything goes out. This function only ever WRITES DRAFTS (status='pending')
// into marketing_drafts — it never spends money and never sends a message.
// Actually launching an ad campaign (launch-ad-campaign) or sending an
// outreach SMS (send-growth-message) only happens when a human clicks
// "Approve" in the dispatcher's Marketing tab.
//
// Two draft types per Pro-tier business, at most one of each per run:
//  - ad_campaign: suggests a Meta ad targeting the suburb generating the
//    most completed jobs in the last 90 days, with an AI-written headline/
//    body and a conservative suggested daily budget.
//  - outreach_sms: a "win-back" message for leads that were quoted but went
//    cold (status still 'contacted'/'quoted', created 14+ days ago —
//    leads have no updated_at column, so age is measured from creation).
//    Recipients are pulled ONLY from this business's own leads table —
//    existing contacts who already engaged with the business, never a
//    purchased/scraped list — same "existing relationship" scope as
//    nurture-stale-leads and retention-checkin, just a different segment
//    (near-miss quotes rather than brand-new leads or past clients).
//
// Deploy with: supabase functions deploy generate-growth-drafts
// Required secrets: ANTHROPIC_API_KEY (same as ai-intake-chat)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CLAUDE_MODEL = 'claude-opus-4-6'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'generate-growth-drafts').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, name, trade_type, city')
      .eq('subscription_tier', 'pro')
    if (error) throw error

    let drafted = 0

    for (const biz of businesses || []) {
      // Skip if this business already has an unreviewed draft of either type
      // sitting in the queue — don't bury the owner in a growing backlog
      // they haven't gotten to yet.
      const { count: pendingCount } = await supabase
        .from('marketing_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)
        .eq('status', 'pending')
      if ((pendingCount ?? 0) >= 2) continue

      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentJobs } = await supabase
        .from('jobs')
        .select('client_address')
        .eq('business_id', biz.id)
        .eq('status', 'complete')
        .gte('completed_at', ninetyDaysAgo)

      const suburbCounts: Record<string, number> = {}
      for (const j of recentJobs || []) {
        const suburb = (j.client_address || '').split(',').pop()?.trim() || j.client_address
        if (!suburb) continue
        suburbCounts[suburb] = (suburbCounts[suburb] || 0) + 1
      }
      const rankedSuburbs = Object.entries(suburbCounts).sort((a, b) => b[1] - a[1])
      const topSuburb = rankedSuburbs[0]

      // Audience-opportunity insight (Marketing agent, added Phase 3) — no
      // Claude call involved, so unlike the two drafts below this runs
      // regardless of whether ANTHROPIC_API_KEY is configured. Surfaces the
      // 2nd-highest suburb by completed-job count IF it hasn't already had a
      // targeted ad_campaign draft in the last 90 days — purely informational,
      // written to agent_insights for a human to notice. Never creates a new
      // marketing_drafts row itself (the existing "max 2 pending drafts" cap
      // below is untouched).
      if (rankedSuburbs.length >= 2) {
        const [secondSuburbName, secondJobCount] = rankedSuburbs[1]
        const { count: priorSecondSuburbDraftCount } = await supabase
          .from('marketing_drafts')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', biz.id)
          .eq('type', 'ad_campaign')
          .eq('target_suburb', secondSuburbName)
          .gte('created_at', ninetyDaysAgo)

        if ((priorSecondSuburbDraftCount ?? 0) === 0) {
          await supabase.from('agent_insights').insert({
            agent: 'marketing',
            insight_type: 'suggestion',
            summary: `${secondSuburbName} is your 2nd-highest suburb by completed jobs (${secondJobCount} in 90 days) but has never had a targeted ad — worth considering once you've reviewed the current draft.`,
            business_id: biz.id,
            related_table: 'businesses',
            related_id: biz.id,
          }).then(() => {}, (insErr) => console.error('generate-growth-drafts: audience-opportunity insight failed', insErr))
        }
      }

      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const { data: coldLeads } = await supabase
        .from('leads')
        .select('id, client_name, client_phone, job_description')
        .eq('business_id', biz.id)
        .in('status', ['contacted', 'quoted'])
        .lt('created_at', fourteenDaysAgo)
        .not('client_phone', 'is', null)
        .limit(20)

      if (!topSuburb && (!coldLeads || coldLeads.length === 0)) continue // nothing worth drafting this week
      if (!ANTHROPIC_API_KEY) continue // can't write copy without Claude — skip silently, logged below

      // Draft 1: ad campaign, only if we have a clear top suburb.
      if (topSuburb) {
        const [suburbName, jobCount] = topSuburb
        try {
          const { copy, qualityNotes } = await draftAndReview(ANTHROPIC_API_KEY, {
            kind: 'ad',
            bizName: biz.name,
            tradeType: biz.trade_type || 'trade services',
            context: `This business completed ${jobCount} jobs in ${suburbName} in the last 90 days — their busiest area.`,
          })
          await supabase.from('marketing_drafts').insert({
            business_id: biz.id,
            type: 'ad_campaign',
            headline: copy.headline,
            body_text: copy.body,
            rationale: `${jobCount} completed jobs in ${suburbName} over the last 90 days — your busiest suburb. A targeted ad here reaches people already in your strongest area.`,
            target_suburb: suburbName,
            target_radius_km: 10,
            daily_budget: 15,
            platform: 'meta',
            quality_notes: qualityNotes,
          })
          drafted++
        } catch (err) {
          console.error('generate-growth-drafts: ad copy failed', err)
        }
      }

      // Draft 2: win-back SMS for cold quoted leads.
      if (coldLeads && coldLeads.length > 0) {
        try {
          const { copy, qualityNotes } = await draftAndReview(ANTHROPIC_API_KEY, {
            kind: 'sms',
            bizName: biz.name,
            tradeType: biz.trade_type || 'trade services',
            context: `${coldLeads.length} leads were quoted but haven't booked in 2+ weeks.`,
          })
          await supabase.from('marketing_drafts').insert({
            business_id: biz.id,
            type: 'outreach_sms',
            body_text: copy.body,
            rationale: `${coldLeads.length} lead(s) were quoted more than 14 days ago and never booked. A short check-in SMS can recover some of these before they go elsewhere.`,
            recipients: coldLeads.map(l => ({ name: l.client_name, phone: l.client_phone })),
            platform: 'twilio',
            quality_notes: qualityNotes,
          })
          drafted++
        } catch (err) {
          console.error('generate-growth-drafts: sms copy failed', err)
        }
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'generate-growth-drafts', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, businessesChecked: (businesses || []).length, drafted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('generate-growth-drafts error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'generate-growth-drafts', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function draftCopy(
  apiKey: string,
  opts: { kind: 'ad' | 'sms'; bizName: string; tradeType: string; context: string }
): Promise<{ headline?: string; body: string }> {
  const systemPrompt = opts.kind === 'ad'
    ? `You write short, honest Meta ad copy for Australian trade businesses. Respond with ONLY raw JSON, no markdown: {"headline": "...", "body": "..."}. Headline under 40 characters, body under 125 characters. No exaggerated claims, no fake urgency, no emojis. Plain, trustworthy tone.`
    : `You write short SMS win-back messages for Australian trade businesses reaching out to a lead who was quoted but hasn't booked. Respond with ONLY raw JSON, no markdown: {"body": "..."}. Under 300 characters, low-pressure, no fake urgency, no emojis, include a soft call to action. Do not fabricate a discount or offer unless told to.`

  const userMsg = `Business: ${opts.bizName} (${opts.tradeType}). Context: ${opts.context}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
  if (!textBlock) throw new Error('No text response from Claude')
  return JSON.parse(textBlock.text)
}

// Drafts copy, then runs a second, independent Claude pass to review it
// against the same honesty/tone rules given to the drafter — catches cases
// where the drafter itself drifts (fabricated urgency, an implied discount
// that was never offered, an inconsistency with the stated context, or
// copy that just runs over the length limit). If review fails, one revision
// attempt is made with the reviewer's notes folded in; whatever comes out
// of that is used regardless (this is a quality pass, not a second approval
// gate — the human Approve click in the Marketing tab remains the only
// thing that can ever launch/send).
async function draftAndReview(
  apiKey: string,
  opts: { kind: 'ad' | 'sms'; bizName: string; tradeType: string; context: string }
): Promise<{ copy: { headline?: string; body: string }; qualityNotes: string }> {
  let copy = await draftCopy(apiKey, opts)
  let review = await reviewCopy(apiKey, opts.kind, copy, opts.context)

  if (!review.approved) {
    try {
      copy = await draftCopy(apiKey, {
        ...opts,
        context: `${opts.context} A previous draft was rejected on review for this reason: "${review.notes}". Fix that specific issue.`,
      })
      review = await reviewCopy(apiKey, opts.kind, copy, opts.context)
    } catch (err) {
      console.error('generate-growth-drafts: revision pass failed, using first draft', err)
    }
  }

  return { copy, qualityNotes: review.notes }
}

async function reviewCopy(
  apiKey: string,
  kind: 'ad' | 'sms',
  copy: { headline?: string; body: string },
  context: string
): Promise<{ approved: boolean; notes: string }> {
  const limits = kind === 'ad'
    ? 'headline must be under 40 characters, body under 125 characters'
    : 'body must be under 300 characters'

  const systemPrompt = `You are a strict compliance reviewer for marketing copy written for Australian trade businesses. Check the draft against: (1) no fabricated urgency or scarcity, (2) no discount, offer, or guarantee that isn't stated in the given context, (3) factually consistent with the given context, (4) ${limits}, (5) no emojis, (6) plain, trustworthy tone with no exaggerated claims. Respond with ONLY raw JSON, no markdown: {"approved": true|false, "notes": "one short sentence explaining your verdict"}.`

  const userMsg = `Context the copy was based on: ${context}\n\nDraft to review: ${JSON.stringify(copy)}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
  if (!textBlock) throw new Error('No text response from Claude')
  return JSON.parse(textBlock.text)
}
