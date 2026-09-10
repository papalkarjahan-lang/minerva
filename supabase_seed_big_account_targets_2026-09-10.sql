-- ============================================================
-- MINERVA - Seed (one-time, data only): named big-account targets
-- (2026-09-10)
--
-- What this is: real, named candidate companies found via public web
-- research (WebSearch, equivalent to manual Google searching — not
-- automated scraping of LinkedIn/Google Maps) against the target profiles
-- defined in BIG_CONTRACTS_PLAYBOOK.md section 3. Deliberately named
-- `seed_` not `schema_delta_` — this is DATA, not a DDL migration, and
-- unlike the schema deltas it is NOT safe to blindly re-run (re-running
-- will insert duplicate rows since there's no natural unique key to guard
-- on) — run this ONCE.
--
-- Honesty discipline applied (see BIG_ACCOUNT_EXECUTION_KIT.md guardrails):
-- - estimated_fleet_size is populated ONLY where a real source confirmed a
--   number. Left NULL everywhere else rather than guessing a plausible
--   number.
-- - contact_email/contact_phone are only the company's own published
--   general business contact info (never a scraped/guessed personal
--   address).
-- - contact_name/contact_title are left NULL for every row — no specific
--   individual decision-maker was researched or compiled, by design (see
--   BIG_ACCOUNT_EXECUTION_KIT.md section on privacy discipline). Find the
--   actual contact person live on the first call/LinkedIn look-up, don't
--   rely on a static seeded name that may be stale or wrong.
-- - Every row's `notes` states what is confirmed vs. what still needs
--   verifying on the first discovery call, and cites where the fact came
--   from.
--
-- Prerequisite: supabase_schema_delta_big_account_targets.sql must already
-- be run.
-- ============================================================

insert into big_account_targets
  (company_name, company_type, contact_email, contact_phone, estimated_fleet_size, region, stage, notes)
values

  -- Strongest match: confirmed fleet size from the company's own marketing
  -- materials, family-owned (single decision-maker), matches the 10-50 van
  -- profile in BIG_CONTRACTS_PLAYBOOK.md almost exactly.
  ('Twin Electrics & Plumbing', 'multi_van', null, null, 30, 'Melbourne, VIC', 'researching',
   'CONFIRMED: family-owned electrical/plumbing business, operating since 1978, publicly states 30 vans/30 technicians on its own site (twinelectrics.com.au). Best-fit candidate in this batch - single ownership, right size, no franchise structure found. Contact person/email/phone not yet researched (avoid stale scraped personal contact info - find the actual owner/GM on LinkedIn or by calling their published number before the first outreach).'),

  -- Smaller multi-van, good "practice" call before the bigger targets -
  -- confirmed fleet size, family-owned.
  ('Multisparx', 'multi_van', null, null, 7, 'Sydney (Brookvale), NSW', 'researching',
   'CONFIRMED: family-owned electrical business, publicly states 7 vans on its own site (multisparx.com.au). Smaller than the ideal 10-50 van profile but real and verifiable - useful as a lower-stakes first call to rehearse the discovery script before approaching Twin Electrics or the FM targets.'),

  -- FM candidates: real, existing companies, but fleet/technician counts
  -- are private SME facts not published anywhere found in search - do not
  -- treat as confirmed.
  ('Fortis FM', 'facilities_management', 'admin@fortisfm.com.au', '(07) 3472 7579', null, 'Brisbane / SEQ, QLD', 'researching',
   'Real, existing FM company (fortisfm.com.au) with a published general contact email/phone. Employee/technician count NOT found in public search - UNCONFIRMED, verify on first call using the discovery script in BIG_ACCOUNT_EXECUTION_KIT.md section 2 (do not assume a number).'),

  ('Australian Facilities Management (AFM)', 'facilities_management', null, null, null, 'Melbourne, VIC', 'researching',
   'Real, existing FM company (australianfacilitiesmanagement.com.au). Fleet/technician size UNCONFIRMED via public search - verify on first call.'),

  ('FM Services Australia', 'facilities_management', null, null, null, 'Australia (national)', 'researching',
   'Real, existing FM company (fmservicesau.com). Fleet/technician size UNCONFIRMED via public search - verify on first call.'),

  ('FMS', 'facilities_management', null, null, null, 'Perth, WA', 'researching',
   'Real, existing FM company (fmservices.global). Fleet/technician size UNCONFIRMED via public search - verify on first call.'),

  -- Council: real, confirmed to run its own in-house trades crew (not
  -- outsourced), but per the playbook's own caveat this is realistically a
  -- 2027 win given government procurement cycles, not a 2026 target.
  ('Liverpool City Council', 'council', null, null, null, 'Liverpool, NSW', 'researching',
   'CONFIRMED: council runs its own in-house Trades Services team (liverpool.nsw.gov.au), not fully outsourced - a genuine single-employer trades fleet. Per BIG_CONTRACTS_PLAYBOOK.md section 3 caveat, treat this as a 2027 target: start the relationship now (get on their vendor radar) but do not count it toward 2026 numbers - formal tender/procurement cycles are typically 3-6+ months and budget-cycle-gated. Fleet size UNCONFIRMED.');

-- No ON CONFLICT clause: there is no unique constraint on company_name (a
-- real company legitimately could appear once per region), so this file
-- is intentionally a run-once seed, not an idempotent delta. Check the
-- Big Accounts tab first if unsure whether it's already been run.
