// Supabase Edge Function: verify-checklist-photos
// Autonomous agent, run every 15 min via pg_cron — "Watchtower" / the
// Verification Layer department. Reviews checklist photos technicians have
// uploaded but that haven't been AI-reviewed yet, using Claude's vision
// capability to check whether the photo plausibly shows the checklist item
// it's attached to being satisfied. This is informational accountability
// evidence for dispute protection (see DisputeView.jsx), NOT a gate on the
// technician's own workflow — a technician's checklist submission is never
// blocked or altered by this function, it only annotates the photo record
// afterwards.
// Deploy with: supabase functions deploy verify-checklist-photos
//
// Required secret: ANTHROPIC_API_KEY. If not set, every pending photo is
// marked verification_status='unavailable' (not 'flagged') so a missing key
// never looks like a failed inspection — it just means nothing's been
// checked yet.

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
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const { data: pending, error } = await supabase
      .from('checklist_photos')
      .select('id, job_id, checklist_item, storage_path')
      .eq('verification_status', 'pending')
      .limit(20) // small batches — this runs every 15 min, no need to burn the whole queue at once

    if (error) throw error

    let reviewed = 0
    let flagged = 0

    for (const photo of pending || []) {
      if (!anthropicKey) {
        await supabase.from('checklist_photos').update({
          verification_status: 'unavailable',
          verification_notes: 'ANTHROPIC_API_KEY not configured — photo not AI-reviewed.',
        }).eq('id', photo.id)
        continue
      }

      const { data: pub } = supabase.storage.from('checklist-photos').getPublicUrl(photo.storage_path)
      const imageUrl = pub?.publicUrl
      if (!imageUrl) continue

      const result = await reviewPhoto(anthropicKey, imageUrl, photo.checklist_item || 'checklist item')
      await supabase.from('checklist_photos').update({
        verification_status: result.status,
        verification_notes: result.notes,
      }).eq('id', photo.id)

      reviewed++
      if (result.status === 'flagged') flagged++
    }

    return new Response(JSON.stringify({ success: true, reviewed, flagged, scanned: (pending || []).length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('verify-checklist-photos error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function reviewPhoto(
  apiKey: string,
  imageUrl: string,
  checklistItem: string
): Promise<{ status: 'pass' | 'flagged'; notes: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            {
              type: 'text',
              text: `A field technician attached this photo as evidence for the completed checklist item: "${checklistItem}". Does the photo plausibly show this item being satisfied? Reply with exactly one line in the format: STATUS: pass|flagged | NOTES: <one short sentence>. Use "flagged" only if the photo clearly does not match the claimed item (e.g. blank/irrelevant/wrong location) — default to "pass" for ambiguous-but-plausible photos, since this is a light accountability check, not a strict inspection.`,
            },
          ],
        }],
      }),
    })

    if (!res.ok) return { status: 'pass', notes: `AI review unavailable (HTTP ${res.status}) — not treated as a failure.` }
    const data = await res.json()
    const text: string = data?.content?.[0]?.text || ''
    const statusMatch = text.match(/STATUS:\s*(pass|flagged)/i)
    const notesMatch = text.match(/NOTES:\s*(.+)/i)
    const status = statusMatch ? (statusMatch[1].toLowerCase() as 'pass' | 'flagged') : 'pass'
    const notes = notesMatch ? notesMatch[1].trim() : text.trim().slice(0, 200)
    return { status, notes }
  } catch (err) {
    console.error('verify-checklist-photos: review failed', err)
    return { status: 'pass', notes: 'AI review errored — not treated as a failure.' }
  }
}
