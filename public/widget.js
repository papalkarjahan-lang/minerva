/**
 * Minerva embeddable lead-intake widget.
 *
 * Usage (paste into any client website, anywhere before </body>):
 *   <script src="https://minervaops.com.au/widget.js" data-business-id="YOUR-BUSINESS-ID" async></script>
 *
 * What it does: renders a small floating chat bubble in the corner of the
 * host page. Clicking it opens an iframe pointing at this business's own
 * /intake/:businessId page (the same guided intake flow that already exists
 * as a standalone link — see SuccessPage.jsx). This script does not talk to
 * Supabase directly and has no access to the host page's data; it only
 * loads Minerva's own page inside an isolated iframe, the same trust
 * boundary a normal <a target="_blank"> link would have.
 *
 * Derives its own origin from the <script> tag's own src, so the exact
 * same file works whether it's served from production or any other
 * deployment of this app — nothing here is hardcoded to one domain.
 */
(function () {
  'use strict'

  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script')
    return scripts[scripts.length - 1]
  })()

  var businessId = currentScript.getAttribute('data-business-id')
  if (!businessId) {
    console.error('Minerva widget: data-business-id attribute is required on the <script> tag.')
    return
  }

  var origin
  try {
    origin = new URL(currentScript.src).origin
  } catch (e) {
    console.error('Minerva widget: could not determine script origin.', e)
    return
  }

  var accent = currentScript.getAttribute('data-accent') || '#2D5FA8'
  var open = false

  var bubble = document.createElement('button')
  bubble.setAttribute('aria-label', 'Chat with us')
  bubble.setAttribute('type', 'button')
  bubble.innerHTML = '<span id="minerva-widget-icon">&#128172;</span>'
  bubble.style.cssText =
    'position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;' +
    'background:' + accent + ';color:#fff;border:none;font-size:24px;cursor:pointer;' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.25);z-index:2147483000;line-height:56px;padding:0;'

  var panel = document.createElement('div')
  panel.style.cssText =
    'position:fixed;bottom:88px;right:20px;width:370px;height:70vh;max-height:600px;' +
    'border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.35);' +
    'z-index:2147483000;display:none;background:#050811;'

  var closeBtn = document.createElement('button')
  closeBtn.setAttribute('aria-label', 'Close chat')
  closeBtn.setAttribute('type', 'button')
  closeBtn.textContent = '\u00D7'
  closeBtn.style.cssText =
    'position:absolute;top:8px;right:10px;background:rgba(0,0,0,0.35);color:#fff;' +
    'border:none;border-radius:50%;width:26px;height:26px;font-size:16px;cursor:pointer;' +
    'z-index:2147483001;line-height:24px;padding:0;'

  var iframe = document.createElement('iframe')
  iframe.title = 'Chat'
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;'
  iframe.loading = 'lazy'
  // Sandboxed to the minimum this page actually needs (it runs its own
  // scripts and calls Supabase over fetch, both of which need
  // allow-scripts + allow-same-origin together) — no allow-top-navigation,
  // allow-popups, or allow-forms-outside-iframe, so this can't be used to
  // navigate or pop up anything on the host page itself.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')

  panel.appendChild(iframe)
  panel.appendChild(closeBtn)

  function setOpen(next) {
    open = next
    if (open) {
      if (!iframe.src) iframe.src = origin + '/intake/' + encodeURIComponent(businessId)
      panel.style.display = 'block'
      bubble.setAttribute('aria-label', 'Close chat')
    } else {
      panel.style.display = 'none'
      bubble.setAttribute('aria-label', 'Chat with us')
    }
  }

  bubble.addEventListener('click', function () { setOpen(!open) })
  closeBtn.addEventListener('click', function () { setOpen(false) })

  // Full-screen panel on small screens so the widget doesn't get clipped or
  // squeezed off-screen on a phone.
  function applyResponsiveLayout() {
    if (window.innerWidth < 480) {
      panel.style.width = '100vw'
      panel.style.height = '100vh'
      panel.style.maxHeight = 'none'
      panel.style.bottom = '0'
      panel.style.right = '0'
      panel.style.borderRadius = '0'
    } else {
      panel.style.width = '370px'
      panel.style.height = '70vh'
      panel.style.maxHeight = '600px'
      panel.style.bottom = '88px'
      panel.style.right = '20px'
      panel.style.borderRadius = '16px'
    }
  }
  applyResponsiveLayout()
  window.addEventListener('resize', applyResponsiveLayout)

  function mount() {
    document.body.appendChild(panel)
    document.body.appendChild(bubble)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
