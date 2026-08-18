import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Onboarding from './pages/Onboarding'
import DispatcherView from './pages/DispatcherView'
import TechnicianView from './pages/TechnicianView'
import TrackingView from './pages/TrackingView'
import SuccessPage from './pages/SuccessPage'
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

        {/* Dispatcher dashboard - accessed after login */}
        {/* URL: /dispatch/:businessId */}
        <Route path="/dispatch/:businessId" element={<DispatcherView />} />
      </Routes>
    </BrowserRouter>
  )
}
