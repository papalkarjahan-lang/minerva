import { useEffect } from 'react'

// This app is a client-rendered SPA with a single static <title>/meta
// description/og:*/twitter:* set in index.html — every route (blog posts,
// /pricing, /enterprise, /about, etc.) was showing that same generic
// "Minerva — Know where every technician is, right now." title and
// description in the browser tab, search results, and social-link
// previews, regardless of which page was actually being viewed or shared.
// Sharing a specific blog post link, for instance, always previewed as
// the homepage. This hook lets each public page set its own real
// title/description on mount and cleanly restores the index.html defaults
// on unmount, so navigating away (this is client-side routing, not a full
// page reload) doesn't leave a stale title/description behind for
// whichever page renders next.
//
// Deliberately no new dependency (react-helmet-async etc.) — this is a
// small, one-directional DOM write with a matching cleanup, well within
// what a plain useEffect can do correctly for a handful of static tags.
// Not unit-tested for the same reason src/hooks/useReveal.jsx isn't: this
// project's vitest config runs in a plain Node environment (no jsdom), so
// a DOM-mutating hook has nothing meaningful to assert against here.
const DEFAULT_TITLE = 'Minerva — Know where every technician is, right now.'
const DEFAULT_DESCRIPTION = 'Live map tracking and automated client SMS for trade businesses. Works on every phone. Set up in 20 minutes.'

function setMetaContent(selector, content) {
  const el = document.querySelector(selector)
  if (el) el.setAttribute('content', content)
}

export function useDocumentMeta({ title, description }) {
  useEffect(() => {
    const fullTitle = title ? `${title} — Minerva` : DEFAULT_TITLE
    const desc = description || DEFAULT_DESCRIPTION

    document.title = fullTitle
    setMetaContent('meta[name="description"]', desc)
    setMetaContent('meta[property="og:title"]', fullTitle)
    setMetaContent('meta[property="og:description"]', desc)
    setMetaContent('meta[name="twitter:title"]', fullTitle)
    setMetaContent('meta[name="twitter:description"]', desc)

    return () => {
      document.title = DEFAULT_TITLE
      setMetaContent('meta[name="description"]', DEFAULT_DESCRIPTION)
      setMetaContent('meta[property="og:title"]', DEFAULT_TITLE)
      setMetaContent('meta[property="og:description"]', DEFAULT_DESCRIPTION)
      setMetaContent('meta[name="twitter:title"]', DEFAULT_TITLE)
      setMetaContent('meta[name="twitter:description"]', DEFAULT_DESCRIPTION)
    }
  }, [title, description])
}
