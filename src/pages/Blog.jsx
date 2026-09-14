import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { BLOG_POSTS } from '../blogPosts'

export default function Blog() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '70px 24px 50px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 'bold', margin: '0 0 12px' }}>Blog</h1>
        <p style={{ color: '#aaa', fontSize: 16, margin: 0 }}>Notes on running a field-service business, for the people who run one.</p>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {BLOG_POSTS.slice().reverse().map(post => (
          <Link key={post.slug} to={`/blog/${post.slug}`} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#0a0f1d', borderRadius: 16, padding: 24, border: '1px solid #1e293b' }}>
              <p style={{ color: '#555', fontSize: 12, margin: '0 0 8px' }}>{new Date(post.date).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 19, margin: '0 0 10px' }}>{post.title}</p>
              <p style={{ color: '#888', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{post.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>

      <SiteFooter />
    </div>
  )
}
