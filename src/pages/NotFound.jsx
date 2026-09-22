import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

// Catch-all for any URL that doesn't match a route (typo, stale bookmark,
// broken external link). Before this existed, App.jsx's <Routes> had no
// path="*" entry, so an unmatched URL rendered nothing at all — a blank
// white page with no nav, no message, no way back. This gives it the same
// nav/footer chrome as every other public page and a real link home.
export default function NotFound() {
  useDocumentMeta({ title: 'Page not found' })

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '100px 24px', textAlign: 'center' }}>
        <p style={{ color: '#2D5FA8', fontSize: 14, letterSpacing: 2, fontWeight: 'bold', margin: '0 0 16px' }}>404</p>
        <h1 style={{ fontSize: 32, fontWeight: 'bold', margin: '0 0 16px' }}>Page not found</h1>
        <p style={{ color: '#aaa', fontSize: 16, lineHeight: 1.6, margin: '0 0 32px' }}>
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link to="/" style={{ display: 'inline-block', background: '#2D5FA8', color: '#fff', textDecoration: 'none', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 'bold' }}>
          Back to home
        </Link>
      </div>

      <SiteFooter />
    </div>
  )
}
