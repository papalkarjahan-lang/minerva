// Shared full-screen loading indicator for the dark-themed client-facing
// pages (QuoteView, InvoiceView, TrackingView, ClientHistoryView) — these
// previously each showed plain, static text ("Loading quote...") with no
// visual motion, which on a slow mobile connection reads as a frozen/broken
// page rather than "still working". A single small spinning-ring + label,
// reused everywhere, also means every client-facing loading state now looks
// and behaves identically instead of each page inventing its own.
export default function LoadingScreen({ label = 'Loading...' }) {
  return (
    <div style={styles.screen}>
      <div style={styles.ring} />
      <p style={styles.label}>{label}</p>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', gap: 14 },
  ring: { width: 32, height: 32, borderRadius: '50%', border: '3px solid #1e293b', borderTopColor: '#2D5FA8', animation: 'spin 0.8s linear infinite' },
  label: { color: '#888', fontSize: 15, margin: 0 },
}
