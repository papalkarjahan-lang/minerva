-- ============================================================
-- MINERVA — Delta: scope `businesses` SELECT by role, close the
-- competitive-intelligence/PII leak, 2026-10-10. Adds 2 policies + 1
-- column-grant pair, no new columns. Run this entire block once in the
-- Supabase SQL Editor.
--
-- What this fixes: `businesses` has carried a single SELECT policy,
-- "anon select business" (`supabase_schema.sql` — for select using
-- (true)), since the original schema. Despite its name, this policy has
-- no `TO <role>` restriction, so by plain Postgres default it applies to
-- EVERY role — anon AND authenticated alike. Combined with the 2026-09-14
-- UPDATE fix (`rls_scoping_v3.sql`, which DID correctly scope UPDATE to
-- owner/admin), this left SELECT as the one operation still fully open:
-- any already-logged-in business owner — a real, paying customer — could
-- read every OTHER business's full row, including contact_email,
-- contact_phone, subscription_tier, stripe_customer_id, stripe_sub_id,
-- and payment_failed_at, just by running the exact same unfiltered query
-- AdminConsole.jsx's own loadBusinesses() uses (no `.eq('id', ...)`), with
-- their own ordinary session. Found while reviewing SECURITY_NOTES.md's
-- "Phase 2 priority" section for this project's stated goal of serving
-- hundreds of real customers — that section's own "still open" bullet
-- about this table cited "~45 background agent edge functions run on the
-- anon key" as a blocker, which the SAME section's own correction two
-- paragraphs above it had already proven false (every background agent
-- uses service_role, confirmed again independently here) — a stale
-- internal contradiction, not a currently-accurate reason this couldn't
-- be fixed.
--
-- Traced EVERY real caller before writing this (not assumed) — both a
-- grep of every direct `.from('businesses')` call and a separate,
-- independent trace of every embedded `businesses(...)` join from
-- another table, including the exact auth-timing of the one case that
-- could have broken production if gotten wrong (TechnicianView.jsx's PIN
-- login, confirmed to run authenticated as the technician's own session
-- by the time it reads businesses, not anon). Full caller inventory:
--
-- ANON (no login, unguessable-link model — genuinely needs to read ANY
-- business by id, but only a narrow, safe column set):
--   - IntakeAssistant.jsx: id, name, trade_type, city
--   - SuccessPage.jsx: sector
--   - Onboarding.jsx: id, name (reads back its own INSERT)
--   - DisputeView.jsx, TrackingView.jsx, ClientHistoryView.jsx,
--     QuoteView.jsx (all embedded joins from jobs/technicians/
--     client_portal_links/quotes): name only
--   - InvoiceView.jsx (embedded join from invoices): name, abn — the
--     "Tax Invoice" vs "Invoice" heading and the printed ABN both depend
--     on this; easy to miss since every other anon reader only needs
--     `name`, which is exactly why the embedded-join trace mattered.
--
-- AUTHENTICATED, needs its OWN full row only:
--   - RequireBusinessAuth.jsx / DispatcherView.jsx /
--     IndustrialDispatcherView.jsx: the logged-in owner's own business,
--     including the one-time first-login claim (owner_user_id still
--     null, contact_email matches the caller's own JWT email) — same
--     3-branch shape already proven in rls_scoping_v3's UPDATE policy,
--     replicated here for SELECT.
--   - TechnicianView.jsx's PIN-login embedded `businesses(*)`: runs
--     authenticated as the TECHNICIAN's own session (via
--     technician-login + verifyOtp), not the owner's — needs a 4th
--     branch (technicians.auth_user_id = auth.uid() for that business)
--     that no prior pass on this table ever added, confirmed missing by
--     re-reading rls_scoping_v2's and v3's own "deliberately not
--     touched" reasoning for businesses, neither of which mentions
--     technicians at all. Without this branch, this fix would have
--     silently cut off the Pro-tier gate, trial/cancelled banners, and
--     addon detection for every technician at every business — not with
--     an error, just `businesses: null` forever. Caught before shipping
--     by independently tracing this exact path rather than assuming the
--     owner-or-admin shape from the UPDATE policy would transfer as-is.
--
-- AUTHENTICATED, needs to read ANY business (by design):
--   - AdminConsole.jsx: admin_users membership.
--
-- SERVICE_ROLE (bypasses RLS entirely, unaffected either way): all 29
-- edge functions that read businesses via a direct or embedded query —
-- confirmed every single one uses SUPABASE_SERVICE_ROLE_KEY, not anon.
--
-- Column-level anon allowlist, not an ever-growing exclusion list: rather
-- than naming every sensitive column to revoke (which this table already
-- has 3 narrower, never-yet-applied precedents for —
-- businesses_secret_columns.sql, checkout_hijack_guard.sql — both still
-- correct and left as-is, now redundant-but-harmless once this runs,
-- since REVOKE is idempotent either order), this does the reverse: revoke
-- ALL anon column access, then grant back only the 6 columns a real anon
-- caller above actually uses. A future column added to this table is
-- anon-unreadable by default unless someone deliberately opens it, rather
-- than silently exposed until someone remembers to add it to a revoke
-- list — the same shift in posture an allowlist always buys over a
-- blocklist.
--
-- Unresolved and flagged, not fixed here (deliberately out of scope for
-- this pass): whether PostgREST's embedded `(*)` wildcard interacts with
-- a column-level REVOKE the same way a top-level `select('*')` does is a
-- genuine runtime-behavior question neither this session nor a static
-- code read can answer with certainty. Rather than depend on that answer
-- either way, TechnicianView.jsx's `businesses(*)` is being rewritten
-- (separate frontend commit) to the exact explicit field list it actually
-- uses, which behaves identically to any other named-column embed
-- (proven safe — InvoiceView.jsx's `businesses(name, abn)` already works
-- this way) regardless of how the wildcard case resolves.
--
-- Also flagged, not fixed here: `technicians` itself carries the exact
-- same unrestricted-by-role SELECT shape ("anon select technicians",
-- supabase_schema.sql) — deliberately, per that policy's own comment
-- ("needed by PIN login, the dispatcher's live map, and the client
-- tracking page... cannot be narrowed... without breaking live
-- tracking"). That's a separate, already-reasoned-through tradeoff
-- involving Realtime subscriptions, not an oversight this delta
-- introduces or is trying to close — noted here only so it isn't
-- mistaken for the same bug once this one's fixed.
-- ============================================================

drop policy if exists "anon select business" on businesses;

create policy "anon select business" on businesses
  for select
  to anon
  using (true);

create policy "owner admin technician or unclaimed select business" on businesses
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_user_id is null and contact_email is not null and lower(contact_email) = lower(auth.jwt() ->> 'email'))
    or exists (select 1 from admin_users a where a.user_id = auth.uid())
    or exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = businesses.id)
  );

revoke select on businesses from anon;
grant select (id, name, trade_type, city, sector, abn) on businesses to anon;

-- Verify after running (as the anon key, no login — safe, read-only):
--
-- curl "https://xiikytqxevivrupkljwc.supabase.co/rest/v1/businesses?select=id,name,trade_type,city,sector,abn&limit=1" \
--   -H "apikey: YOUR_ANON_KEY" -H "Authorization: Bearer YOUR_ANON_KEY"
-- Expect: 200, one row with just those 6 fields.
--
-- curl "https://xiikytqxevivrupkljwc.supabase.co/rest/v1/businesses?select=contact_email&limit=1" \
--   -H "apikey: YOUR_ANON_KEY" -H "Authorization: Bearer YOUR_ANON_KEY"
-- Expect: 400, `42501 permission denied for table businesses` — not real
-- data back.
--
-- Then confirm nothing legitimate broke: your own test business's
-- dispatcher login, a technician's PIN login (check the Pro-tier
-- checklist/invoicing flow specifically, if that test business is on
-- Pro — this is exactly the path this delta's own header says would have
-- silently broken without the technician branch), the admin console's
-- business list, and a public invoice link (/invoice/:id) all still
-- load correctly.
--
-- Finally, the actual bug this delta fixes — a real AUTHENTICATED owner
-- reading a business they don't own — needs its own check, since neither
-- curl above (anon) nor the login spot-checks above exercise it. Run in
-- the Supabase SQL Editor with two real business ids from your own test
-- data (DAY7_LAUNCH_CHECKLIST.md's sections 1 and 8 already create two):
--
-- set role authenticated;
-- set request.jwt.claims = '{"sub": "<business 1's owner_user_id>", "role": "authenticated"}';
-- select id, name, contact_email, subscription_tier from businesses where id = '<business 2's id>';
-- reset role;
--
-- Expect: 0 rows (not an error — RLS silently filters, same as every
-- other row-level policy). Before this delta, this same query returned
-- business 2's full row.
