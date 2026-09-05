// Supabase Edge Function: launch-ad-campaign
// NOT scheduled — called exactly once, synchronously, when a business owner
// clicks "Approve & Launch" on an ad_campaign draft in the dispatcher's
// Marketing tab. This is the one place in the Growth pillar where real
// money gets committed, so it only ever runs on a direct, in-the-moment
// human click — never from a cron job or any other automated trigger.
//
// Uses each business's OWN Meta (Facebook/Instagram) Marketing API access
// token, ad account id, and page id (set by the business owner in Settings)
// — Minerva never holds or spends from a shared/master ad account. Creates
// a PAUSED campaign + ad set + creative + ad (Meta requires ads to start
// paused unless explicitly activated), then activates it if activate=true
// was passed, giving the owner one more implicit checkpoint if the frontend
// ever wants to default to "review in Meta before going live".
//
// Deploy with: supabase functions deploy launch-ad-campaign
// Required secrets: none beyond the shared SUPABASE_* ones — Meta
// credentials are per-business, stored on the businesses row, not a secret.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const META_API_VERSION = 'v21.0'
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { draftId, activate = true } = await req.json()
    if (!draftId) throw new Error('draftId is required')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: draft, error: draftErr } = await supabase
      .from('marketing_drafts')
      .select('*, businesses(name, meta_access_token, meta_ad_account_id, meta_page_id)')
      .eq('id', draftId)
      .single()
    if (draftErr || !draft) throw new Error('Draft not found')
    if (draft.type !== 'ad_campaign') throw new Error('This draft is not an ad campaign')
    if (draft.status !== 'pending') throw new Error(`Draft already ${draft.status} — refusing to launch twice`)

    // Atomically claim the draft before spending any real ad budget — the
    // check above alone is a time-of-check/time-of-use race (two rapid
    // clicks, or a retried request, could both pass it before either writes
    // a new status). This conditional update only succeeds for whichever
    // request gets there first; a second concurrent request sees 0 rows
    // affected and bails out before ever calling the Meta API.
    const { data: claimed, error: claimErr } = await supabase
      .from('marketing_drafts')
      .update({ status: 'launching' })
      .eq('id', draftId)
      .eq('status', 'pending')
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) throw new Error('Draft already being launched — refusing to launch twice')

    const biz = (draft as any).businesses
    const { meta_access_token: token, meta_ad_account_id: adAccountId, meta_page_id: pageId } = biz || {}
    if (!token || !adAccountId || !pageId) {
      const msg = 'This business has not connected a Meta ad account yet (Settings → Ad account).'
      await supabase.from('marketing_drafts').update({ status: 'failed', error: msg, reviewed_at: new Date().toISOString() }).eq('id', draftId)
      supabase.rpc('record_agent_run', { fn_name: 'launch-ad-campaign', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    try {
      // 1. Campaign (paused — Meta requires this at creation)
      const campaign = await metaPost(`${adAccountId}/campaigns`, token, {
        name: `Minerva — ${draft.headline || biz.name} — ${new Date().toISOString().slice(0, 10)}`,
        objective: 'OUTCOME_LEADS',
        status: 'PAUSED',
        special_ad_categories: [],
      })

      // 2. Ad set — daily budget in AUD cents, radius targeting around the suburb.
      const dailyBudgetCents = Math.round((draft.daily_budget || 15) * 100)
      const adSet = await metaPost(`${adAccountId}/adsets`, token, {
        name: `${draft.target_suburb || 'Local'} radius`,
        campaign_id: campaign.id,
        daily_budget: dailyBudgetCents,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LEAD_GENERATION',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: {
          geo_locations: draft.target_suburb
            ? { custom_locations: [{ radius: draft.target_radius_km || 10, distance_unit: 'kilometer', address_string: `${draft.target_suburb}, Australia` }] }
            : { countries: ['AU'] },
        },
        status: 'PAUSED',
      })

      // 3. Creative
      const creative = await metaPost(`${adAccountId}/adcreatives`, token, {
        name: `Minerva creative — ${draft.headline}`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            message: draft.body_text,
            link: Deno.env.get('APP_URL') || 'https://minervaops.com.au',
            name: draft.headline,
          },
        },
      })

      // 4. Ad — activated only if the owner requested it, otherwise left
      // paused so they can do a final review inside Meta Ads Manager.
      const ad = await metaPost(`${adAccountId}/ads`, token, {
        name: `Minerva ad — ${draft.headline}`,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: activate ? 'ACTIVE' : 'PAUSED',
      })

      await supabase.from('marketing_drafts').update({
        status: 'launched',
        external_campaign_id: campaign.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', draftId)

      supabase.rpc('record_agent_run', { fn_name: 'launch-ad-campaign', status: 'ok' }).then(() => {}, () => {})

      return new Response(JSON.stringify({ success: true, campaignId: campaign.id, adId: ad.id, activated: activate }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    } catch (metaErr) {
      await supabase.from('marketing_drafts').update({ status: 'failed', error: metaErr.message, reviewed_at: new Date().toISOString() }).eq('id', draftId)
      throw metaErr
    }
  } catch (err) {
    console.error('launch-ad-campaign error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'launch-ad-campaign', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function metaPost(path: string, token: string, body: Record<string, unknown>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    params.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  params.set('access_token', token)

  const res = await fetch(`${META_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(`Meta API error at ${path}: ${data.error?.message || res.statusText}`)
  }
  return data
}
