// Shared ownership-check helper. Extracted (Round 43, 2026-09-24) from the
// isOwner check xero-oauth-connect originally wrote inline for itself on
// 2026-09-08 — that function's header explains why: "this is a public Edge
// Function URL that the client-side route guard [RequireBusinessAuth.jsx]
// can't protect... a forged-callback CSRF risk". The exact same risk turned
// out to apply to every other dispatcher-click-triggered function that
// trusts a caller-supplied quoteId/invoiceId/jobId/businessId with only a
// business-logic or add-on-enabled check and no caller-identity check at
// all — found via a verify_jwt:false audit. See SECURITY_NOTES.md.
//
// A legitimate dispatcher's session JWT is already attached automatically
// by supabase.functions.invoke() (per RequireBusinessAuth.jsx's auth model),
// so wiring this in adds no friction for real usage — it only closes the
// gap for a caller with no Supabase session at all sending a direct/forged
// request.
//
// isOwnerOfBusiness is pure decision logic (unit-testable without a live
// Supabase/Deno runtime); getAuthenticatedCaller does the actual
// auth.getUser() I/O around it.

export interface BusinessOwnership {
  owner_user_id: string | null
  contact_email: string | null
}

// Same rule as RequireBusinessAuth.jsx / xero-oauth-connect: either this
// business already has an owner_user_id matching the caller, or (the
// pre-auth pilot-business auto-claim case) it has no owner yet and the
// caller's own account email matches the business's contact_email.
export function isOwnerOfBusiness(
  business: BusinessOwnership | null | undefined,
  userId: string,
  userEmail: string | null | undefined
): boolean {
  if (!business) return false
  if (business.owner_user_id === userId) return true
  if (!business.owner_user_id && business.contact_email && userEmail &&
      business.contact_email.toLowerCase() === userEmail.toLowerCase()) {
    return true
  }
  return false
}

export interface SupabaseAuthClient {
  auth: {
    getUser(token: string): Promise<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }>
  }
}

// Extracts and validates the caller's Supabase Auth access token from the
// request's Authorization header. Returns null if missing/invalid — never
// throws, so callers can turn a null straight into a 401.
export async function getAuthenticatedCaller(
  req: Request,
  supabase: SupabaseAuthClient
): Promise<{ id: string; email: string | null } | null> {
  const authHeader = req.headers.get('Authorization') || ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!accessToken) return null
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data?.user) return null
  return { id: data.user.id, email: data.user.email || null }
}
