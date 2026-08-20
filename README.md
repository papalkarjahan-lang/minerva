# Minerva — Setup Instructions

## What this is
A live GPS dispatch tracking tool for trade businesses. Technicians share their location via their phone browser (no download required). The dispatcher sees every technician on a live map. Clients get an automatic SMS with a tracking link when the technician is 15 minutes away.

---

## Day 1: Set up accounts (do these first)

### 1. Supabase (database + backend)
1. Go to https://supabase.com
2. Sign up with GitHub
3. Create a new project named `minerva-prod`, region: Asia Pacific (Sydney)
4. Go to **SQL Editor** → paste the entire contents of `supabase_schema.sql` → click Run
5. Go to **Database → Replication** → toggle ON for `technicians` table
6. Go to **Settings → API** → copy your Project URL, anon key, and **service_role key**
   (the service role key is only used server-side by the `stripe-webhook`
   and `missed-call-webhook` functions — never put it in `.env.local` or any
   client-side code)
7. Go to **Authentication → Providers** → turn **off** "Allow new users to
   sign up" (see `SECURITY_NOTES.md` for why)

### 2. Mapbox (maps)
1. Go to https://mapbox.com → Sign up
2. Go to Tokens → copy your default public token (starts with `pk.eyJ1`)

### 3. Twilio (SMS)
1. Go to https://twilio.com → Sign up
2. Get a trial Australian number
3. Copy your Account SID and Auth Token from the Console
4. (Optional — missed-call auto-reply) Once `missed-call-webhook` is deployed
   (see "Deploy Supabase Edge Functions" below), go to your number's
   configuration page in the Twilio Console → **Voice Configuration** → set
   **"A call comes in"** to Webhook, paste
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/missed-call-webhook`,
   method `HTTP POST`. Also set the business's number in the `businesses`
   table (`twilio_number` column, E.164 format e.g. `+61412345678`) so the
   webhook can look up the right business name for the auto-reply SMS.

### 4. Stripe (billing)
1. Go to https://stripe.com/au → Sign up with your ABN
2. Create two products:
   - **Minerva Standard**: $79/technician/month, 7-day trial
   - **Minerva Standard Discounted**: $67/technician/month, 7-day trial (for data-sharing clients)
3. Copy the Price IDs for each
4. Copy your publishable key (pk_live_...) and secret key (sk_live_...)
5. Enable the Customer Portal under Settings → Billing → Customer Portal

---

## Day 1: Set up your local environment

```bash
# Clone or create your repo, then:
npm install

# Copy the example env file and fill in your real values
cp .env.local.example .env.local
# Edit .env.local with your Supabase, Mapbox, and Stripe keys

# Start the dev server
npm run dev
# Opens at http://localhost:5173
```

---

## Day 1: Deploy to Vercel

1. Go to https://vercel.com → Sign in with GitHub
2. Import your repository
3. Add environment variables (same as your `.env.local`)
4. Click Deploy
5. Add your custom domain under Project → Settings → Domains

---

## Deploy Supabase Edge Functions

Install the Supabase CLI first:
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set secrets (replace with your real values):
```bash
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=your_auth_token
supabase secrets set TWILIO_PHONE_NUMBER=+61412345678
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_PRICE_ID_STD=price_xxx
supabase secrets set STRIPE_PRICE_ID_STD_DISCOUNTED=price_xxx
supabase secrets set APP_URL=https://minervaops.com.au
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```
(`STRIPE_WEBHOOK_SECRET` comes from Stripe Dashboard → Developers → Webhooks,
after you create the endpoint in the next step — come back and set it once
you have it.)

Deploy all functions:
```bash
supabase functions deploy send-eta-sms
supabase functions deploy send-setup-sms
supabase functions deploy send-completion-sms
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy missed-call-webhook --no-verify-jwt
```

Then in Stripe Dashboard → Developers → Webhooks, add an endpoint:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`, listening
for `checkout.session.completed` and `customer.subscription.deleted`. Without
this step, the Customer Portal cancellation link on the pricing page won't
work — the business's Stripe subscription ID never gets saved.

Then, for the missed-call auto-reply, go to the Twilio Console → **Phone
Numbers → Manage → Active Numbers** → select the business's number →
**Voice Configuration** → set "A call comes in" to Webhook:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/missed-call-webhook`
(HTTP POST). Also make sure that number is saved in the `twilio_number`
column on the matching `businesses` row, so the webhook can look up the
right business name. `--no-verify-jwt` is required here too, since Twilio's
servers call this webhook directly without a Supabase auth header (same
reason `stripe-webhook` uses it).

---

## Testing checklist (Day 7 — before first client call)

Run through this on TWO real devices (your phone + your laptop):

- [ ] Open `/start` → complete onboarding form → Stripe checkout loads
- [ ] Use Stripe test card `4242 4242 4242 4242` (any future expiry, any CVV)
- [ ] Success page loads and shows dispatch link
- [ ] Technician receives setup SMS with their unique link
- [ ] Technician opens link on phone → GPS permission appears → they tap Allow
- [ ] Technician dot appears on dispatcher map at correct location
- [ ] Walk 10 metres → dot moves on dispatcher map within 15 seconds (no refresh)
- [ ] Add a test job with your home address as client address
- [ ] Walk within 2km of home address → client SMS arrives with tracking link
- [ ] Open tracking link → see technician dot → walk further → dot updates
- [ ] Tap Complete Job → job status updates to "complete" in dispatcher view
- [ ] Client receives a "job complete" SMS after Complete Job is tapped
- [ ] Turn on flight mode on the technician's phone for ~1 min while tracking →
      an "Offline - X pending" badge appears; turn flight mode back off → badge
      clears and the dispatcher map catches up with the latest position
- [ ] On the current job card, tap "Add voice note" (Chrome/Android only —
      button is hidden on browsers without Web Speech API support), speak a
      short note → transcribed text appears appended to the job's notes
- [ ] Call the business's Twilio number and let it go unanswered → caller
      receives the "missed you" auto-reply SMS

**Do not call a single client until every checkbox above is ticked.**

---

## File structure

```
minerva/
├── src/
│   ├── App.jsx                    # Router — all page routes
│   ├── main.jsx                   # React entry point
│   ├── index.css                  # Global styles
│   ├── supabaseClient.js          # Supabase singleton
│   ├── utils.js                   # Haversine, geocoding, PIN generator
│   └── pages/
│       ├── LandingPage.jsx        # Public marketing page
│       ├── Onboarding.jsx         # Business + technician signup
│       ├── SuccessPage.jsx        # Post-Stripe confirmation
│       ├── DispatcherView.jsx     # Live map dashboard (owner)
│       ├── TechnicianView.jsx     # Mobile tracking page (technician)
│       └── TrackingView.jsx       # Client-facing tracking link
├── supabase/
│   ├── schema.sql                 # Run this in Supabase SQL Editor first
│   └── functions/
│       ├── send-eta-sms/          # Fires the 15-min client SMS
│       ├── send-setup-sms/        # Fires technician setup SMS on onboarding
│       ├── send-completion-sms/   # Fires the "job complete" client SMS
│       ├── missed-call-webhook/   # Twilio Voice webhook: TwiML + missed-call SMS auto-reply
│       └── create-checkout-session/ # Creates Stripe checkout
├── index.html
├── package.json
├── vite.config.js
└── .env.local.example             # Copy to .env.local and fill in your values
```

---

## Pricing
- **Starter**: $49/technician/month — GPS map, ETA SMS, job start/complete
- **Standard**: $79/technician/month — everything + dispatch board, job scheduling, history
- **Standard (data sharing)**: $67/technician/month — 15% discount for opting into anonymised data sharing
- **Pro**: $119/technician/month — everything + invoicing, asset tracking, checklists (Stage 2)

---

## Support
Built and maintained by [Your name] | [Your mobile] | [Your email]
