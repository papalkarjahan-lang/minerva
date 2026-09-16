// Pure logic extracted from run-custom-workflows/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

export function matchesCondition(
  payload: Record<string, any>,
  field: string | null,
  op: string | null,
  value: string | null
): boolean {
  if (!field || !op) return true // no condition set = always match
  const actual = payload?.[field]
  if (actual === undefined || actual === null) return false

  switch (op) {
    case 'eq': return String(actual) === String(value)
    case 'neq': return String(actual) !== String(value)
    case 'gt': return Number(actual) > Number(value)
    case 'lt': return Number(actual) < Number(value)
    case 'contains': return String(actual).toLowerCase().includes(String(value || '').toLowerCase())
    default: return true
  }
}
