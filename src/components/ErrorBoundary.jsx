import * as Sentry from '@sentry/react'

// Wraps <App /> in main.jsx. Without this, an uncaught render error in any
// page (most importantly TechnicianView — often opened mid-job, on-site,
// with no easy way to reload for a non-technical user) would blank the
// entire screen with no explanation and no report of what happened.
// Sentry.ErrorBoundary works whether or not Sentry.init() has run (see
// src/sentry.js) — if VITE_SENTRY_DSN isn't set, the fallback UI below
// still renders, it just isn't reported anywhere.
export default function ErrorBoundary({ children }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div style={{ minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 }}>
          <div style={{ background: '#0a0f1d', borderRadius: 20, padding: 40, maxWidth: 420, width: '100%', textAlign: 'center', border: '1px solid #1e293b' }}>
            <p style={{ fontSize: 40, margin: '0 0 12px' }}>⚠️</p>
            <h1 style={{ color: '#fff', fontSize: 20, margin: '0 0 12px' }}>Something went wrong</h1>
            <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
              This page hit an unexpected error. Try reloading — if it keeps happening, contact support.
            </p>
            <button
              onClick={() => { resetError(); window.location.reload() }}
              style={{ background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}
            >
              Reload page
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
