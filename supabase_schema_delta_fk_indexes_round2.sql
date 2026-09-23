-- Minerva — FK index delta, round 2 (2026-09-23)
-- The 2026-09-02 fk_indexes delta (supabase_schema_delta_fk_indexes.sql)
-- indexed every FK column that existed in the schema at that time. Several
-- tables/columns were added in LATER delta files (carbon_estimates, quotes,
-- roi_proposals, subcontractors, support_requests, job_assignments,
-- lead_activities.business_id, jobs.assigned_subcontractor_id,
-- corrective_actions.assigned_to_technician_id,
-- review_requests.business_id, voice_call_sessions.business_id) and were
-- never added to that list — same "unindexed FK, fine while empty, full
-- table scan once real data accumulates" risk. Verified this list directly
-- against the live database (cross-referencing
-- information_schema.table_constraints for every FK against pg_index for
-- every existing index's leading column), not by re-reading the SQL files,
-- so this reflects the actual current schema exactly. Same safety profile
-- as round 1: CREATE INDEX IF NOT EXISTS, additive only, no data changes,
-- no lock risk on these small/empty tables.

create index if not exists idx_carbon_estimates_business_id on carbon_estimates(business_id);
create index if not exists idx_carbon_estimates_job_id on carbon_estimates(job_id);
create index if not exists idx_carbon_estimates_site_id on carbon_estimates(site_id);
create index if not exists idx_corrective_actions_assigned_to_technician_id on corrective_actions(assigned_to_technician_id);
create index if not exists idx_job_assignments_business_id on job_assignments(business_id);
create index if not exists idx_job_assignments_technician_id on job_assignments(technician_id);
create index if not exists idx_jobs_assigned_subcontractor_id on jobs(assigned_subcontractor_id);
create index if not exists idx_lead_activities_business_id on lead_activities(business_id);
create index if not exists idx_quotes_business_id on quotes(business_id);
create index if not exists idx_quotes_lead_id on quotes(lead_id);
create index if not exists idx_review_requests_business_id on review_requests(business_id);
create index if not exists idx_roi_proposals_big_account_target_id on roi_proposals(big_account_target_id);
create index if not exists idx_roi_proposals_prospect_id on roi_proposals(prospect_id);
create index if not exists idx_subcontractors_business_id on subcontractors(business_id);
create index if not exists idx_support_requests_business_id on support_requests(business_id);
create index if not exists idx_voice_call_sessions_business_id on voice_call_sessions(business_id);
