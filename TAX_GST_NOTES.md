# Minerva — Tax / GST Notes (Australia)

**This is general educational information, not personalised tax or legal
advice.** I'm not a licensed tax agent or accountant, and this doc is not a
substitute for engaging one — please verify all of this with a registered
BAS or tax agent before acting on it, especially once real revenue starts.
Rules and thresholds below are current understanding as of this session and
can change; always check the current ATO guidance directly.

## What's real about Minerva as a business right now

Per prior session notes: sole trader, pre-revenue, no customers yet. That
matters because most tax obligations below are triggered by turnover or
structure, not by having built software.

## GST (Goods and Services Tax)

- Registration is **mandatory once your GST turnover reaches $75,000** in a
  12-month period (current ATO threshold at time of writing) — it's
  optional below that.
- If/when registered: charge 10% GST on your subscription invoices to
  Australian business customers, lodge a Business Activity Statement (BAS)
  on the schedule the ATO assigns you (commonly quarterly for a business
  this size), and you can claim GST credits on GST you paid for business
  expenses (Supabase, Stripe fees, Twilio, Mapbox, Anthropic, etc., to the
  extent they charge Australian GST).
- Below $75k turnover, you can still voluntarily register — sometimes worth
  it once you start incurring real GST-inclusive business costs, so you can
  claim credits back, but that's a decision to make with an accountant
  given your actual cost structure.

## Income tax

- As a sole trader, business income and expenses are reported on your
  individual tax return (no separate company tax return) — profit is taxed
  at your personal marginal rate.
- Genuine business expenses (Supabase, Stripe fees, Twilio, Mapbox,
  Anthropic API costs, domain/hosting, this development work, home office
  if applicable) are generally deductible — keep receipts/invoices for all
  of them.
- If the business grows meaningfully, ask an accountant whether a company
  structure would reduce tax or better limit personal liability at that
  point — not a decision to make prematurely.

## PAYG instalments

- Once your business income is significant enough, the ATO may ask you to
  start paying quarterly PAYG instalments toward your expected tax bill.
  This usually kicks in automatically after your first tax return showing
  business income — nothing to set up manually in advance.

## Record-keeping

- Keep records (invoices issued, expense receipts, bank statements) for at
  least 5 years — standard ATO requirement.
- Every Stripe subscription charge is already recorded in Stripe's
  dashboard — that's your source of truth for revenue. Xero, once
  connected (see below), can pull invoice records automatically instead of
  needing manual reconciliation.

## Xero connection — what's actually blocking it

The OAuth code (`xero-oauth-connect`, `xero-oauth-callback`,
`xero-sync-invoice`) is already built and deployed. What's missing is
credentials only you can obtain:

1. Go to `developer.xero.com`, sign in with (or create) your own Xero
   account, and register a free developer app.
2. Xero gives you a `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`.
3. Set those as Supabase secrets (`supabase secrets set XERO_CLIENT_ID=... XERO_CLIENT_SECRET=...`).
4. "Connect Xero" in Settings will then work — it currently just shows a
   setup message because those secrets aren't set.

This is intentionally not something I can do for you: it requires you to
hold your own Xero account and accept Xero's own developer terms.

## What to actually do, in order

1. Nothing urgent while pre-revenue — no GST registration or BAS
   obligation exists yet.
2. Once you get your first paying customer, start a simple spreadsheet (or
   just rely on Stripe's dashboard) tracking revenue toward the $75k GST
   threshold.
3. Talk to a registered tax/BAS agent before you cross $75k turnover, or
   sooner if you want early advice on structure (sole trader vs company)
   and what's deductible — this is worth paying for once real money is
   involved, and is explicitly outside what I can responsibly advise on in
   detail.
