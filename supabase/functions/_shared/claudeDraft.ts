// Shared "ask Claude to draft a short SMS, fall back to a fixed template"
// wrapper used by nurture-stale-leads, winback-lost-leads, retention-checkin,
// and chase-unpaid-invoices. Each of these had the identical fetch/error-
// handling shape (call the Messages API, bail out to the fallback on a
// non-OK response, a thrown error, or a draft that fails the caller's own
// usability check) with only the prompt text and usability predicate
// differing — consolidated here to remove that drift risk (e.g. the model
// name was hardcoded separately in each copy).
//
// Real network I/O (not pure computation), so — like _shared/twilioSms.ts
// and _shared/notifySlack.ts — this isn't unit tested with Vitest; the
// pure prompt-building and usability-check logic that varies per caller
// stays in each function's own logic.ts, which IS tested.
export async function draftSmsWithClaude(
  apiKey: string,
  prompt: string,
  fallback: string,
  isUsable: (text: string) => boolean,
  logPrefix: string,
  maxTokens: number = 150
): Promise<string> {
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
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return fallback
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    if (!isUsable(text)) return fallback
    return text
  } catch (err) {
    console.error(`${logPrefix}: draft failed`, err)
    return fallback
  }
}
