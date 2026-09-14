import { Link } from 'react-router-dom'

// Shared nav + footer for every public marketing page (LandingPage,
// Features, Pricing, About, Contact, Blog) — pulled out once these grew
// past the single LandingPage.jsx they started in, so five pages don't
// each hand-copy the same nav links and footer legal links out of sync
// with each other. Same "unguessable link" trust model doesn't apply
// here — these are all fully public, unauthenticated pages.

const NAV_LINKS = [
  ['/features', 'Features'],
  ['/pricing', 'Pricing'],
  ['/blog', 'Blog'],
  ['/about', 'About'],
]

// Same optional-parts pattern as the original LandingPage footer (Fixed
// 2026-09-08) — only shows a contact part if it's actually configured,
// never a broken bracket placeholder in production.
const CONTACT_PARTS = [
  import.meta.env.VITE_BUSINESS_ABN && `ABN ${import.meta.env.VITE_BUSINESS_ABN}`,
  import.meta.env.VITE_BUSINESS_EMAIL,
  import.meta.env.VITE_BUSINESS_PHONE,
].filter(Boolean)

export function SiteNav() {
  return (
    <nav style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
      <Link to="/" style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', letterSpacing: 3, textDecoration: 'none' }}>MINERVA</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        {NAV_LINKS.map(([to, label]) => (
          <Link key={to} to={to} style={{ color: '#aaa', textDecoration: 'none', fontSize: 14 }}>{label}</Link>
        ))}
        <Link to="/login" style={{ color: '#aaa', textDecoration: 'none', fontSize: 14 }}>Log in</Link>
        <Link to="/start" style={{ background: '#2D5FA8', color: '#fff', textDecoration: 'none', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 'bold' }}>
          Start free trial
        </Link>
      </div>
    </nav>
  )
}

export function SiteFooter() {
  return (
    <footer style={{ borderTop: '1px solid #1e293b', padding: '24px 40px', textAlign: 'center', color: '#444', fontSize: 13 }}>
      <p style={{ margin: '0 0 10px' }}>
        Minerva | An Antikythera / Krios AI product{CONTACT_PARTS.length > 0 ? ` | ${CONTACT_PARTS.join(' | ')}` : ''}
      </p>
      <p style={{ margin: 0 }}>
        <Link to="/features" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Features</Link>
        <Link to="/pricing" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Pricing</Link>
        <Link to="/blog" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Blog</Link>
        <Link to="/about" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>About</Link>
        <Link to="/contact" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Contact</Link>
        <Link to="/terms" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Terms of Service</Link>
        <Link to="/privacy" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Privacy Policy</Link>
        <Link to="/refund-policy" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Refund Policy</Link>
      </p>
    </footer>
  )
}
