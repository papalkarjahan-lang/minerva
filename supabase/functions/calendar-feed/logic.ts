// Pure logic extracted from calendar-feed/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

export function icsEscape(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function toIcsDate(dateStr: string): string {
  // ICS wants UTC timestamps as YYYYMMDDTHHMMSSZ
  return new Date(dateStr).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}
