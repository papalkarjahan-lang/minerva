// Sentry error monitoring scaffold — gated on VITE_SENTRY_DSN. Until the
// user creates a free Sentry project and sets that env var, initSentry()
// is a documented no-op: no network calls, no behaviour change, nothing
// to configure. This mirrors the same optional-secret pattern used
// elsewhere (ANTHROPIC_API_KEY, RESEND_API_KEY) — features degrade
// gracefully rather than requiring every integration up front.
import * as Sentry from '@sentry/react'

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return // not configured — no-op

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}
