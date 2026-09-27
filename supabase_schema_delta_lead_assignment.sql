-- Lead assignment / ownership (added 2026-09-27)
-- Purely additive. Salesforce/HubSpot-style "lead owner" — lets a
-- dispatcher note which technician is handling follow-up on a given lead.
-- Reuses the exact assigned_technician_id pattern already used on assets
-- (see assignAsset() in DispatcherView.jsx and the assets table in
-- supabase_schema.sql) rather than inventing a new convention.
--
-- Nullable, and NOT an access-control boundary: every dispatcher/owner
-- already sees every lead in the business regardless of assignment (same
-- trust model as the rest of this table — see LEADS comment in
-- supabase_schema.sql). This is purely a display/filter aid so a multi-tech
-- business can tell who's chasing which lead, not a permission gate.

alter table leads add column if not exists assigned_to_technician_id uuid references technicians(id) on delete set null;
create index if not exists idx_leads_assigned_to on leads (assigned_to_technician_id);
