# The 4 remaining account-setup blockers — exact click-by-click steps

This is not a fresh account setup guide (see `README.md`'s "Day 1: Set up
accounts" for that). This is specifically for the 4 items that have been
stuck across multiple sessions — every one requires entering a payment
method or flipping a live financial switch, which Claude cannot do on your
behalf under any circumstance (see the standing safety rules). Everything
else in Minerva is code-complete and already verified working. These 4
steps are genuinely the only thing between here and a real paying
customer.

Do them in this order — Stripe live mode last, since it's the one that
actually starts charging real cards.

---

## 1. Mapbox — add a payment method to unlock a usable token

You hit a "must add payment method" screen previously. This is normal —
Mapbox requires a card on file even for its free tier (50,000 free map
loads/month, no charge unless you exceed that, which a handful of pilot
customers won't come close to).

1. Go to https://account.mapbox.com/
2. Click **Billing** in the left sidebar
3. Click **Add payment method** → enter a card → Save
4. Click **Tokens** in the left sidebar (or https://account.mapbox.com/access-tokens/)
5. Copy the **Default public token** — starts with `pk.eyJ1...`
6. Open `minerva/.env.local` in your editor, replace the line:
   ```
   VITE_MAPBOX_TOKEN=pk.eyJ1IjoieW91cnVzZXJuYW1lIiwi...
   ```
   with your real token (same `VITE_MAPBOX_TOKEN=` prefix, your real value
   after the `=`)
7. Also add it to Vercel: **Vercel Dashboard → your project → Settings →
   Environment Variables → VITE_MAPBOX_TOKEN → Edit** → paste the same
   token → Save. Vercel will prompt you to redeploy — click **Redeploy**.

**Done when:** any dispatcher map or tracking link shows an actual street
map instead of a blank grey box.

---

## 2. Twilio — upgrade to an SMS-capable Australian number

A trial Twilio number can only text pre-verified numbers — real clients
aren't pre-verified, so every SMS function will silently fail until this
is done.

1. Go to https://console.twilio.com/
2. Click the red **Upgrade** button (top of the console) or go to
   **Billing → Overview → Add funds**
3. Add a payment method and add at least $20 credit (SMS in Australia
   costs roughly $0.06-0.10/message — this covers a long pilot phase)
4. Go to **Phone Numbers → Manage → Active Numbers**
5. If your existing trial number is still listed, it should now work for
   real numbers automatically after upgrading — no need to buy a new one.
   If you want a proper local number, click **Buy a number** → filter
   Country: Australia → pick one with SMS capability → Buy.
6. Copy the number in **E.164 format** (e.g. `+61412345678`)
7. Set it as a Supabase secret:
   ```bash
   npx supabase secrets set TWILIO_PHONE_NUMBER=+61412345678
   ```
8. **Voice webhook (for the missed-call-webhook feature)** — on the same
   Active Numbers page, click your number → scroll to **Voice
   Configuration** → set **"A call comes in"** to **Webhook** → paste:
   ```
   https://xiikytqxevivrupkljwc.supabase.co/functions/v1/missed-call-webhook
   ```
   → Method: `HTTP POST` → **Save**

**Done when:** a test SMS sent from any Minerva function reaches your own
real phone number (not just a Twilio-verified one).

---

## 3. Anthropic Console — issue a usable API key

Same payment-method gate as the other two. This unlocks AI-drafted quotes,
intake conversation, and marketing copy — but Minerva works correctly
without it (every AI-backed function has a plain-template fallback
already live), so this is the lowest-urgency of the 4.

1. Go to https://console.anthropic.com/
2. Click **Settings → Billing** (or you'll be prompted automatically when
   creating a key)
3. Add a payment method, add a small amount of credit (e.g. $10 — usage
   at pilot-customer scale, a handful of quotes/conversations a day, costs
   cents)
4. Go to **Settings → API Keys → Create Key** → name it `minerva-prod` →
   copy the key (starts with `sk-ant-`)
5. Set it as a Supabase secret:
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-real-key
   ```

**Done when:** a new quote drafted via `draft-quote` or a message in the
`/intake/:businessId` widget reads as natural free-text instead of the
fixed five-question template.

---

## 4. Stripe — switch from test mode to live mode

Do this last, and only once you've run the Day 7 testing checklist in
test mode (see `DAY7_LAUNCH_CHECKLIST.md`). This is the step that starts
charging real cards — there's no "undo," only refunds, so test everything
else first.

1. Go to https://dashboard.stripe.com/
2. Toggle **Test mode** off (top-right switch) — you're now in live mode
3. **Re-create your 3 products in live mode** (live and test mode have
   completely separate product catalogs — the ones you made in test mode
   don't carry over):
   - **Minerva Starter**: $49 AUD/technician/month, 7-day trial
   - **Minerva Standard**: $79 AUD/technician/month, 7-day trial
   - **Minerva Pro**: $119 AUD/technician/month, 7-day trial
4. Copy each live Price ID (starts with `price_`, different from your
   test-mode ones)
5. Go to **Developers → API keys** (still in live mode) → copy the
   **Secret key** (`sk_live_...`) — that's the only one you need; this app's
   checkout is entirely server-side (a redirect to a Stripe-hosted session
   URL), so the publishable key is never used anywhere and doesn't need to
   be saved
6. Go to **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://xiikytqxevivrupkljwc.supabase.co/functions/v1/stripe-webhook`
   - Events to send: `checkout.session.completed`,
     `customer.subscription.deleted`, `customer.subscription.updated`,
     `invoice.payment_failed`
   - Click **Add endpoint** → copy the **Signing secret** (`whsec_...`)
7. Go to **Settings → Billing → Customer Portal** → make sure it's
   **Activated** (needed for `create-billing-portal-session` /
   self-serve cancellation)
8. Update Supabase secrets with the live values:
   ```bash
   npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...
   npx supabase secrets set STRIPE_PRICE_ID_STARTER=price_...
   npx supabase secrets set STRIPE_PRICE_ID_STD=price_...
   npx supabase secrets set STRIPE_PRICE_ID_PRO=price_...
   npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```

**Done when:** a real signup with a real card actually creates a
subscription in Stripe's live Subscriptions list, not the test one.

---

## After all 4 are done

Run `DAY7_LAUNCH_CHECKLIST.md` (a real test signup with your own card and
Stripe test card `4242 4242 4242 4242` **won't work anymore** once you're
in live mode — for the final live-mode pass, use a real card, then
immediately cancel via the Customer Portal to avoid being charged, or ask
Stripe support about a full pilot refund policy for yourself). Once that
passes clean, you're ready for the first real client call.

---

## 5. Optional but strongly recommended before onboarding multiple real clients: OPERATOR_EMAIL

Once you have more than one real paying business, you won't be watching
every dashboard all day. Two things now email you directly instead of
sitting silently in a database or a Deno log you'd have to go looking for:
a client's card payment failing, and a background agent function going
unhealthy (stuck, or erroring repeatedly) — the second one matters because
these agents run across every business, not just one, so a silent failure
there affects all of your clients at once, not just one.

1. Requires `RESEND_API_KEY` to already be set (see `send-email`'s own
   header comment) — without it, this is a no-op either way.
2. Set your own email as a Supabase secret:
   ```bash
   npx supabase secrets set OPERATOR_EMAIL=you@example.com
   ```
3. Redeploy `stripe-webhook` and `test-agent-health` after setting this
   (secrets are only picked up by a function that's been deployed after
   the secret was set — see `minerva_supabase_function_deploy_method.md`
   if you're doing this yourself via the Management API).

**Done when:** you can trigger a Stripe test-mode failed payment (Stripe
dashboard → a test card like `4000 0000 0000 0341`) and an email actually
lands in your inbox within a minute or two.
