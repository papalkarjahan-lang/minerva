import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Onboarding from './pages/Onboarding'
import DispatcherView from './pages/DispatcherView'
import IndustrialDispatcherView from './pages/IndustrialDispatcherView'
import TechnicianView from './pages/TechnicianView'
import TrackingView from './pages/TrackingView'
import InvoiceView from './pages/InvoiceView'
import QuoteView from './pages/QuoteView'
import ClientHistoryView from './pages/ClientHistoryView'
import SuccessPage from './pages/SuccessPage'
import IntakeAssistant from './pages/IntakeAssistant'
import DisputeView from './pages/DisputeView'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
