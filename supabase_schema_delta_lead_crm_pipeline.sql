-- Lead CRM pipeline (added 2026-09-14)
-- Purely additive. Turns the existing flat `leads.status` field (new /
-- contacted / quoted / converted / lost) into a real pipeline with stages,
-- a next-action reminder, a deal-value estimate, and an append-only
-- activity timeline per lead — the Salesforce-pipeline-view equivalent,
-- built on top of the same leads table rather than replacing it (existing
-- `status` stays untouched and keeps meaning what it always meant; every
-- existing query/UI that reads `status` keeps working unchanged).

alter table leads add column if not exists pipeline_stage text default 'new';
-- 'new' | 'contacted' | 'discovery_call' | 'quoted' | 'negotiating' | 'won' | 'lost'
-- A finer-grained view than `status` for pipeline/kanban display. Not a
-- replacement — `status` remains the field every existing cron agent
-- (nurture-stale-leads, winback-lost-leads, daily-digest) already reads,
-- so none of that logic needs to change. pipeline_stage is purely a
-- richer lens on top, read only by the new CRM pipeline view.

alter table leads add column if not exists next_action_at timestamptz;
alter table leads add column if not exists next_action_note text;
-- What a human decided to do next for this lead, and when — e.g. "call
-- back Thursday" — surfaced in the pipeline view sorted by next_action_at,
-- same concept as a Salesforce task/follow-up reminder. Purely a display
-- aid; nothing autonomous reads or acts on this field.

alter table leads add column if not exists deal_value_estimate_low numeric;
alter table leads add column if not exists deal_value_estimate_high numeric;
-- Optional dollar-range estimate a dispatcher can attach to a lead once
-- they have a real sense of job size — used only for the pipeline
-- view's running "pipeline value" total, never invented or auto-filled
-- from AI. Nullable; a lead with no estimate simply doesn't count
-- toward the total until a human enters one.

-- lead_activities: append-only timeline entry per lead. Every stage
-- change, note, and logged call becomes one row here — this is what
-- makes the pipeline view a real activity history, not just a current
-- snapshot, mirroring the "activity feed" every CRM (Salesforce
-- included) is built around.
create table if not exists lead_activities (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete cascade,
  business_id   uuid references businesses(id) on delete cascade,
  activity_type text not null, -- 'stage_change' | 'note' | 'call_logged' | 'email_logged' | 'auto_nudge'
  body          text,          -- free-text note, or "Stage changed: new -> contacted"
  created_by    text default 'dispatcher', -- 'dispatcher' | 'agent' (for auto-logged nudges, e.g.
                                            -- nurture-stale-leads' own touches, so the timeline
                                            -- shows autonomous activity alongside human activity
                                            -- without conflating who did what)
  created_at    timestamptz default now()
);
create index if not exists idx_lead_activities_lead on lead_activities (lead_id, created_at desc);

grant select, insert on lead_activities to anon, authenticated, service_role;

-- Auto-log a stage_change activity row whenever pipeline_stage actually
-- changes, so the timeline is complete even if a dispatcher only ever
-- uses the stage dropdown and never types a manual note — matches how
-- Salesforce's own stage-history tracking behaves by default.
create or replace function log_lead_stage_change() returns trigger as $$
begin
  if (tg_op = 'UPDATE' and new.pipeline_stage is distinct from old.pipeline_stage) then
    insert into lead_activities (lead_id, business_id, activity_type, body, created_by)
    values (new.id, new.business_id, 'stage_change',
      'Stage changed: ' || coalesce(old.pipeline_stage, 'new') || ' -> ' || coalesce(new.pipeline_stage, 'new'),
      'dispatcher');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_lead_stage_change on leads;
create trigger on_lead_stage_change
  after update on leads
  for each row execute function log_lead_stage_change();
