import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initSentry } from './sentry'

initSentry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Register the PWA service worker (public/sw.js) — only in production
// builds, so the dev server's own module reloading/HMR isn't fought by a
// caching worker. It intercepts /tech navigations/assets so a technician
// who already opened the app once can reopen it with no signal — see
// public/sw.js's header comment for exactly what is and isn't cached.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
