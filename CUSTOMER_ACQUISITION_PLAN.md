# Minerva — Customer Acquisition Plan

Two separate things get called "customer acquisition" for Minerva, and
they need different treatment:

1. **The in-app Growth pillar** — features Minerva *gives* its paying
   customers (tradie businesses) to acquire *their* clients.
2. **Minerva's own go-to-market** — how the Minerva business itself gets
   its first paying tradie customers. This is currently at zero and is the
   actual blocker to being a real business, not a code problem.

This doc covers both, and is explicit about which parts are done, which
parts are yours to execute (can't be done by an agent), and why.

---

## Part 1 — In-app Growth pillar: readiness check

Verified against the actual code (not assumed):

- `generate-growth-drafts` — weekly cron, drafts ad copy/SMS blasts per
  business based on under-booked suburbs, writes to `marketing_drafts` with
  `status: 'pending'`. Nothing sent automatically.
- `launch-ad-campaign` — only runs on a business owner's explicit
  "Approve & Launch" click in the Marketing tab. Uses that business's own
  Meta access token/ad account/page ID (`businesses.meta_access_token` etc,
  set by the owner in Settings) — Minerva never touches or spends from a
  shared ad account. Already has the TOCTOU-safe atomic claim fix from the
  2026-09-05 audit.
- `send-growth-message` — same approval-gated pattern for SMS blasts, same
  atomic claim fix.
- `send-referral-code-sms` — already fires automatically on every paid
  invoice, no approval gate needed (low-stakes, single thank-you text per
  the function's own header comment).

**Conclusion: this pillar is code-complete and safe.** The only reason it
"doesn't run live" for a given business is that *that business* hasn't
connected its own Meta ad account in Settings yet — which is expected
self-serve behaviour, not a gap to fix. Nothing further to build here.

---

## Part 2 — Minerva's own first customers (the real gap)

Minerva has: a working product, a 7-day free trial, Stripe billing, and
(per `CLIENT_PITCHES_ADDENDUM.md` / `antikythera_minerva_client_pitches.docx`)
already-written sales scripts for 9 buyer profiles. What it doesn't have is
a single customer, or any acquisition activity actually running. None of
what follows can be executed by an agent — it requires you creating
accounts, spending your own money/time, and having real conversations —
but here's a concrete, low-cost plan rather than a vague "go get customers."

### Recommended first channel: direct outreach, not ads
With zero customers and zero case studies, paid ads will convert poorly —
nobody trusts a SaaS tool with no social proof. Direct outreach to a
narrow, warm-ish audience converts better at this stage:

1. **Pick one trade + one city** you can credibly reach (per
   `Onboarding.jsx`'s `TRADE_TYPES`/`CITIES` lists — e.g. plumbers in your
   own city). Narrow beats broad for a cold start.
2. **Build a list of 30-50 real local businesses** in that trade (Google
   Maps search, local trade directories, Facebook business pages). This is
   manual research you'd do yourself — an agent cannot browse and compile
   real business contact lists on your behalf as a scraping/outreach task.
3. **Use the existing pitch scripts** (`CLIENT_PITCHES_ADDENDUM.md`,
   `antikythera_minerva_client_pitches.docx`) adapted to a short cold
   message — SMS, email, or a call, whichever you're comfortable doing
   personally, referencing `SALES_CLAIMS_ACCURACY_NOTE.md` so you only say
   things that are actually live.
4. **Offer the 7-day free trial as the ask** — no commitment, they see
   value before paying. This is already the exact flow built in
   `Onboarding.jsx`.
5. **Ask your first 3-5 customers for a testimonial/case study** the moment
   they see real value (e.g. "found a technician was 40 min late without a
   single phone call"). Real social proof unlocks every channel after this
   one (ads, content, referrals).

### Once you have 3-5 paying customers
- **Referral loop is already live** (`send-referral-code-sms`) — every paid
  invoice nudges their client for a referral. For getting *your* next
  tradie customers (not their clients), consider manually asking happy
  customers to refer one other business owner they know — this is a
  conversation you'd have directly, not something in the app today.
- **Local trade Facebook groups / trade association forums** — many trades
  have active local Facebook groups. Once you have a real case study, a
  genuine (not spammy) post there tends to outperform paid ads targeting
  cold audiences.
- **Revisit paid ads (Meta/Google) once you have social proof** — at that
  point the existing in-app Growth pillar is exactly what you'd want your
  own future customers using too, so building your own ad campaign
  yourself is good dogfooding, but it means creating and funding your own
  ad account — an account-creation/spending action outside what an agent
  can do for you.

### What I will not do here, and why
Per the standing safety boundaries: I won't create ad accounts, spend real
ad budget, send real cold outreach messages to third parties, or compile
scraped contact lists of real businesses to message — these are real-world
account-creation/financial/messaging actions that need to be done by you,
not executed on your behalf. What I *have* done is make sure the product
and sales materials you'd use to execute this plan are accurate and ready
(this session's copy-accuracy fixes, the pitch addendum already in the
repo, and the working free-trial-to-paid flow).
