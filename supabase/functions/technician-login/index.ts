// Supabase Edge Function: technician-login
// Deploy with: supabase functions deploy technician-login
//
// Exchanges a technician's PIN (the credential they've always used, from
// the SMS link `?pin=...`) for a REAL Supabase Auth session, so that
// `auth.uid()` exists for every subsequent request the technician's phone
// makes — unlocking RLS write-scoping on technicians/jobs/technician_
// locations/invoices/checklist_photos/job_materials/technician_credentials/
// technician_incidents/job_assignments/inventory_items (see
// supabase_schema_delta_technician_auth_rls_v1.sql).
//
// The PIN itself is unchanged — same low-friction, no-password UX, same
// SMS link. This function just mints a session behind it instead of the
// frontend trusting a bare `.eq('pin', pin)` row match with no session at
// all.
//
// How it works:
//   1. Look up the technician by PIN (service_role — RLS doesn't apply,
//      and this lookup has to happen BEFORE any session exists anyway).
//   2. If this technician has never logged in before, create a synthetic
//      Supabase Auth user for them — email `tech-<technician.id>@
//      technicians.minerva.internal` (never a real inbox, never emailed
//      anywhere), confirmed immediately (email_confirm: true) since
//      there's no real email to verify. Store the new auth user's id back
//      onto the technician row.
//   3. Call `admin.generateLink({ type: 'magiclink', ... })` to get a
//      token_hash WITHOUT sending any email (email delivery is skipped —
//      we hand the hash straight back over HTTPS instead of through an
//      inbox this address can't receive anyway).
//   4. Return { token_hash } to the frontend, which calls
//      `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`
//      itself to establish the real session client-side. This function
//      never sees or returns a JWT/session directly — verifyOtp is what
//      actually mints it, in the technician's own browser.
//
// Deployed WITHOUT --no-verify-jwt like the rest — callers pass
// Authorization: Bearer <anon key> (the technician has no session yet at
// this point, so it can only ever be the anon key).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface LoginPayload {
  pin: string
}

function syntheticEmail(technicianId: string): string {
  return `tech-${technicianId}@technicians.minerva.internal`
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { pin }: LoginPayload = await req.json()
    if (!pin || typeof pin !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing pin' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: tech, error: techErr } = await supabase
      .from('technicians')
      .select('id, auth_user_id, is_active')
      .eq('pin', pin)
      .eq('is_active', true)
      .single()

    if (techErr || !tech) {
      // Same message as before this change — don't reveal whether the PIN
      // exists but is inactive vs. doesn't exist at all.
      return new Response(JSON.stringify({ error: 'PIN not recognised. Contact your manager.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const email = syntheticEmail(tech.id)

    if (!tech.auth_user_id) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { technician_id: tech.id, role: 'technician' },
      })
      if (createErr || !created?.user) {
        console.error('technician-login: createUser failed', createErr)
        throw new Error('Could not create technician session')
      }
      const { error: linkErr } = await supabase
        .from('technicians')
        .update({ auth_user_id: created.user.id })
        .eq('id', tech.id)
      if (linkErr) {
        console.error('technician-login: failed to link auth_user_id', linkErr)
        throw new Error('Could not create technician session')
      }
    }

    const { data: linkData, error: genErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (genErr || !linkData?.properties?.hashed_token) {
      console.error('technician-login: generateLink failed', genErr)
      throw new Error('Could not create technician session')
    }

    return new Response(JSON.stringify({ token_hash: linkData.properties.hashed_token }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('technician-login error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
