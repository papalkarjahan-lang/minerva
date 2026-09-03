-- ============================================================
-- MINERVA — Delta: Agent Operating System, Phase 4 (Agent Council weekly
-- report), 2026-09-01.
--
-- This is Phase 4 of a 5-phase "Agent Operating System" build. Adds ONE new
-- table to hold a weekly, LLM-authored (or plain-data-fallback) synthesis of
-- the last 7 days of `agent_insights` + `agent_functions` health data,
-- written by the new `agent-council-report` edge function (deployed
-- separately, see supabase_schema_delta_agent_council_cron.sql for its cron
-- entry). This report is FOR THE MINERVA OPERATOR (the person running this
-- SaaS platform) about the health of Minerva's own agent system across every
-- customer business — it is NOT a per-business report and is not delivered
-- to any business's Slack. See agent-council-report/index.ts header comment
-- for the honest state of delivery (storage-only in this phase, no
-- Slack/email yet).
--
-- Standalone file, safe to run independently in the Supabase SQL Editor —
-- only adds one new table, does not touch any existing table or column.
-- Re-runnable is NOT guaranteed (plain `create table` errors if it already
-- exists) — run once.
--
-- Run order (see README.md "Agent Operating System — Phase 4"):
--   1. This file (supabase_schema_delta_agent_council.sql)
--   2. Deploy the new function: supabase functions deploy agent-council-report
--   3. supabase_schema_delta_agent_council_cron.sql (adds its cron entry)
--
-- Deliberately NOT included here: any cron.schedule() call. Per this
-- project's existing convention (see supabase_schema_delta_agent_cron.sql /
-- supabase_schema_delta_agent_infra_cron.sql / supabase_schema_delta_agent_
-- phase3.sql), DDL and live cron scheduling are always kept in separate
-- delta files.
-- ============================================================

-- Table: agent_council_reports
-- One row per weekly run of agent-council-report. `summary` is the full
-- report text (markdown-ish plain text, Slack-formatting-adjacent but not
-- posted anywhere yet — see function header comment). functions_checked /
-- insights_reviewed / unhealthy_function_count are stored alongside the
-- prose summary as plain counts so a human (or a future dashboard) can sort/
-- filter reports without re-parsing the text.
create table agent_council_reports (
  id                        uuid primary key default gen_random_uuid(),
  week_start                date not null,
  week_end                  date not null,
  summary                   text not null,
  functions_checked         integer not null default 0,
  insights_reviewed         integer not null default 0,
  unhealthy_function_count  integer not null default 0,
  created_at                timestamptz default now()
);
alter table agent_council_reports enable row level security;
create policy "anon insert agent_council_reports" on agent_council_reports
  for insert with check (true);
create policy "anon select agent_council_reports" on agent_council_reports
  for select using (true);
create policy "anon update agent_council_reports" on agent_council_reports
  for update using (true);
create policy "anon delete agent_council_reports" on agent_council_reports
  for delete using (true);

-- Table-level grant — RLS policy above is inert without this (see the
-- 2026-09-02 outage note in supabase_schema.sql's ROW LEVEL SECURITY
-- section for the full story of why this line can't be skipped).
grant select, insert, update, delete on agent_council_reports
to anon, authenticated, service_role;
