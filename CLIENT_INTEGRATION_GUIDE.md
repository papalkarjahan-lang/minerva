# Connecting Minerva to your existing business — a client-facing guide

This is for a business that has already signed up for Minerva and wants to
know how it plugs into what they already have: their website, their
business phone number, their technicians' own phones, and their
accounting/payment setup. Everything below describes what the product
*actually does today*, verified against the real code — not an aspirational
roadmap. Anything that isn't built yet is labeled as such.

---

## 1. Your website — the lead-capture chat widget

Two options, both point at the same guided intake flow (it asks about the
job, triages it, and texts your team the qualified lead):

**Option A — a link (zero setup).** Your dispatch console's post-signup
screen gives you a URL like `https://minervaops.com.au/intake/<your-id>`.
Paste it into your website's "Contact Us" button, your Google Business
profile, or an SMS auto-reply.

**Option B — an embedded chat bubble on your own site.** Paste this one
line before your site's closing `</body>` tag:

```html
<script src="https://minervaops.com.au/widget.js" data-business-id="your-id" async></script>
```

This works on Wix, Squarespace, WordPress, Shopify, or any site builder
that lets you add custom HTML/embed code (usually called "Custom Code,"
"Embed," or "HTML block" in the site editor). It renders a small chat
bubble in the corner of your site; clicking it opens the same intake flow
in an isolated frame. It doesn't read or touch anything else on your page.

Both your dispatch console and this guide are the only places this exists
right now — there's no App Store/plugin-marketplace listing (e.g. a
dedicated WordPress plugin) yet, just the raw embed snippet above.

---

## 2. Your business phone number — the honest picture

Minerva does **not** replace your phone system or act as a PBX. There is
no call routing, hold music, or "press 1 for sales." What it *does* do:
when a call to a number Minerva is watching goes unanswered, it
automatically texts the caller back with a booking link and reads back a
short "we missed you" message before hanging up.

For that to trigger, the call has to physically reach a number Minerva
controls (a Twilio number). You have two real ways to make that happen —
this decision has not been made for you and isn't in the main setup
walkthrough, because it depends on your carrier:

- **Get a second, Minerva-managed number** and use it specifically for
  missed-call auto-reply (e.g. print it as a secondary contact / QR code)
  without touching your main advertised number at all. Lowest disruption,
  but it's a second number your customers need to learn.
- **Forward your existing number on no-answer/busy** to the Minerva
  number. Most Australian mobile and landline plans support *conditional*
  call forwarding (forward only when unanswered or busy, not always) —
  this is a setting on your phone or with your carrier, not something
  Minerva can configure remotely. Ask your carrier for "divert on no
  answer" and point it at the Minerva number. Your main number keeps
  ringing normally for answered calls; only the ones that would've gone to
  voicemail get the auto-text-back treatment.

Full call forwarding (porting your number outright) is a bigger, carrier-
specific process and isn't something this guide can walk through
generically — talk to your carrier if that's the direction you want.

---

## 3. Your technicians' phones

No app install required. Each technician gets a text with a personal link.
They open it in their phone's browser, tap "Start Tracking," and grant
location permission once — that's the entire setup. They can also add it
to their home screen (Safari/Chrome's "Add to Home Screen") for a more
app-like icon, but it's still a website under the hood, not a native app
from an app store.

**Real limitation, stated plainly:** this runs in a browser tab, not a
native background service. If a technician locks their phone or fully
switches away from the tab, iOS Safari (and, after a longer idle period,
most Android browsers) pauses the page's JavaScript — which pauses GPS
updates until they reopen it. The app itself now shows a warning about
this while tracking is active. In practice: technicians should leave the
tracking page open (screen can be on with the phone face-up in a cupholder,
or the home-screen shortcut re-opened after any lock) for the live map to
stay current. This is a real constraint of running in a browser rather
than a per-platform native app — there is no native iOS/Android app today.

---

## 4. Payment / invoicing integration

**Accounting sync (optional, paid add-on):** if you're on Minerva Pro/Max
with the Xero Sync add-on enabled, click "Connect Xero" in your dispatch
console's Settings tab. You'll be sent to Xero's own login screen to
approve access to *your own* Xero organisation — you do not need to
register anything with Xero yourself; that one-time technical step (Xero
developer app registration) is done once on Minerva's side, not per
business. After connecting, completed jobs sync through as invoices in
your Xero org.

No QuickBooks or MYOB integration exists today — if you use either, use
Minerva's CSV export instead (Settings → Export) and import it manually.

**Taking actual payment from your customers:** Minerva does not process
customer payments. It generates and can sync invoices, but collecting the
money — bank transfer, EFTPOS, cash, or Xero's own "pay this invoice
online" feature if you have that enabled on your Xero account — happens
outside Minerva, the same way it does today. There's no "Pay Now" button
inside Minerva itself yet.

---

## Summary table

| System | Status |
|---|---|
| Website lead-capture widget | Built — link or embeddable `<script>` snippet (this guide, section 1) |
| Business phone auto-text-back | Built, but requires a manual carrier-side decision (section 2) |
| Technician phone tracking | Built, browser-based, with a real background-tracking limitation on iOS (section 3) |
| Accounting sync (Xero) | Built, one-click per business, paid add-on |
| Accounting sync (QuickBooks/MYOB) | Not built — CSV export only |
| Online payment collection | Not built — invoicing only, payment taken outside Minerva |
