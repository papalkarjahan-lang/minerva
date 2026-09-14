-- ============================================================
-- MINERVA - Delta: public inbound enterprise leads (2026-09-14)
--
-- CONTEXT: big_account_targets (supabase_schema_delta_big_account_targets.sql)
-- was designed as an operator-only CRM — every row entered by hand in
-- AdminConsole.jsx's "Big Accounts" tab, no public writer at all. That was
-- correct for the original "5-10 named targets the operator researched"
-- model, but there was never a way for a multi-van fleet, facilities-
-- management company, council, or strata manager who finds the new public
-- /enterprise page on their own to self-identify — every enterprise lead
-- had to start as the operator manually typing in a company name they'd
-- already found some other way.
--
-- This adds a SEPARATE, narrowly-scoped anon INSERT policy so the public
-- /enterprise page's lead form can write directly, while keeping every
-- other property of this table exactly as restrictive as before:
--   - SELECT/UPDATE stay admin-only (an inbound submitter can never read
--     back this table, including their own row, or anyone else's pipeline
--     data — same as support_requests' existing anon-insert-only pattern).
--   - The `with check` clause forces stage='researching' and blocks
--     next_action/next_action_date from being set on insert — the two
--     fields that represent the operator's own internal working state.
--     A public submitter can create a new row, but cannot fast-forward it
--     through the pipeline or inject fake internal notes-to-self.
--   - No new DELETE grant.
-- Safe to re-run.
-- ============================================================

drop policy if exists "anon insert big_account_targets inbound" on big_account_targets;
create policy "anon insert big_account_targets inbound" on big_account_targets
  for insert
  with check (
    stage = 'researching'
    and next_action is null
    and next_action_date is null
  );

grant insert on big_account_targets to anon;
