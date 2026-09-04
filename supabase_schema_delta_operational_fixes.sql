-- ============================================================
-- MINERVA — Delta: operational-fidelity fixes (2026-09-04, "free time"
-- audit pass). Found via a systematic audit of technician-phone flows,
-- cross-agent/cross-system links, and doc-vs-code accuracy. Purely
-- additive — one new column, plus backfilling agent_functions rows for
-- cron functions that were deployed/scheduled but never registered with
-- the Agent OS health-tracking system (so they were invisible to
-- test-agent-health and the kill-switch, even though the switch itself
-- isn't read by any function yet — see agent_infra.sql's own header note).
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

-- invoices.client_sms_failed: set by TechnicianView's submitInvoice() when
-- send-invoice-sms returns an error. Previously this failure was silent —
-- the invoice was created but the client never got a payment link, and
-- nobody knew. Surfaced as a warning badge in DispatcherView's Invoices tab.
alter table invoices add column client_sms_failed boolean not null default false;

-- New rows for the 5 cron functions found deployed+scheduled but missing
-- from agent_functions (predict-asset-maintenance, detect-idle-assets,
-- estimate-job-carbon, forecast-demand were never seeded; agent-council-report
-- and test-agent-health are Agent OS infrastructure itself, explicitly
-- tagged 'system' rather than a business-facing agent). on conflict do
-- nothing since agent_functions.name is unique and some of these may
-- already exist from a prior partial run.
insert into agent_functions (name, agent) values
  ('predict-asset-maintenance', 'asset_intelligence'),
  ('detect-idle-assets', 'asset_intelligence'),
  ('estimate-job-carbon', 'environment'),
  ('forecast-demand', 'marketing'),
  ('agent-council-report', 'system'),
  ('test-agent-health', 'system')
on conflict (name) do nothing;
