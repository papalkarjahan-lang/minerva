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
-- next_action / next_action_date are pre-filled so the Big Accounts tab
-- is an actual to-do list on first load, not just a list of names — dates
-- are staggered on purpose (top picks first) since the tab sorts by
-- next_action_date ascending. These are starting suggestions, not fixed
-- deadlines — edit freely once real progress is made on any of them.
--
-- Prerequisite: supabase_schema_delta_big_account_targets.sql must already
-- be run.
-- ============================================================

insert into big_account_targets
  (company_name, company_type, contact_email, contact_phone, estimated_fleet_size, region, stage, next_action, next_action_date, notes)
values

  -- TOP PICK #2 by dollar value but #1 by close-confidence — scheduled
  -- first (earliest next_action_date) since it's the highest-probability
  -- close in the whole list and the best one to start the outreach motion
  -- on.
  ('Twin Electrics & Plumbing', 'multi_van', null, null, 30, 'Melbourne, VIC', 'researching',
   'Find actual owner/GM contact (LinkedIn or call twinelectrics.com.au) and place the first discovery call using BIG_ACCOUNT_EXECUTION_KIT.md section 2 script.', '2026-09-12',
   'TOP PICK. CONFIRMED: family-owned electrical/plumbing/HVAC business, operating since 1978 (second-generation owners Darren & Matt Cross), publicly states 30 fully equipped service vehicles (top4.com.au business directory listing, independently corroborated by "40+ years," "family owned & operated" on twinelectrics.com.au). No franchise structure, no incumbent competing software found in research (unlike Ken Hall/ServiceTitan) - the cleanest, highest-probability close in this batch, worth roughly $32K annualized at Minerva''s per-tech pricing. Contact person/email/phone not yet researched (avoid stale scraped personal contact info - find the actual owner/GM on LinkedIn or by calling their published number before the first outreach).'),

  -- TOP PICK #1 by dollar value — the biggest confirmed fleet found of
  -- any single-family-owned candidate, with real independent media/
  -- industry prominence. Scheduled second, right after Twin Electrics,
  -- since it's the highest-value swing even though the ServiceTitan
  -- caveat makes it a slightly slower/harder sell to prep for properly.
  ('Ken Hall Plumbers', 'multi_van', null, null, 122, 'Adelaide, SA', 'researching',
   'Find actual decision-maker contact (Brad Hall, CEO, or an ops/fleet manager) and place the first discovery call. Prepare the "complement ServiceTitan" angle from BIG_ACCOUNT_EXECUTION_KIT.md before calling - do not lead with a generic pitch.', '2026-09-14',
   'TOP PICK. CONFIRMED: 122 vehicles, 150+ staff (FIFTY+SA magazine profile), company''s own recent materials separately cite "100+ trades technicians" - both real, cited, public claims (minor variance between sources, not my estimate). Family-owned since founded 1983 by Ken Hall; now led by his son Brad Hall as CEO - single-family lineage, not a franchise, not part of a larger group; techs are direct employees per own site, not contractors. Real prominence signals: Family Business Association "Meet the Owner" feature, a published ServiceTitan customer case study, 40+ years trading. At 100-122 technicians this single contract alone would be worth roughly $95K-130K annualized at Minerva''s per-tech pricing - close to the entire 2026 goal from one deal. ONE REAL CAVEAT, state honestly on the first call: they are a confirmed existing ServiceTitan (field-service management) customer per the case study, so the pitch must be "complement/add compliance+GPS depth ServiceTitan doesn''t specialize in," not "replace your existing system from scratch" - do not assume they have no incumbent software. Sources: fiftyplussa.com.au/lifestyle/life/ken-hall-plumbers-south-australia/, kenhallplumbers.com.au/about-us/our-story/, familybusinessassociation.org (Meet the Owners event), servicetitan.com/blog (success story). Contact person/email/phone not researched - find live before outreach.'),

  -- Smaller multi-van, good "practice" call before the bigger targets -
  -- confirmed fleet size, family-owned. Scheduled third - do this one to
  -- rehearse the discovery script with lower stakes before Ken Hall.
  ('Multisparx', 'multi_van', null, null, 7, 'Sydney (Brookvale), NSW', 'researching',
   'Practice call - find contact info and run through the full discovery script before calling Ken Hall or Twin Electrics.', '2026-09-15',
   'CONFIRMED: family-owned electrical business, publicly states 7 vans on its own site (multisparx.com.au). Smaller than the ideal 10-50 van profile but real and verifiable - useful as a lower-stakes first call to rehearse the discovery script before approaching the top picks or the FM targets.'),

  -- FM candidates: real, existing companies, but fleet/technician counts
  -- are private SME facts not published anywhere found in search - do not
  -- treat as confirmed. Fortis FM scheduled first among these since it
  -- already has a published contact (no research step needed before
  -- calling).
  ('Fortis FM', 'facilities_management', 'admin@fortisfm.com.au', '(07) 3472 7579', null, 'Brisbane / SEQ, QLD', 'researching',
   'Call the published number or email to qualify - ask fleet/technician count and current software directly (see discovery script section 2). Already has a public contact, no research step needed first.', '2026-09-17',
   'Real, existing FM company (fortisfm.com.au) with a published general contact email/phone. Employee/technician count NOT found in public search - UNCONFIRMED, verify on first call using the discovery script in BIG_ACCOUNT_EXECUTION_KIT.md section 2 (do not assume a number).'),

  ('Australian Facilities Management (AFM)', 'facilities_management', null, null, null, 'Melbourne, VIC', 'researching',
   'Find a general contact via the company site and qualify fleet/technician count on the first call.', '2026-09-19',
   'Real, existing FM company (australianfacilitiesmanagement.com.au). Fleet/technician size UNCONFIRMED via public search - verify on first call.'),

  ('FM Services Australia', 'facilities_management', null, null, null, 'Australia (national)', 'researching',
   'Find a general contact via the company site and qualify fleet/technician count on the first call.', '2026-09-19',
   'Real, existing FM company (fmservicesau.com). Fleet/technician size UNCONFIRMED via public search - verify on first call.'),

  ('FMS', 'facilities_management', null, null, null, 'Perth, WA', 'researching',
   'Find a general contact via the company site and qualify fleet/technician count on the first call.', '2026-09-19',
   'Real, existing FM company (fmservices.global). Fleet/technician size UNCONFIRMED via public search - verify on first call.'),

  -- Additional multi-van candidates found during the "biggest single-
  -- owner fleet" research pass - fleet size unconfirmed via a primary
  -- source for both, so scheduled after the FM batch, as a verify-first
  -- step rather than a straight discovery call.
  ('Metropolitan Plumbing (Metropolitan Group Australia)', 'multi_van', null, null, null, 'Adelaide-founded, now multi-state', 'researching',
   'Verify actual ownership/governance structure FIRST (may no longer be single-decision-maker given multi-state operations) before investing outreach effort.', '2026-09-21',
   'Real, high-profile, family-owned since 1995 (own site: metropolitanplumbing.com.au, metropolitan.net.au), self-describes as Australia''s largest emergency plumbing company with 600+ reviews - highest BRAND recognition of any candidate found, but fleet/technician count is NOT disclosed anywhere on their own site (UNCONFIRMED, do not assume "largest" means largest fleet). CAUTION: now operates across multiple states/cities, which raises real risk this is no longer a true single-decision-maker business - verify actual ownership/governance structure on the first call before treating as a fast single-owner close.'),

  ('Dorrington Plumbing, Gas & Electrical', 'multi_van', null, null, null, 'Perth, WA', 'researching',
   'Verify fleet size directly with the company (own about-us page returned a 404 during research) before pursuing as a qualified target.', '2026-09-21',
   'Real, second-generation family/locally-owned business (own site: dorringtonplumbing.com.au), "serving Perth for over 2 decades." A secondary search snippet referenced "a fleet of 25 vehicles" but this could not be re-confirmed via the company''s own about-us page (returned 404 on direct fetch) or any other primary source - UNCONFIRMED, verify directly before relying on it.'),

  -- Council: real, confirmed to run its own in-house trades crew (not
  -- outsourced), but per the playbook's own caveat this is realistically a
  -- 2027 win given government procurement cycles, not a 2026 target -
  -- scheduled furthest out on purpose, as a relationship-starting step,
  -- not an urgent close.
  ('Liverpool City Council', 'council', null, null, null, 'Liverpool, NSW', 'researching',
   '2027 target, not urgent - find the council''s vendor-registration/procurement contact and get Minerva on their radar ahead of their next budget cycle. Do not expect or chase a 2026 close.', '2026-10-05',
   'CONFIRMED: council runs its own in-house Trades Services team (liverpool.nsw.gov.au), not fully outsourced - a genuine single-employer trades fleet. Per BIG_CONTRACTS_PLAYBOOK.md section 3 caveat, treat this as a 2027 target: start the relationship now (get on their vendor radar) but do not count it toward 2026 numbers - formal tender/procurement cycles are typically 3-6+ months and budget-cycle-gated. Fleet size UNCONFIRMED.');

-- ============================================================
-- Addition (2026-09-10, third research pass): broader-trade candidates
-- (locksmith, security, garage-door, pest-control, HVAC, cleaning) found
-- while trying to answer "what would it take to reach $500K by Dec 31" -
-- see the math in BIG_CONTRACTS_PLAYBOOK.md section 7 / chat: even adding
-- every one of these at 100% close (unrealistic) does not get anywhere
-- close to $500K, because single-owner trade companies of this size are
-- naturally capped in headcount - the ceiling is real, not a
-- lack-of-searching problem. Kept in the pipeline anyway because they're
-- genuinely real, decent-fit candidates for ongoing 2026/2027
-- pipeline-building. Scheduled after the main batch above (later
-- next_action_date) since none individually moves the big number.
-- ============================================================

insert into big_account_targets
  (company_name, company_type, contact_email, contact_phone, estimated_fleet_size, region, stage, next_action, next_action_date, notes)
values

  ('A. Abbott Locksmiths', 'multi_van', null, null, 18, 'Sydney (Campsie/Hurstville), NSW', 'researching',
   'Find contact info and call to confirm fleet size (18 professionals vs. 10 vans - clarify which is the real billable-seat count) before proposing.', '2026-09-23',
   'CONFIRMED: own site states "18 Expert Locksmith Professionals and 10 Mobile Locksmith Vans" (abbottlocksmiths.com.au) - used 18 as the technician-seat estimate, though the van count (10) is a more conservative floor if not every professional has their own van. Family-owned, independent, 50+ years operating. ~$14K-19K/yr if closed at $79-89/tech.'),

  ('Mr Splash Plumbing', 'multi_van', null, null, 15, 'Sydney, NSW', 'researching',
   'Find contact info and place a discovery call - confirm exact van count (site says "over 15").', '2026-09-23',
   'CONFIRMED: own site states "over 15 fully stocked vans across Sydney" (mrsplashplumbing.com.au) - used 15 as a floor since the real number is "over" that. Family-owned (Jon & Tara Tsingolis), grew from one van, 20+ years, some industry press coverage (OwnerDriver fleet feature). ~$14K-16K/yr if closed.'),

  ('CLASS Locksmiths (Complete Lock and Security Services)', 'multi_van', null, null, 10, 'Canberra (Fyshwick), ACT', 'researching',
   'Find contact info and place a discovery call - confirm whether the 4 commercial support vehicles are also billable technician seats.', '2026-09-24',
   'CONFIRMED: own site states "a fleet of ten service vans and four commercial support vehicles" (classlocks.com.au) - used 10 (service vans only) as the technician-seat estimate, excluding support vehicles which may not be field-billable seats. Independently owned since 1986, serves ACT government/commercial/residential. ~$9.5K-10.7K/yr if closed on service vans alone.'),

  ('M.A.S.S. Electrics Pty Ltd', 'multi_van', null, null, 9, 'Melbourne (Keilor Park), VIC', 'researching',
   'Low-priority practice call - find contact info and confirm fleet size.', '2026-09-25',
   'CONFIRMED: own site states "9 fully equipped service vans on the road" (masselectrics.com.au). Family-owned, three generations, established 1985, real commercial clients cited (McDonald''s, Bunnings, IGA). Smallest of the newly-found confirmed-fleet candidates - ~$8.5K-9.6K/yr if closed - useful as another practice call, not a big-money target on its own.'),

  ('Garage Door Solutions (VIC)', 'multi_van', null, null, null, 'Melbourne (Braeside/eastern & bayside), VIC', 'researching',
   'Verify actual field-technician headcount (the published "20+ employees" mixes admin and field roles) before proposing.', '2026-09-26',
   'Real, family-owned (Van Den Broek family) since 1962, 60+ years operating (garagedoorsolutions.com.au). Own site states "over 20 loyal and experienced employees" but this figure is NOT confirmed to be field technicians specifically (may include admin/office staff) - UNCONFIRMED for revenue purposes, verify actual field-tech headcount on the first call.'),

  ('Best Doors', 'multi_van', null, null, null, 'HQ Narangba, QLD - branches Brisbane/Adelaide/Melbourne/Rockhampton/Gladstone/Bundaberg/Townsville/Cairns/Mackay/Toowoomba/Sunshine Coast/Newcastle', 'researching',
   'Verify actual decision-making structure FIRST (single HQ owner vs. semi-independent regional branches) - do not invest real outreach effort until this is confirmed.', '2026-09-28',
   'Real, "family-owned Australian company" since 1975 per own site (bestdoors.com.au), "80+ dedicated people from technicians to administrators." CAUTION - two real risks before treating this as a fast single-decision-maker close: (1) the 80+ figure mixes technicians and admin, not a clean tech count; (2) it operates via a multi-region branch network across many states, which raises real doubt about whether one person can actually say yes for the whole network the way BIG_CONTRACTS_PLAYBOOK.md section 1 requires - verify actual decision-making structure (single HQ owner vs. semi-independent regional branches) before investing outreach effort here.'),

  ('Australian Security', 'multi_van', null, null, null, 'Melbourne (Box Hill), VIC', 'researching',
   'Find contact info and qualify actual technician headcount on the first call - self-described as "one of the largest" but unconfirmed, worth checking given the wildcard upside.', '2026-09-28',
   'Real, describes itself as "one of Melbourne''s largest privately owned and operated Security System installers," operating since 1986 (australiansecurity.com.au), "a large team of licensed security technicians" - no exact count published. Potentially a decent-size wildcard (self-described as one of the largest in its category) but genuinely UNCONFIRMED - do not assume it is large without verifying on the first call.'),

  ('Associated Cleaning Services', 'other', null, null, null, 'Brisbane (Newstead), QLD', 'researching',
   'Lowest priority in this batch - call to understand ownership structure AND whether the per-technician GPS/compliance pitch is even relevant to site-based cleaning staff before investing further time.', '2026-09-30',
   'Real, established 1969, "Australian-owned," own site states "450+ cleaners" servicing "400+ sites nationally" (associatedcleaning.com.au) - large headcount signal, but TWO real caveats: (1) ownership structure (single family owner vs. a more corporate/consolidated structure) is NOT confirmed, unlike the trade companies above; (2) commercial cleaning staff are typically site-based rather than vehicle-fleet/GPS-dispatch technicians, so the product fit (GPS/route tracking) is weaker than for trade/field-service companies - worth a call to understand if this fits the same per-technician compliance/tracking pitch at all before treating as comparable to the multi-van targets.')
;

-- Smaller, unconfirmed-fleet candidates found in the same research pass
-- but with NO fleet/technician count published anywhere and no unusually
-- strong prominence signal beyond "family owned, N years operating" -
-- kept out of the main list above to avoid pipeline clutter, but real and
-- worth a look if the above list is exhausted: Perth Pest Control (WA),
-- Perkins Exterminators (Melbourne), ART Security (Melbourne), Casals
-- Security (Melbourne), GAM Air Conditioning (Sydney), Whywait Plumbing
-- (Gold Coast), Charlie The Plumber (Gold Coast/Logan), Duncan's Plumbing
-- Heating & Air Conditioning (Canberra), Infratec Security Systems
-- (Adelaide), Fleet Pest Control (Melbourne).

-- No ON CONFLICT clause: there is no unique constraint on company_name (a
-- real company legitimately could appear once per region), so this file
-- is intentionally a run-once seed, not an idempotent delta. Check the
-- Big Accounts tab first if unsure whether it's already been run.
