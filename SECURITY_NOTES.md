# Minerva — Security Model & Known Tradeoffs

Read this before onboarding your first real client. It explains what protects
customer data today, what doesn't, and when to fix it.

## The model: unguessable links, not logins

Minerva has zero login screens by design — that's core to the "20-minute
setup on a screen share" pitch. Access to a business's data is controlled
entirely by possession of an unguessable URL or PIN:

- **Dispatcher board** (`/dispatch/:businessId`) — businessId is a random
  UUIDv4 (122 bits of randomness, not sequential, not guessable by brute force)
- **Client tracking link** (`/track/:jobId`) — same, a random UUIDv4
- **Technician setup link** (`/tech?pin=...`) — an 8-character random
  alphanumeric PIN (~1e12 combinations)

This means: **anyone who has the link has full access to that business's
dispatch board** (see every client's name/phone/address, every technician's
live GPS position, and can add/reassign jobs). There is no password behind
it. This is a deliberate, documented tradeoff for a fast-moving MVP with a
small number of trusted pilot clients — not an accident, but also not
appropriate to scale indefinitely without revisiting.

**What this means practically for you, day to day:**
- Never post a dispatch or tracking link anywhere public (social media, a
  public support ticket, etc.)
- Send the dispatch link to the business owner privately (e.g. in the
  onboarding email/SMS), the same way you'd hand over a admin password
- If a client asks "can anyone see my technicians' locations?" — the honest
  answer is "only someone with your specific dispatch link," which is true
  as long as the link itself is treated as a secret

## What's already fixed

- Removed a policy that would have granted **any authenticated Supabase
  user** (including someone who self-registers a free account) full
  read/write access to *every* business's data, not just their own. Nothing
  in the app uses Supabase Auth sessions, so this was pure unused attack
  surface — it's been removed entirely rather than scoped.
- Technician PINs upgraded from 6-digit numeric (900,000 combinations, no
  rate limiting) to 8-character alphanumeric (~1e12 combinations).

## Day-1 setup step (do this once, in Supabase Dashboard)

Go to **Authentication → Providers** and turn **off** "Allow new users to
sign up." This closes off the authenticated-role attack surface completely,
as a belt-and-suspenders measure, in case any future policy accidentally
reintroduces `auth.role() = 'authenticated'` access.

## Why full row-level tenant isolation isn't implemented yet

Supabase Realtime (used for the live GPS map) checks each subscriber against
your RLS SELECT policy before delivering a change event. Since there's no
login, the app runs entirely on the `anon` key — so RLS can't distinguish
"business A's dispatcher" from "a stranger," and can't be scoped tighter
than "you need to already know the row's id" without breaking the live map
entirely. This is a real constraint of the anon-key + no-login + Realtime
combination, not an oversight.

## Phase 2 priority: before scaling past ~10-15 trusted pilot clients

Add real per-owner authentication (Supabase Auth magic-link email login for
business owners only — technicians and clients can keep their current
PIN/link flow, which is lower-stakes and fine to leave as-is). This lets RLS
policies scope by `auth.uid()` instead of "knows the URL," closing the
"link leaked = full access" exposure. Budget this before pursuing any
enterprise client, any client with sensitive commercial data, or before
client count makes "treat every link as a secret" operationally unrealistic.
