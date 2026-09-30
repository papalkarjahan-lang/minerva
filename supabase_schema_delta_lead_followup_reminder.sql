-- ============================================================
-- MINERVA — Delta: lead-followup-reminder DDL (2026-09-30).
--
-- WHY: supabase_schema_delta_lead_crm_pipeline.sql (2026-09-14) added
-- leads.next_action_at/next_action_note so a dispatcher can jot "call back
-- Thursday" against a lead — but that file's own comment says outright
-- "Purely a display aid; nothing autonomous reads or acts on this field."
-- Confirmed via grep that remains true: DispatcherView.jsx only ever
-- writes/displays next_action_at, nothing reads it back to alert anyone
-- when it's actually due. So a dispatcher who sets a follow-up reminder
-- and then doesn't happen to be looking at the pipeline view at the right
-- moment silently misses it — the exact failure mode a reminder field
-- exists to prevent. New lead-followup-reminder cron agent (see matching
-- *_cron.sql delta) closes this by Slack-alerting the business every time
-- one of its own leads' next_action_at comes due.
--
-- next_action_reminded_at follows the same claim-before-act pattern as
-- nurture_sent_at/second_nurture_sent_at on this same table (see
-- nurture-stale-leads' "double-send fix" comment) — set via a conditional
-- UPDATE the agent uses to atomically claim a lead before Slack-alerting on
-- it, so two overlapping cron runs can't double-alert the same reminder.
-- ============================================================

alter table leads add column if not exists next_action_reminded_at timestamptz;
-- Set once lead-followup-reminder has alerted the business that this
-- lead's next_action_at is due, so it only ever fires once per reminder.
-- A dispatcher setting a NEW next_action_at on the same lead (the normal
-- "reschedule the follow-up" flow) should clear this so the new date gets
-- its own reminder — see updateLeadNextAction in DispatcherView.jsx.

insert into agent_functions (name, agent) values
  ('lead-followup-reminder', 'outreach')
on conflict (name) do nothing;
