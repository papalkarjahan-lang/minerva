// Minerva Technician PWA service worker.
//
// Scope: lets a technician who already opened /tech once reopen the app
// shell (HTML/JS/CSS) with no signal, so the page itself loads instead of a
// browser "no internet" error. Real data (jobs, GPS writes) still requires
// a live connection to Supabase — that's handled by the existing
// localStorage-backed GPS queue and retry logic in TechnicianView.jsx, not
// by this worker. Bump CACHE_VERSION whenever the caching strategy itself
// changes, to force old caches to be dropped on next activate.
const CACHE_VERSION = 'minerva-shell-v1'
const SHELL_URLS = ['/tech', '/manifest.json', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})))
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return // never cache mutating requests

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // leave Supabase/Mapbox/etc alone

  // Full-page navigations (e.g. reopening /tech?pin=... offline): try the
  // network first so a technician online always gets the freshest build,
  // fall back to the cached shell page if the network fails.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(CACHE_VERSION).then((cache) => cache.put('/tech', response.clone()))
          return response
        })
        .catch(() => caches.match('/tech'))
    )
    return
  }

  // Static built assets (hashed JS/CSS/images under /assets, plus the shell
  // files above): cache-first, refreshing the cache in the background on
  // every hit so the next offline session gets whatever was last fetched.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
