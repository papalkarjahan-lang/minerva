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
6. Go to **Settings → API** → copy your Project URL and anon key

### 2. Mapbox (maps)
1. Go to https://mapbox.com → Sign up
2. Go to Tokens → copy your default public token (starts with `pk.eyJ1`)

### 3. Twilio (SMS)
1. Go to https://twilio.com → Sign up
2. Get a trial Australian number
3. Copy your Account SID and Auth Token from the Console

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
```

Deploy all functions:
```bash
supabase functions deploy send-eta-sms
supabase functions deploy send-setup-sms
supabase functions deploy create-checkout-session
```

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
