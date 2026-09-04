// Supabase Edge Function: track-review-click
// Public, unauthenticated GET redirect endpoint — clicked directly from an
// SMS link on the client's own phone, which has no Supabase auth session,
// so this MUST be deployed with --no-verify-jwt (same category as
// xero-oauth-connect/callback and calendar-feed).
// URL: /functions/v1/track-review-click?id=<review_requests.id>
// Records the first click (clicked_at, only ever set once) then 302s to
// the business's real Google review link. If the id is invalid or the
// business's review link was since cleared, falls back to a plain text
// response rather than redirecting somewhere broken.
// Deploy with: supabase functions deploy track-review-click --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  if (!id) return new Response('Missing id', { status: 400 })

  const { data: reviewReq } = await supabase.from('review_requests').select('*, businesses(google_review_link)').eq('id', id).maybeSingle()
  const reviewLink = (reviewReq as any)?.businesses?.google_review_link

  if (!reviewReq || !reviewLink) {
    return new Response('This review link is no longer available.', { status: 404, headers: { 'Content-Type': 'text/plain' } })
  }

  if (!reviewReq.clicked_at) {
    await supabase.from('review_requests').update({ clicked_at: new Date().toISOString() }).eq('id', id)
  }

  return new Response(null, { status: 302, headers: { Location: reviewLink } })
})
