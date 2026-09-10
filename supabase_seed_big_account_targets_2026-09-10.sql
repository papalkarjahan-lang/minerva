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

  -- TOP PICK #1 (added 2026-09-10, second research pass): by far the
  -- biggest confirmed fleet found of any single-family-owned candidate,
  -- with real independent media/industry prominence - the closest thing
  -- to a genuine "one deal, most of the 2026 goal" contract in this list.
  -- See notes for the one real caveat (existing ServiceTitan usage).
  ('Ken Hall Plumbers', 'multi_van', null, null, 122, 'Adelaide, SA', 'researching',
   'TOP PICK. CONFIRMED: 122 vehicles, 150+ staff (FIFTY+SA magazine profile), company''s own recent materials separately cite "100+ trades technicians" - both real, cited, public claims (minor variance between sources, not my estimate). Family-owned since founded 1983 by Ken Hall; now led by his son Brad Hall as CEO - single-family lineage, not a franchise, not part of a larger group; techs are direct employees per own site, not contractors. Real prominence signals: Family Business Association "Meet the Owner" feature, a published ServiceTitan customer case study, 40+ years trading. At 100-122 technicians this single contract alone would be worth roughly $95K-130K annualized at Minerva''s per-tech pricing - close to the entire 2026 goal from one deal. ONE REAL CAVEAT, state honestly on the first call: they are a confirmed existing ServiceTitan (field-service management) customer per the case study, so the pitch must be "complement/add compliance+GPS depth ServiceTitan doesn''t specialize in," not "replace your existing system from scratch" - do not assume they have no incumbent software. Sources: fiftyplussa.com.au/lifestyle/life/ken-hall-plumbers-south-australia/, kenhallplumbers.com.au/about-us/our-story/, familybusinessassociation.org (Meet the Owners event), servicetitan.com/blog (success story). Contact person/email/phone not researched - find live before outreach.'),

  -- TOP PICK #2 (confirmed earlier pass): smaller dollar value than Ken
  -- Hall, but the single highest-CONFIDENCE close in the whole list - no
  -- known incumbent competing software found, clean single-owner
  -- structure, real 40+ year multi-trade business. Pair with Ken Hall as
  -- the "high floor" pick against Ken Hall's "high ceiling" swing.
  ('Twin Electrics & Plumbing', 'multi_van', null, null, 30, 'Melbourne, VIC', 'researching',
   'TOP PICK. CONFIRMED: family-owned electrical/plumbing/HVAC business, operating since 1978 (second-generation owners Darren & Matt Cross), publicly states 30 fully equipped service vehicles (top4.com.au business directory listing, independently corroborated by "40+ years," "family owned & operated" on twinelectrics.com.au). No franchise structure, no incumbent competing software found in research (unlike Ken Hall/ServiceTitan) - the cleanest, highest-probability close in this batch, worth roughly $32K annualized at Minerva''s per-tech pricing. Contact person/email/phone not yet researched (avoid stale scraped personal contact info - find the actual owner/GM on LinkedIn or by calling their published number before the first outreach).'),

  -- Smaller multi-van, good "practice" call before the bigger targets -
  -- confirmed fleet size, family-owned.
  ('Multisparx', 'multi_van', null, null, 7, 'Sydney (Brookvale), NSW', 'researching',
   'CONFIRMED: family-owned electrical business, publicly states 7 vans on its own site (multisparx.com.au). Smaller than the ideal 10-50 van profile but real and verifiable - useful as a lower-stakes first call to rehearse the discovery script before approaching the top picks or the FM targets.'),

  -- Additional real candidates found during the "biggest single-owner
  -- fleet" research pass - kept in the pipeline at lower priority than
  -- the two top picks above because fleet size is unconfirmed via a
  -- primary source for both.
  ('Metropolitan Plumbing (Metropolitan Group Australia)', 'multi_van', null, null, null, 'Adelaide-founded, now multi-state', 'researching',
   'Real, high-profile, family-owned since 1995 (own site: metropolitanplumbing.com.au, metropolitan.net.au), self-describes as Australia''s largest emergency plumbing company with 600+ reviews - highest BRAND recognition of any candidate found, but fleet/technician count is NOT disclosed anywhere on their own site (UNCONFIRMED, do not assume "largest" means largest fleet). CAUTION: now operates across multiple states/cities, which raises real risk this is no longer a true single-decision-maker business - verify actual ownership/governance structure on the first call before treating as a fast single-owner close.'),

  ('Dorrington Plumbing, Gas & Electrical', 'multi_van', null, null, null, 'Perth, WA', 'researching',
   'Real, second-generation family/locally-owned business (own site: dorringtonplumbing.com.au), "serving Perth for over 2 decades." A secondary search snippet referenced "a fleet of 25 vehicles" but this could not be re-confirmed via the company''s own about-us page (returned 404 on direct fetch) or any other primary source - UNCONFIRMED, verify directly before relying on it.'),

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
