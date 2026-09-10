-- ============================================================
-- MINERVA - Delta: roi_proposals (2026-09-10)
--
-- What this is: a shareable, personalized ROI one-pager for a specific
-- big-account prospect (multi-van company, FM company, etc.) — quantifies
-- estimated fuel/time savings and compliance value for THEIR fleet size,
-- using the real, cited industry benchmarks in generate-roi-proposal's
-- header comment (not invented numbers). Built to make the "one big
-- contract" pitch concrete and specific instead of a generic pitch deck.
--
-- Access model: same unguessable-UUID-as-bearer-token pattern already used
-- by `quotes`/`invoices` (see SECURITY_NOTES.md) — anyone with the link can
-- view it, nobody without the link can guess it. Read-only for anon (unlike
-- quotes, a prospect never needs to write back to this row) — all writes
-- go through generate-roi-proposal using the service role key.
--
-- NOTE: run this once in the Supabase SQL Editor.
-- ============================================================

create table if not exists roi_proposals (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references outreach_prospects(id) on delete set null,
  company_name text not null,
  contact_name text,
  trade_type text,
  fleet_size int not null,
  avg_monthly_fuel_spend numeric,        -- optional input; estimated from fleet_size if omitted
  estimated_monthly_fuel_savings numeric not null,
  estimated_annual_fuel_savings numeric not null,
  estimated_minerva_monthly_cost numeric not null,
  created_at timestamptz not null default now()
);

alter table roi_proposals enable row level security;

drop policy if exists "anon select roi_proposals" on roi_proposals;
create policy "anon select roi_proposals" on roi_proposals
  for select using (true);

grant select on roi_proposals to anon;
