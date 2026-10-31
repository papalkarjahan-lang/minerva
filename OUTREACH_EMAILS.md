# Minerva — Cold Email Sequence (complements the phone scripts)

Use this when you don't have a phone number, when a call goes to voicemail, or as a
warm-up before calling. Send from a real inbox tied to a domain (not a free gmail) once
you have minerva-green.vercel.app (or similar) live — deliverability is much better from a
domain that matches your website.

Send Tue–Thu, 7:30–8:30am local time (before their workday starts, when owners check
email on their phone). Never send Mon (inbox flooded) or Fri afternoon (ignored).

**Target segments (TAM) — widened 2026-10-31:** plumbing, electrical, HVAC, locksmith,
pest control, courier/delivery, security patrol, automotive mobile service, mobile
veterinary, commercial cleaning, pool/spa maintenance, and industrial/heavy-equipment
site operations — any business that dispatches technicians/crew to client or site
locations. Swap [trade type] below for the specific segment, and lead with a
segment-relevant detail (couriers care about proof-of-delivery ETAs, security patrol
cares about verified patrol routes, mobile vets care about client peace of mind for an
at-home visit) rather than a generic pitch. **Why "widened":** the pitch used to be
GPS/dispatch only. As of this date Minerva also runs the client-facing side of the
business — quoting, invoicing follow-up, lead win-back, review requests, compliance
tracking — so the addressable buyer is no longer just "owner annoyed about dispatch
calls," it's any owner losing time or money to any one of those, which is a wider slice
of the same target list. See `/platform` on the live site for the full list — it's the
page to point a skeptical prospect at if they ask "what does it actually do."

**Honesty rule, same as always — read before editing the lines below:** every claim here
is checked against `SALES_CLAIMS_ACCURACY_NOTE.md` before it goes in. Don't add a line
implying "AI" or "smart" judgment until `ANTHROPIC_KEY_LIVE_UPGRADE_NOTE.md`'s trigger
condition is actually met — say "automatically," which is true either way. Don't claim
a ServiceM8/Simpro side-by-side integration is available — the connector exists in code
but has no registered developer app, hasn't been tested against a live account, and has
no pricing or UI yet (see `README.md`'s ServiceM8 section). Until that's real, Client 8's
pitch stays "we move your client list across for free," not "we plug into what you've
already got."

**Fixed 2026-10-31 — found while rewriting this file:** the Day-3 email below used to say
"no card required" on the free trial. That's false — `Onboarding.jsx` always routes
through Stripe Checkout, which always collects a card (see
`SALES_CLAIMS_ACCURACY_NOTE.md`'s 2026-10-27 correction). This version uses the accurate
line: card required up front, not charged until the trial ends. Also fixed a template bug
in the same email — the per-day cost line read literally "$[79] a day" instead of
computing the actual daily cost from the monthly total.

---

## Email 1 — Day 0 (the opener)

Subject: quick question about [Business Name]'s dispatch

Hi [First name],

I build a tool called Minerva for trade businesses — it's a live map that shows where
every van/technician is, and it automatically texts your client once their technician
is close by (within about 2km) so your team stops taking "where is he" calls.

I noticed [specific detail — e.g. "a couple of your recent Google reviews mentioned
not knowing when the technician would arrive"]. That's the exact thing this fixes.

Takes about 20 minutes to set up on your team's phones — no app download, works in any
browser. Worth a 10-minute screen share this week?

[Your name]
[Your mobile]
minerva-green.vercel.app

---

## Email 2 — Day 3 (if no reply — the math, plus what else it quietly does)

Subject: re: [Business Name]'s dispatch

Hi [First name],

Following up in case this got buried — happy to keep this short.

If you've got [N] technicians on the road, Minerva runs $[N x 79]/month total — so
under $[round(N*79/30, 2)] a day to know exactly where every van is, live, without a
single phone call. No contract, cancel anytime. 7-day free trial — card's needed to
start it, but you're not charged until the 7 days are up.

Worth knowing while I've got you: dispatch is the part you asked about, but it's not all
Minerva does. It also automatically re-texts quotes that went quiet, reminds clients
about overdue invoices, checks in with customers who haven't rebooked in a while, and
flags a job as "nobody was home" with GPS proof so you're not just taking the client's
word for it. None of that needs a second subscription or a separate tool — it's already
in what you'd be paying for above.

If it's not useful right now, no worries — just reply "not now" and I'll leave it.

[Your name]
[Your mobile]

---

## Email 3 — Day 7 (if no reply — breakup email)

Subject: last one — [Business Name]

Hi [First name],

Last note from me on this. If it's not the right time, no worries at all —
just wanted to put the option in front of you before your busiest season
hits.

If you want to see it live on your own phone (takes 2 minutes, no signup), here's a
demo link: [link]. If you want the longer version — the 30-ish things it handles beyond
dispatch, in plain English, no sales pitch — there's a page for that too:
minerva-green.vercel.app/platform. If neither's useful right now, no hard feelings —
I'll stop here.

[Your name]
[Your mobile]

---

## Reply handling

**"How much?"** → Reply with exact pricing table + a one-line ROI framing:
"$79/tech/month, so a 4-van team is $316/month — most owners tell us that's less than
one hour of admin time saved per week, before counting what it wins back in invoices
that would've otherwise gone unpaid or leads that would've otherwise gone quiet."

**"We already use [ServiceM8/Jobber/Tradify]"** → Pull the matching row from the
competitive table in the pitch doc (`antikythera_minerva_client_pitches.docx`) and
reply with the specific weakness + Minerva's answer. Don't trash the competitor —
frame as "worth comparing side by side." Don't offer a side-by-side integration with
their existing tool — that's not live yet (see the honesty note at the top of this
file). If they ask directly whether Minerva connects to ServiceM8, the honest answer is
"not yet — it's in development, right now the option is bringing your client list across
to Minerva directly, which takes one session and you don't have to do anything."

**"Send more info"** → Don't attach a PDF. Reply with the demo link + one line:
"Easier to just see it live — here's a 2-minute self-serve demo: [link], and the full
feature list in plain English if you want it: minerva-green.vercel.app/platform. Happy
to walk through it on a call after if useful."

**Out-of-office / wrong contact** → Note the correct contact if given, resend Email 1
to them fresh (don't forward the thread).

---

## Sequencing with calls

- Day 0: send Email 1 in the morning, call in the afternoon if you have a number
- Day 3: Email 2 (only if no reply and no call connected)
- Day 5–6: call again if still no reply
- Day 7: Email 3 (breakup), then move to "dormant — retry in 60 days" list

## Tracking (minimum viable CRM)

Keep a single spreadsheet (Google Sheets is fine) with columns:
`Business | Contact | Phone | Email | Segment | Email1_date | Email2_date | Email3_date |
Called | Outcome | Trial_started | Converted | MRR`

This becomes your pipeline. Sort by "Called = no" every morning to know who's next.
