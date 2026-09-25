// Shared helper: escapeHtml
// Escapes the characters that matter for safely interpolating a free-text
// value into HTML markup (& < > " ') before it's dropped into an email
// template string. Needed anywhere a value a user or an AI draft controls
// — business name, outreach draft body, etc. — is interpolated directly
// into an `html:` string built with template literals (see stripe-webhook's
// welcome/payment-failed emails and send-outreach-batch's prospect emails):
// without this, a business owner who sets their business name to something
// like `<a href="...">click</a>` (a free-text field set at signup, no
// server-side restriction on its characters) could inject arbitrary markup
// into a transactional email — including one sent to OPERATOR_EMAIL, i.e.
// landing directly in the site operator's own inbox, not just their own.
// Escaping is safe/lossless for the normal case too (e.g. "Smith & Sons"
// renders back to "Smith & Sons" once the email client decodes &amp;).
export function escapeHtml(input: string): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
