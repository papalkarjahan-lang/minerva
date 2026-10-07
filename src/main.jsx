import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import * as Sentry from '@sentry/react'
import { initSentry } from './sentry'

initSentry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)

// Register the PWA service worker (public/sw.js) — only in production
// builds, so the dev server's own module reloading/HMR isn't fought by a
// caching worker. It intercepts /tech navigations/assets so a technician
// who already opened the app once can reopen it with no signal — see
// public/sw.js's header comment for exactly what is and isn't cached.
//
// Reports a failed registration to Sentry rather than swallowing it —
// found live (embedding this build and checking navigator.serviceWorker
// directly) that a bare .catch(() => {}) here means offline support for
// technicians could silently stop working — a bad deploy, a host/proxy
// rewrite intercepting /sw.js, a future browser policy change — with
// literally no way to notice short of a technician reporting "the app
// doesn't work with no signal anymore". Sentry.captureException is a
// documented no-op until VITE_SENTRY_DSN is set, same as every other
// Sentry call in this codebase, so this adds no behavior until then.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => Sentry.captureException(err))
  })
}
