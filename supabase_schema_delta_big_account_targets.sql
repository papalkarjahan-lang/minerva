-- ============================================================
-- MINERVA - Delta: big_account_targets (2026-09-10)
--
-- What this is: a lightweight CRM for the 5-10 named big-account targets
-- from BIG_CONTRACTS_PLAYBOOK.md (multi-van trade companies, facilities-
-- management companies, council fleets, strata managers) — deliberately
-- SEPARATE from `outreach_prospects`, because that table models a fast
-- draft->send->reply email flow, and a real research shows these deals run
-- 3-6+ months with multiple stakeholders (Fleet Manager, Finance,
-- Procurement, COO) and no single "send email" action — see
-- BIG_ACCOUNT_EXECUTION_KIT.md for the stakeholder map and discovery/
-- objection-handling scripts this table is meant to be used alongside.
--
-- Every row here is entered/edited by the operator by hand in the admin
-- console (AdminConsole.jsx's "Big Accounts" tab) — there is no AI-drafting
-- or automated-send step for this table at all, so unlike
-- `outreach_prospects` there's no service-role-only write model: admin_users
-- get direct insert/select/update, the same direct-write pattern already
-- used for `businesses.subscription_tier` (overrideTier) and
-- `support_requests` (resolveRequest) elsewhere in AdminConsole.jsx.
--
-- NOTE: run this once in the Supabase SQL Editor. Safe to re-run (uses
-- `if not exists` guards throughout).
-- ============================================================

create table if not exists big_account_targets (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  company_type text,            -- 'multi_van', 'facilities_management', 'council', 'strata', 'other'
  contact_name text,
  contact_title text,
  contact_email text,
  contact_phone text,
  estimated_fleet_size int,
  region text,
  stage text not null default 'researching', -- researching -> contacted -> discovery_call -> proposal_sent -> negotiating -> closed_won -> closed_lost
  next_action text,
  next_action_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_big_account_targets_stage on big_account_targets(stage);

-- Links a generated ROI proposal back to the big-account target it was
-- made for, so the admin console can show "proposal already sent" after a
-- page reload instead of only for the current browser session. Nullable —
-- proposals generated from the existing Outreach tab (for an
-- outreach_prospects row) leave this null, same as roi_proposals.prospect_id
-- being null for proposals generated from here.
alter table roi_proposals add column if not exists big_account_target_id uuid references big_account_targets(id) on delete set null;

alter table big_account_targets enable row level security;

drop policy if exists "admin select big_account_targets" on big_account_targets;
create policy "admin select big_account_targets" on big_account_targets
  for select using (exists (select 1 from admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin insert big_account_targets" on big_account_targets;
create policy "admin insert big_account_targets" on big_account_targets
  for insert with check (exists (select 1 from admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin update big_account_targets" on big_account_targets;
create policy "admin update big_account_targets" on big_account_targets
  for update using (exists (select 1 from admin_users a where a.user_id = auth.uid()));

grant select, insert, update on big_account_targets to authenticated;
