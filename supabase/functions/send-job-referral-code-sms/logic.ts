// Pure logic extracted from send-job-referral-code-sms/index.ts so it can be
// unit-tested with Vitest — same split as every other logic.ts file in this
// repo (Deno edge functions can't be imported into Node/Vitest directly).

// Same alphabet/approach as send-referral-code-sms/logic.ts — duplicated
// rather than imported across function directories (no precedent for that
// in this repo; every cross-function import goes through _shared/, and
// this is 8 lines of stable, already-proven logic, same tradeoff that
// function's own header already made for src/utils.js).
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export function generateReferralCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return code
}

// Pro-tier businesses already get a working referral loop from
// send-referral-code-sms, triggered when they mark an on-site invoice
// paid. Firing this job-completion trigger for them too would text the
// same client two different codes for the same job (one at completion,
// one later at invoice-paid) — so this skips exactly the one tier that
// already has a working path, not the other way around.
export function shouldSkipForTier(subscriptionTier: string | null | undefined): boolean {
  return subscriptionTier === 'pro'
}
