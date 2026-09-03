-- Minerva — CRITICAL production hotfix (2026-09-02)
-- Every core table had RLS policies but no underlying table-level GRANT to
-- anon/authenticated/service_role. RLS policies are inert without the base
-- grant, so every anon-key read/write in the live app was failing with
-- "permission denied for table X" — dispatcher map, technician GPS,
-- customer intake, invoices, everything. Applied directly to production via
-- the Management API on 2026-09-02; this file makes it a tracked migration
-- so a fresh database setup doesn't repeat the same outage.
--
-- If this is ever re-run against a fresh Supabase project, run it
-- immediately after supabase_schema.sql (which creates the tables + RLS
-- policies but was missing these grants).

grant select, insert, update, delete on
  asset_telemetry_events, assets, businesses, checklist_photos,
  checklist_templates, client_verification_packages, consumables_items,
  custom_workflows, industrial_assets, industrial_leads, inventory_items,
  invoices, job_materials, jobs, leads, marketing_drafts, safety_incidents,
  site_checkins, site_projects, technician_credentials,
  technician_incidents, technician_locations, technicians,
  weather_reschedule_drafts, workflow_runs
to anon, authenticated, service_role;

-- Same bug on the 3 Agent Ops tables (Phase 1 of the Agent Operating
-- System build) — no INSERT/UPDATE needed here beyond what functions and
-- the read-only ?agents=1 dashboard tab need.
grant select, insert, update on
  agent_functions, agent_insights, agent_council_reports
to anon, authenticated, service_role;
