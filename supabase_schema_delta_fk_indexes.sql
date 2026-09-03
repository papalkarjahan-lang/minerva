-- Minerva — FK index delta (2026-09-02)
-- Found during a post-outage audit: every foreign-key column across the
-- entire schema was unindexed, including every business_id column (the
-- primary filter on nearly every query in the app — dispatcher view,
-- technician roster, invoices, leads, all scoped by business_id). Harmless
-- while tables are empty; would mean full table scans on every page load
-- once real customer data accumulates. Safe to run anytime — CREATE INDEX
-- IF NOT EXISTS, no data changes, no lock risk on empty/small tables.

create index if not exists idx_technicians_business_id on technicians(business_id);
create index if not exists idx_technicians_current_job_id on technicians(current_job_id);
create index if not exists idx_jobs_business_id on jobs(business_id);
create index if not exists idx_jobs_technician_id on jobs(technician_id);
create index if not exists idx_leads_business_id on leads(business_id);
create index if not exists idx_assets_assigned_technician_id on assets(assigned_technician_id);
create index if not exists idx_assets_business_id on assets(business_id);
create index if not exists idx_invoices_business_id on invoices(business_id);
create index if not exists idx_invoices_job_id on invoices(job_id);
create index if not exists idx_checklist_templates_business_id on checklist_templates(business_id);
create index if not exists idx_inventory_items_business_id on inventory_items(business_id);
create index if not exists idx_marketing_drafts_business_id on marketing_drafts(business_id);
create index if not exists idx_technician_locations_business_id on technician_locations(business_id);
create index if not exists idx_technician_locations_job_id on technician_locations(job_id);
create index if not exists idx_checklist_photos_business_id on checklist_photos(business_id);
create index if not exists idx_checklist_photos_job_id on checklist_photos(job_id);
create index if not exists idx_job_materials_business_id on job_materials(business_id);
create index if not exists idx_job_materials_inventory_item_id on job_materials(inventory_item_id);
create index if not exists idx_job_materials_job_id on job_materials(job_id);
create index if not exists idx_technician_credentials_business_id on technician_credentials(business_id);
create index if not exists idx_technician_credentials_technician_id on technician_credentials(technician_id);
create index if not exists idx_weather_reschedule_drafts_business_id on weather_reschedule_drafts(business_id);
create index if not exists idx_weather_reschedule_drafts_job_id on weather_reschedule_drafts(job_id);
create index if not exists idx_technician_incidents_business_id on technician_incidents(business_id);
create index if not exists idx_technician_incidents_job_id on technician_incidents(job_id);
create index if not exists idx_technician_incidents_technician_id on technician_incidents(technician_id);
create index if not exists idx_custom_workflows_business_id on custom_workflows(business_id);
create index if not exists idx_workflow_runs_business_id on workflow_runs(business_id);
create index if not exists idx_workflow_runs_workflow_id on workflow_runs(workflow_id);
create index if not exists idx_industrial_assets_business_id on industrial_assets(business_id);
create index if not exists idx_asset_telemetry_events_asset_id on asset_telemetry_events(asset_id);
create index if not exists idx_asset_telemetry_events_business_id on asset_telemetry_events(business_id);
create index if not exists idx_industrial_leads_business_id on industrial_leads(business_id);
create index if not exists idx_site_projects_business_id on site_projects(business_id);
create index if not exists idx_site_projects_industrial_lead_id on site_projects(industrial_lead_id);
create index if not exists idx_site_checkins_business_id on site_checkins(business_id);
create index if not exists idx_site_checkins_site_id on site_checkins(site_id);
create index if not exists idx_safety_incidents_business_id on safety_incidents(business_id);
create index if not exists idx_safety_incidents_site_id on safety_incidents(site_id);
create index if not exists idx_consumables_items_business_id on consumables_items(business_id);
create index if not exists idx_consumables_items_site_id on consumables_items(site_id);
create index if not exists idx_client_verification_packages_business_id on client_verification_packages(business_id);
create index if not exists idx_client_verification_packages_site_id on client_verification_packages(site_id);
create index if not exists idx_agent_insights_business_id on agent_insights(business_id);
