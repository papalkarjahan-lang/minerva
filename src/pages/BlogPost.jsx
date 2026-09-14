import { Link, useParams } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { BLOG_POSTS } from '../blogPosts'

export default function BlogPost() {
  const { slug } = useParams()
  const post = BLOG_POSTS.find(p => p.slug === slug)

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '70px 24px 80px' }}>
        {!post ? (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 'bold', margin: '0 0 16px' }}>Post not found</h1>
            <Link to="/blog" style={{ color: '#2D5FA8' }}>← Back to blog</Link>
          </>
        ) : (
          <>
            <Link to="/blog" style={{ color: '#666', textDecoration: 'none', fontSize: 13 }}>← Back to blog</Link>
            <p style={{ color: '#555', fontSize: 12, margin: '20px 0 8px' }}>{new Date(post.date).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <h1 style={{ fontSize: 34, fontWeight: 'bold', margin: '0 0 28px', lineHeight: 1.3 }}>{post.title}</h1>
            {post.paragraphs.map((p, i) => (
              <p key={i} style={{ color: '#ccc', fontSize: 16, lineHeight: 1.8, margin: '0 0 20px' }}>{p}</p>
            ))}
            <div style={{ marginTop: 40 }}>
              <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 'bold' }}>
                Start free trial
              </Link>
            </div>
          </>
        )}
      </div>

      <SiteFooter />
    </div>
  )
}
