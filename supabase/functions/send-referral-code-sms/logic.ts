// Pure logic extracted from send-referral-code-sms/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

// Same alphabet/approach as src/utils.js generatePin()/generateReferralCode()
// — reimplemented here since edge functions can't import from src/.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

export function generateReferralCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return code
}
