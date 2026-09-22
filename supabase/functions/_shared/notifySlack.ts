// Shared Slack-notify helper used by several autonomous cron functions to
// post a business-scoped alert via the notify-slack edge function.
//
// Real network I/O (not pure computation), so — unlike the rest of
// _shared/ — this isn't unit tested with Vitest; every call site already
// treats it as best-effort (fire-and-forget, swallows its own errors).
export async function notifySlack(
  supabaseUrl: string,
  supabaseServiceKey: string,
  businessId: string,
  text: string
): Promise<void> {
  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
    body: JSON.stringify({ businessId, text }),
  }).catch(() => {})
}
