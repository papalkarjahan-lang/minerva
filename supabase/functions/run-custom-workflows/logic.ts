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
    case 'gte': return Number(actual) >= Number(value)
    case 'lte': return Number(actual) <= Number(value)
    case 'contains': return String(actual).toLowerCase().includes(String(value || '').toLowerCase())
    default: return true
  }
}

// Whole days elapsed since createdAt, as of nowIso — used by the
// 'invoice.overdue' cron sweep (index.ts) to both pick which unpaid
// invoices qualify and to populate payload.days_overdue for a workflow's
// own condition (e.g. "only Slack me if days_overdue > 7").
export function daysOverdue(createdAtIso: string, nowIso: string): number {
  const ms = new Date(nowIso).getTime() - new Date(createdAtIso).getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}
