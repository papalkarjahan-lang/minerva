import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'

// Route-based code-splitting (2026-09-05): these were all static imports,
// so every visitor's initial bundle included every page — the public
// LandingPage was shipping DispatcherView, IndustrialDispatcherView,
// TechnicianView, and the Mapbox-heavy views whether it needed them or not.
// React.lazy() + the Suspense boundary below makes each page its own chunk,
// loaded on demand. Matters most for TechnicianView (opened from an SMS
// link, often on a slow mobile connection — see the PWA/offline work in
// TechnicianView.jsx) and LandingPage (public, SEO/conversion-sensitive).
const LandingPage = lazy(() => import('./pages/LandingPage'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const DispatcherView = lazy(() => import('./pages/DispatcherView'))
const IndustrialDispatcherView = lazy(() => import('./pages/IndustrialDispatcherView'))
const TechnicianView = lazy(() => import('./pages/TechnicianView'))
const TrackingView = lazy(() => import('./pages/TrackingView'))
const InvoiceView = lazy(() => import('./pages/InvoiceView'))
const QuoteView = lazy(() => import('./pages/QuoteView'))
const ClientHistoryView = lazy(() => import('./pages/ClientHistoryView'))
const SuccessPage = lazy(() => import('./pages/SuccessPage'))
const IntakeAssistant = lazy(() => import('./pages/IntakeAssistant'))
const DisputeView = lazy(() => import('./pages/DisputeView'))

function RouteLoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050811' }}>
      <p style={{ color: '#888', fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Loading...</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/start" element={<Onboarding />} />
        <Route path="/success" element={<SuccessPage />} />

        {/* Technician route - accessed via SMS link */}
        {/* URL: /tech?pin=123456 */}
        <Route path="/tech" element={<TechnicianView />} />

        {/* Client tracking route - accessed via SMS link */}
        {/* URL: /track/:jobId */}
        <Route path="/track/:jobId" element={<TrackingView />} />

        {/* Client invoice route (Pro tier) - accessed via SMS link */}
        {/* URL: /invoice/:invoiceId */}
        <Route path="/invoice/:invoiceId" element={<InvoiceView />} />

        {/* Client quote route (round-2 batch) - accessed via SMS link */}
        {/* URL: /quote/:quoteId */}
        <Route path="/quote/:quoteId" element={<QuoteView />} />

        {/* Client service-history portal (round-2 batch) - opaque token link,
            generated from TrackingView's job-complete screen. URL: /client/:token */}
        <Route path="/client/:token" element={<ClientHistoryView />} />

        {/* Dispatcher dashboard - accessed after login */}
        {/* URL: /dispatch/:businessId */}
        <Route path="/dispatch/:businessId" element={<DispatcherView />} />

        {/* Industrial sector console (Track B) — parallel to /dispatch,
            used when a business's `sector` is 'industrial'. URL: /industrial/:businessId */}
        <Route path="/industrial/:businessId" element={<IndustrialDispatcherView />} />

        {/* AI Intake Assistant - embedded/linked from the business's own
            website to triage inbound leads. URL: /intake/:businessId */}
        <Route path="/intake/:businessId" element={<IntakeAssistant />} />

        {/* BONUS: Dispute Pack - read-only evidence page for a single job
            (GPS route, checklist photos, materials, invoice), opened from
            DispatcherView's Recently Completed section. URL: /dispute/:jobId */}
        <Route path="/dispute/:jobId" element={<DisputeView />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
