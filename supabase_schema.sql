-- ============================================================
-- MINERVA - Complete Supabase Schema
-- Run this entire block in the Supabase SQL Editor
-- ============================================================

-- Table 1: businesses
create table businesses (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  trade_type          text,
  city                text,
  contact_email       text,
  contact_phone       text,
  subscription_tier   text default 'standard',
  stripe_customer_id  text,
  stripe_sub_id       text,
  stripe_sub_item_id  text, -- the Stripe subscription *item* id (not the subscription
                             -- id) — required to call subscriptionItems.update() and
                             -- change billed quantity. Saved by stripe-webhook on
                             -- checkout.session.completed. Written by
                             -- sync-technician-billing.
  data_sharing_optin  bool default false,
  twilio_number       text, -- E.164 Twilio number for this business (e.g. +61412345678),
                             -- used by missed-call-webhook to match an inbound call's
                             -- "To" number back to a business row. Nullable: only needed
                             -- if the business has its own Twilio number configured for
                             -- voice + the missed-call-to-SMS auto-reply.
  slack_webhook_url    text, -- optional. A Slack "Incoming Webhook" URL the business
                              -- pastes in from their own Slack workspace (Settings modal
                              -- in DispatcherView). Used by notify-slack and the
                              -- autonomous agents below to post lead/dispatch/billing
                              -- alerts. Treat like a secret — anyone with it can post to
                              -- that Slack channel — but it's scoped to one business's
                              -- own workspace, same trust model as the rest of this
                              -- anon-link app (see SECURITY_NOTES.md).
  auto_dispatch_enabled bool default false, -- opt-in. When true, new jobs with no
                              -- technician_id are automatically assigned to the nearest
                              -- connected technician by the auto-assign-technician
                              -- function (triggered via the on_job_created_auto_assign
                              -- trigger below) instead of waiting for a manual dispatcher
                              -- pick.
  meta_access_token   text, -- optional. A long-lived Meta (Facebook/Instagram) Marketing
                             -- API access token for THIS business's own ad account —
                             -- pasted in from the Settings modal. Required only if the
                             -- business wants to use the Growth pillar's "Approve &
                             -- Launch" ad campaign action. Each business's ad spend goes
                             -- through their own token/account — Minerva never holds or
                             -- spends on a shared account. Same trust tier as
                             -- slack_webhook_url (readable via the anon-select-all
                             -- policy, see SECURITY_NOTES.md).
  meta_ad_account_id  text, -- e.g. 'act_1234567890', from the business's own Meta
                             -- Business Manager > Ad Account Settings.
  meta_page_id        text, -- the Facebook Page ID ads will be published from.
  created_at          timestamptz default now()
);

-- Table 2: technicians
create table technicians (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  name            text not null,
  phone           text,
  pin             text,
  current_lat     float8,
  current_lng     float8,
  last_seen       timestamptz,
  current_job_id  uuid,
  is_active       bool default true,
  created_at      timestamptz default now()
);

-- Table 3: jobs
create table jobs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  technician_id   uuid references technicians(id) on delete set null,
  client_name     text,
  client_phone    text,
  client_address  text,
  client_lat      float8,
  client_lng      float8,
  status          text default 'scheduled',
  scheduled_time  timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  sms_sent        bool default false,
  completion_sms_sent bool default false, -- prevents duplicate "job complete" SMS if
                                           -- handleCompleteJob is somehow triggered twice
  notes           text,
  created_at      timestamptz default now()
);

-- Add FK from technicians.current_job_id -> jobs.id (after jobs table exists)
alter table technicians
  add constraint fk_current_job
  foreign key (current_job_id) references jobs(id) on delete set null;

-- Table 2b: technician_locations
-- Append-only breadcrumb trail. technicians.current_lat/current_lng only ever
-- hold the latest point (each GPS tick overwrites it), so with no history
-- table there was no way to reconstruct where a technician actually was
-- earlier in the day — no route-taken record, no evidence for a "nobody
-- showed up" or "they were only here 10 minutes" dispute, no wage/hours
-- cross-check. This table is written to on every GPS push (TechnicianView.jsx)
-- alongside the existing technicians update, so it's purely additive — no
-- change to the live-tracking behavior dispatchers/clients already see.
create table technician_locations (
  id              uuid primary key default gen_random_uuid(),
  technician_id   uuid references technicians(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  job_id          uuid references jobs(id) on delete set null, -- whatever job was
                                                                 -- current at the time,
                                                                 -- if any — lets a
                                                                 -- dispute be resolved
                                                                 -- to a specific job.
  lat             float8 not null,
  lng             float8 not null,
  recorded_at     timestamptz not null,
  created_at      timestamptz default now()
);
create index idx_technician_locations_tech_time
  on technician_locations (technician_id, recorded_at desc);

-- Table 4: leads
-- Captured by the AI Intake Assistant widget (ai-intake-chat edge function)
-- when a website visitor's chat gets triaged into a qualified lead. Kept
-- separate from `jobs` because a lead is unconfirmed/unscheduled — the
-- dispatcher decides whether to convert it into a real job.
create table leads (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid references businesses(id) on delete cascade,
  client_name           text,
  client_phone          text,
  suburb                text,
  urgency               text default 'routine', -- 'emergency' | 'routine' | 'out_of_scope'
  job_description       text,
  transcript            jsonb, -- full chat history at time of capture, for context
  status                text default 'new', -- 'new' | 'contacted' | 'quoted' | 'converted' | 'lost'
  score                 int, -- 0-100 heuristic priority, set by Claude from the conversation
                              -- content (urgency + specificity) at capture time, then boosted
                              -- deterministically if is_repeat_client. NOT a trained/predictive
                              -- model (no historical conversion data exists to train one yet).
  score_reason          text, -- one-line human-readable explanation of the score
  estimated_value_tier  text, -- 'low' | 'medium' | 'high' — rough job-size signal from the
                               -- conversation, not a dollar figure or external valuation
  is_repeat_client      bool default false, -- true if this phone number already has a prior
                                             -- lead or job under the same business_id
  source                text default 'ai_intake_chat',
  nurture_sent_at       timestamptz, -- set by the nurture-stale-leads agent when it sends a
                                      -- follow-up nudge SMS to a lead sitting untouched in
                                      -- 'new' status. Prevents re-sending the same nudge on
                                      -- every hourly run.
  second_nurture_sent_at timestamptz, -- set by the nurture-stale-leads agent's second touch:
                                      -- if a lead is STILL 'new' 24h after the first nudge
                                      -- (i.e. no human ever moved it to contacted/quoted), one
                                      -- more short check-in SMS goes out. Never a third — see
                                      -- nurture-stale-leads for the cutoff logic.
  escalation_flagged_at timestamptz, -- set by daily-digest the first time it surfaces this
                                      -- lead as "gone quiet after both autonomous nudges" —
                                      -- prevents the same silent lead being re-listed in the
                                      -- digest every single day once a human's been told once.
  created_at            timestamptz default now()
);

-- ============================================================
-- PRO-TIER TABLES
-- Asset tracking, on-site invoicing, and compliance checklists are only
-- shown in the UI for businesses.subscription_tier = 'pro', but the tables
-- themselves aren't tier-gated at the DB level (same anon-link model as
-- everything else — see RLS notes below).
-- ============================================================

-- Table 5: assets
-- Equipment/vehicles/tools a Pro-tier business wants to track and optionally
-- assign to a technician.
create table assets (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid references businesses(id) on delete cascade,
  name                    text not null,
  category                text,
  serial_number           text,
  assigned_technician_id  uuid references technicians(id) on delete set null,
  status                  text default 'available', -- 'available' | 'in_use' | 'maintenance'
  notes                   text,
  created_at              timestamptz default now()
);

-- Table 6: invoices
-- On-site invoices built by a technician on job completion (Pro tier).
-- Digital record/receipt only — Minerva does not collect payment itself.
-- The business marks an invoice paid once payment is taken by their own
-- means (EFTPOS, cash, etc.). See InvoiceView.jsx for the client-facing view.
create table invoices (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  job_id        uuid references jobs(id) on delete set null,
  client_name   text,
  client_phone  text,
  line_items    jsonb not null default '[]', -- [{ description, amount }, ...]
  subtotal      numeric not null default 0,
  gst           numeric not null default 0, -- 10% Australian GST
  total         numeric not null default 0,
  status        text default 'unpaid', -- 'unpaid' | 'paid'
  paid_at       timestamptz,
  reminder_sent_at timestamptz, -- set by the chase-unpaid-invoices agent when it sends a
                                 -- payment-reminder SMS. Only re-sent if still unpaid after
                                 -- 3+ days, so this also throttles the daily job to once per
                                 -- invoice per 3-day window (see WHERE clause in the function).
  reminder_count    int default 0, -- incremented each time chase-unpaid-invoices sends a
                                    -- reminder. Once this hits 3 with the invoice still
                                    -- unpaid, daily-digest surfaces it as needing a human,
                                    -- since the automation clearly isn't landing.
  escalation_flagged_at timestamptz, -- set by daily-digest the first time it surfaces this
                                      -- invoice as stuck — prevents re-listing the same
                                      -- unresponsive invoice every day once flagged once.
  created_at    timestamptz default now()
);

-- Table 7: checklist_templates
-- One compliance checklist per business (Pro tier). Shown to technicians
-- before they can complete a job; results saved onto jobs.checklist_results.
create table checklist_templates (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  name          text default 'Completion Checklist',
  items         jsonb not null default '[]', -- ["item 1", "item 2", ...]
  created_at    timestamptz default now()
);

-- jobs.checklist_results: filled in by the technician when they confirm the
-- checklist on job completion. [{ item, checked }, ...]
alter table jobs add column checklist_results jsonb;

-- ============================================================
-- FURTHER PRO-TIER / AUTONOMOUS-AGENT TABLES
-- ============================================================

-- jobs.retention_sent_at: set by the retention-checkin agent when it sends
-- a "need any more help?" SMS to a past client, roughly a month after their
-- last completed job with no repeat booking since. Prevents re-sending the
-- same nudge on every weekly run.
alter table jobs add column retention_sent_at timestamptz;

-- checklist_templates.type: distinguishes a job-completion checklist
-- ('completion', the original/default use) from a technician-onboarding
-- SOP checklist ('onboarding') shown once before a new technician can
-- start tracking. A business can have one of each.
alter table checklist_templates add column type text not null default 'completion';

-- technicians.onboarding_completed_at: set the first time a technician
-- confirms their onboarding checklist (see TechnicianView.jsx). Null means
-- either no onboarding checklist exists for this business, or it exists
-- but hasn't been completed yet — checked together with the business's
-- onboarding template at load time.
alter table technicians add column onboarding_completed_at timestamptz;

-- Table 8: inventory_items (Pro tier)
-- Consumable stock (parts, materials) a business wants to track reorder
-- levels for. Distinct from `assets` (equipment/vehicles/tools that get
-- assigned to a technician, not consumed). Minerva has no vendor accounts
-- to actually place orders, so this is stock-level tracking + low-stock
-- alerts only, not automated purchasing — see check-inventory-levels.
create table inventory_items (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid references businesses(id) on delete cascade,
  name              text not null,
  quantity          numeric not null default 0,
  unit              text default 'units', -- e.g. 'units', 'metres', 'boxes'
  reorder_threshold numeric default 0, -- alert fires when quantity <= this
  supplier_name     text, -- free-text note, not a vendor integration
  notes             text,
  low_stock_alert_sent_at timestamptz, -- throttles check-inventory-levels
                                        -- so it doesn't re-alert on every
                                        -- daily run while stock stays low
  created_at        timestamptz default now()
);
alter table inventory_items enable row level security;
create policy "anon insert inventory_items" on inventory_items
  for insert with check (true);
create policy "anon select inventory_items" on inventory_items
  for select using (true);
create policy "anon update inventory_items" on inventory_items
  for update using (true);
create policy "anon delete inventory_items" on inventory_items
  for delete using (true);

-- Table 9: marketing_drafts (Growth pillar — Pro tier)
-- AI-generated ad campaign and outreach-message drafts, queued for one-click
-- human approval before any money is spent or any message is sent — Claude
-- cannot spend a business's ad budget or send outbound marketing on its own
-- initiative, so generate-growth-drafts only ever writes rows with
-- status='pending' here. Nothing fires until a human clicks Approve in the
-- Marketing tab, which calls launch-ad-campaign or send-growth-message.
-- outreach_sms recipients are pulled only from this business's own
-- leads/jobs data (existing contacts) — never a purchased/scraped list —
-- keeping this consistent with nurture-stale-leads/retention-checkin's
-- "existing relationship" scope, not cold prospecting.
create table marketing_drafts (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid references businesses(id) on delete cascade,
  type                  text not null, -- 'ad_campaign' | 'outreach_sms'
  status                text not null default 'pending', -- pending | approved | rejected | sent | launched | failed
  headline              text,
  body_text             text,
  rationale             text, -- why the agent suggested this, shown to the owner for context
  target_suburb         text,
  target_radius_km      numeric,
  daily_budget          numeric,
  platform              text default 'meta',
  recipients            jsonb, -- [{name, phone}] — only populated for outreach_sms drafts
  external_campaign_id  text, -- set once launched, the Meta campaign id
  error                 text, -- set if launch/send failed, shown in the Marketing tab
  quality_notes         text, -- one-line explanation from the automated quality-review pass
                               -- (see generate-growth-drafts) of why the copy passed review —
                               -- shown to the owner alongside rationale for extra context,
                               -- not a second approval gate (the human Approve click is still
                               -- the only thing that can launch/send).
  created_at            timestamptz default now(),
  reviewed_at           timestamptz
);
alter table marketing_drafts enable row level security;
create policy "anon select marketing_drafts" on marketing_drafts
  for select using (true);
create policy "anon insert marketing_drafts" on marketing_drafts
  for insert with check (true);
create policy "anon update marketing_drafts" on marketing_drafts
  for update using (true);

-- Table 10: checklist_photos
-- Photo evidence tied to a specific checklist item on a specific job —
-- jobs.checklist_results only ever holds { item, checked } booleans with
-- nothing behind them, so if a client disputes something like "gas shutoff
-- confirmed" there was previously no record to back it up. Uploaded by the
-- technician (optional, not required) when they submit the completion
-- checklist in TechnicianView.jsx, to the 'checklist-photos' Storage bucket
-- (see STORAGE SETUP below) — storage_path is saved here, not the file
-- itself. Purely additive: checklist_results keeps working exactly as
-- before with or without rows here.
create table checklist_photos (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references jobs(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  checklist_item  text, -- matches the `item` string from checklist_results
  storage_path    text not null, -- path within the 'checklist-photos' bucket
  created_at      timestamptz default now()
);
alter table checklist_photos enable row level security;
create policy "anon insert checklist_photos" on checklist_photos
  for insert with check (true);
create policy "anon select checklist_photos" on checklist_photos
  for select using (true);

-- ============================================================
-- STORAGE SETUP — checklist-photos bucket (Feature: photo evidence)
-- Supabase Storage buckets aren't created with a `create table` statement —
-- a bucket is just a row in storage.buckets, and access to objects inside
-- it is controlled by RLS policies on storage.objects, the same RLS
-- mechanism as every other table in this file. Kept here so the whole
-- schema still lives in one script. Public bucket = anyone with a photo's
-- public URL can view it — same "unguessable link" trust model as the rest
-- of Minerva (see SECURITY_NOTES.md); the policies below still gate
-- insert/select through the anon key exactly like every other table here.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('checklist-photos', 'checklist-photos', true)
on conflict (id) do nothing;

-- Anon (the technician's own phone) uploads a photo on checklist submit.
-- Anon select lets the dispatcher board and any future client-facing view
-- fetch thumbnails/full images.
create policy "anon insert checklist-photos" on storage.objects
  for insert with check (bucket_id = 'checklist-photos');
create policy "anon select checklist-photos" on storage.objects
  for select using (bucket_id = 'checklist-photos');

-- Table 11: job_materials
-- Links a specific inventory_items row (part/material) to the specific job
-- it was used on. inventory_items alone only tracks stock levels — nothing
-- previously recorded which job actually consumed a part, so there was no
-- audit trail for a quantity drop and no record of "which part did we
-- install here" for warranty/damage disputes. item_name snapshots the name
-- at time of use so this row stays meaningful even if the inventory item is
-- later renamed or deleted (inventory_item_id just goes null, same spirit
-- as invoices.job_id on delete set null). Written by TechnicianView.jsx on
-- job completion, optional — a job with no trackable materials submits fine
-- with zero rows here.
create table job_materials (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid references jobs(id) on delete cascade,
  business_id         uuid references businesses(id) on delete cascade,
  inventory_item_id   uuid references inventory_items(id) on delete set null,
  item_name           text not null,
  quantity_used       numeric not null,
  created_at          timestamptz default now()
);
alter table job_materials enable row level security;
create policy "anon insert job_materials" on job_materials
  for insert with check (true);
create policy "anon select job_materials" on job_materials
  for select using (true);


-- ============================================================
-- Tables 12-13 + related columns: six new autonomous systems
-- (Licence/Ticket Expiry Guardian, Wasted-Trip/No-Show Proof
-- Agent, Weather-Risk Reschedule Agent, Client Self-Serve
-- Rebooking Loop, Paid-Invoice Referral Loop, Fair-Rotation/
-- Burnout Guard). Purely additive, same as tables 1-11 above.
-- ============================================================
-- ------------------------------------------------------------
-- SYSTEM 1: Licence/Ticket Expiry Guardian
-- ------------------------------------------------------------
-- Table 12: technician_credentials
-- Tracks licences/tickets/certifications (e.g. electrical licence, white
-- card, forklift ticket) per technician, each with an expiry date. Purely
-- additive — technicians work exactly as before with zero rows here.
-- Threshold warnings are tracked with three separate nullable timestamps
-- (rather than one "last warned" column) so each of the 30/14/7-day
-- thresholds fires exactly once, independently, even if the dispatcher
-- doesn't act on the earlier warnings — same throttle-via-nullable-
-- timestamp pattern as inventory_items.low_stock_alert_sent_at.
create table technician_credentials (
  id                    uuid primary key default gen_random_uuid(),
  technician_id         uuid references technicians(id) on delete cascade,
  business_id           uuid references businesses(id) on delete cascade,
  credential_type       text, -- free-text category, e.g. 'licence', 'ticket', 'certification'
  credential_name       text not null, -- e.g. "Electrical Licence", "White Card"
  expiry_date           date not null,
  document_storage_path text, -- optional path within the 'credential-documents' bucket,
                                -- a photo/scan of the actual document
  warning_30_sent_at    timestamptz, -- set by check-credential-expiry once the 30-day
                                       -- Slack warning has fired for this credential
  warning_14_sent_at    timestamptz,
  warning_7_sent_at     timestamptz,
  created_at            timestamptz default now()
);
alter table technician_credentials enable row level security;
create policy "anon insert technician_credentials" on technician_credentials
  for insert with check (true);
create policy "anon select technician_credentials" on technician_credentials
  for select using (true);
create policy "anon update technician_credentials" on technician_credentials
  for update using (true);
create policy "anon delete technician_credentials" on technician_credentials
  for delete using (true);

-- STORAGE — credential-documents bucket. Same pattern/trust model as the
-- 'checklist-photos' bucket above: public bucket, anon insert/select on
-- storage.objects scoped to this bucket_id only. A technician's licence
-- photo is arguably more sensitive than a job-completion checklist photo,
-- but this app has no auth layer to scope it any tighter than "you have
-- the dispatch link" — same tradeoff as every other field in this schema,
-- see SECURITY_NOTES.md.
insert into storage.buckets (id, name, public)
values ('credential-documents', 'credential-documents', true)
on conflict (id) do nothing;
create policy "anon insert credential-documents" on storage.objects
  for insert with check (bucket_id = 'credential-documents');
create policy "anon select credential-documents" on storage.objects
  for select using (bucket_id = 'credential-documents');

-- ------------------------------------------------------------
-- SYSTEM 2: Wasted-Trip / No-Show Proof Agent
-- ------------------------------------------------------------
-- Reuses the existing technician_locations GPS breadcrumb trail — no new
-- location tracking is added. detect-wasted-trips cross-references a job's
-- client_lat/client_lng against recorded technician_locations points to
-- detect "technician was on-site but the job never progressed."
alter table jobs add column no_show_detected_at timestamptz; -- set once, the first time
                                                                -- detect-wasted-trips confirms
                                                                -- a no-show for this job —
                                                                -- also acts as the throttle so
                                                                -- the same job is never
                                                                -- flagged twice.
alter table jobs add column no_show_reschedule_sms_sent_at timestamptz; -- set when the
                                                                -- one reschedule-prompt SMS
                                                                -- goes out to the client.

-- ------------------------------------------------------------
-- SYSTEM 3: Weather-Risk Reschedule Agent
-- ------------------------------------------------------------
-- businesses.weather_sensitive_trade_types: which of a business's own trade
-- types are weather-sensitive enough to bother checking forecasts for
-- (e.g. roofing, painting, concreting — outdoor trades). Whole-business
-- array rather than a per-job field: `jobs` has no trade/category column
-- today, and adding a full per-job categorization system is out of scope
-- for this feature — a business simply opts in as a whole if what they do
-- is generally weather-sensitive. Null/empty = feature quietly does
-- nothing for that business (opt-in, not opt-out).
alter table businesses add column weather_sensitive_trade_types text[];

-- jobs.weather_risk_flagged_at: set the first time check-weather-risk
-- creates a weather_reschedule_drafts row for this job — throttle so the
-- same upcoming job isn't re-drafted every morning it remains in the
-- risky forecast window.
alter table jobs add column weather_risk_flagged_at timestamptz;

-- Table 13: weather_reschedule_drafts
-- Human-approval-gated, same pattern as marketing_drafts: check-weather-
-- risk (autonomous, daily) only ever writes a row here with
-- status='pending'. Nothing is sent to a client until a human clicks
-- "Approve & Send Reschedule SMS" in the Dispatcher view, which calls
-- send-weather-reschedule-sms. A "Dismiss" click just marks it 'dismissed'.
create table weather_reschedule_drafts (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid references jobs(id) on delete cascade,
  business_id       uuid references businesses(id) on delete cascade,
  forecast_summary  text, -- human-readable summary of the risky forecast, e.g.
                            -- "80% chance of rain, 25mm expected, at the scheduled time"
  status            text not null default 'pending', -- pending | approved | dismissed | sent | failed
  created_at        timestamptz default now(),
  reviewed_at       timestamptz
);
alter table weather_reschedule_drafts enable row level security;
create policy "anon insert weather_reschedule_drafts" on weather_reschedule_drafts
  for insert with check (true);
create policy "anon select weather_reschedule_drafts" on weather_reschedule_drafts
  for select using (true);
create policy "anon update weather_reschedule_drafts" on weather_reschedule_drafts
  for update using (true);

-- ------------------------------------------------------------
-- SYSTEM 5: Paid-Invoice Referral Loop
-- ------------------------------------------------------------
-- invoices.referral_code: generated the first time an invoice is marked
-- paid (see markInvoicePaid in DispatcherView.jsx), using the same
-- generatePin()-style CSPRNG alphanumeric generator already used for
-- technician PINs (src/utils.js) — not reused verbatim since technician
-- PINs are 8 characters (an access-control boundary), while a referral
-- code just needs to be short and easy to read out over a phone call, so
-- a dedicated 6-character generateReferralCode() is added to utils.js
-- instead, same alphabet, same CSPRNG approach.
alter table invoices add column referral_code text;

-- leads.referred_by_code: set when a new lead's intake conversation
-- mentions/enters a code matching an existing invoices.referral_code
-- (matched in ai-intake-chat). leads.source already accepts free text, so
-- no schema change is needed there — ai-intake-chat sets source='referral'
-- on match, same column, no new value list to maintain.
alter table leads add column referred_by_code text;

-- ------------------------------------------------------------
-- SYSTEM 6: Fair-Rotation / Burnout Guard
-- ------------------------------------------------------------
-- jobs.urgency: `leads.urgency` already exists ('emergency' | 'routine' |
-- 'out_of_scope'), but jobs — including jobs entered directly via "Add Job"
-- with no originating lead — had no equivalent field, so there was no way
-- for update-technician-workload to tell which of a technician's recently
-- assigned jobs were emergencies. Added here as a nullable text column
-- (mirrors leads.urgency's values where set); DispatcherView.jsx's
-- convertLeadToJob is additively extended to copy a lead's urgency onto
-- the job it creates, and AddJobModal gets a new optional dropdown so a
-- directly-entered job can be marked emergency too. Purely additive: any
-- job with no value here (every job created before this feature, and any
-- new job where the dispatcher leaves it unset) is simply treated as
-- non-emergency by the burnout guard's rolling count — no existing
-- behavior changes.
alter table jobs add column urgency text; -- 'emergency' | 'routine' | null

-- technicians.rolling_emergency_job_count: number of emergency-urgency
-- jobs assigned to this technician in the trailing 7 days, recomputed
-- daily by update-technician-workload. Used as a soft tiebreak (not a hard
-- exclusion) in auto-assign-technician, so emergency jobs don't keep
-- landing on whoever happens to be nearest every time.
alter table technicians add column rolling_emergency_job_count int default 0;

-- technicians.rolling_week_hours: approximate hours "on the clock" in the
-- trailing 7 days, estimated from technician_locations breadcrumbs (see
-- update-technician-workload for the exact method — per calendar day,
-- (latest recorded_at - earliest recorded_at) for that technician, summed
-- across the last 7 days). An estimate, not exact payroll-grade timekeeping
-- — it can't see gaps where a technician stopped moving but stayed
-- clocked on, or GPS being off entirely — good enough for a burnout signal,
-- not intended as a wage/timesheet source of truth.
alter table technicians add column rolling_week_hours numeric default 0;

-- technicians.burnout_flag_sent_at: throttles the internal Slack burnout
-- alert to once per situation — cleared implicitly by staying null again
-- only if you manually reset it; in practice it's simply re-eligible to
-- fire again once 7+ days have passed since the last alert (checked in
-- update-technician-workload), so a technician who stays over-threshold
-- gets a fresh reminder about once a week rather than daily noise.
alter table technicians add column burnout_flag_sent_at timestamptz;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- Minerva has no login step for business owners, technicians, or clients —
-- by design, access is via unguessable UUID links (dispatch URL, tracking
-- URL) or a technician PIN. That means every operation below runs as the
-- anon role. There is deliberately NO "authenticated" bypass policy: a
-- generic "auth.role() = authenticated" policy would grant ANY visitor who
-- self-registers a free Supabase Auth account (enabled by default on new
-- projects) full read/write access to every business's data, since nothing
-- in this schema ties an authenticated session to a specific tenant. See
-- SECURITY_NOTES.md for the full threat model and the Phase 2 recommendation
-- to add real per-owner authentication before scaling past pilot clients.
--
-- IMPORTANT Day-1 setup step: in Supabase Dashboard > Authentication >
-- Providers, disable "Allow new users to sign up". This closes off the
-- authenticated-role attack surface entirely as a belt-and-suspenders
-- measure, even though no policy below currently grants it any access.
-- ============================================================
alter table businesses enable row level security;
alter table technicians enable row level security;
alter table technician_locations enable row level security;
alter table jobs enable row level security;
alter table leads enable row level security;
alter table assets enable row level security;
alter table invoices enable row level security;
alter table checklist_templates enable row level security;

-- BUSINESSES
-- Anon can create a business at signup (no login exists at that point).
create policy "anon insert business" on businesses
  for insert with check (true);
-- Anon can read a business by its (unguessable) id — needed by the
-- dispatcher view, tracking view, and technician view.
create policy "anon select business" on businesses
  for select using (true);

-- TECHNICIANS
-- Anon can create technician rows during onboarding.
create policy "anon insert technicians" on technicians
  for insert with check (true);
-- Anon can read technician rows — needed by PIN login, the dispatcher's
-- live map, and the client tracking page. Realtime subscriptions (used for
-- the live GPS map) also require a SELECT policy to deliver change events
-- under RLS, so this cannot be narrowed to a security-definer RPC without
-- breaking live tracking. Treat all technician/tracking/dispatch links as
-- secrets — do not post them publicly or log them insecurely.
create policy "anon select technicians" on technicians
  for select using (true);
-- Anon (the technician's own phone, unauthenticated) must be able to push
-- their live GPS position and clear current_job_id on job completion.
create policy "anon update technicians" on technicians
  for update using (true);

-- TECHNICIAN_LOCATIONS
-- Anon (the technician's own phone) inserts one row per GPS push. Anon
-- select is needed for the dispatcher's "view route" trail on the map.
-- Insert-only from the technician side — history rows are never edited,
-- which is the point (an editable trail isn't evidence).
create policy "anon insert technician_locations" on technician_locations
  for insert with check (true);
create policy "anon select technician_locations" on technician_locations
  for select using (true);

-- JOBS
-- Dispatcher creates jobs via the "Add Job" form (anon, no login).
create policy "anon insert jobs" on jobs
  for insert with check (true);
-- Needed by dispatcher board, technician's current-job card, and the
-- public client tracking link. Same realtime constraint as technicians above.
create policy "anon select jobs" on jobs
  for select using (true);
-- Technician updates job status (start/complete) and sms_sent flag; the
-- dispatcher assigns a technician_id to a job.
create policy "anon update jobs" on jobs
  for update using (true);

-- LEADS
-- The ai-intake-chat edge function inserts a lead using the anon key once
-- the chat has captured enough info. Anon insert only — the widget runs on
-- the business's public website with no login. Anon select is needed so the
-- dispatcher board (also anon, unguessable-link model) can list new leads.
create policy "anon insert leads" on leads
  for insert with check (true);
create policy "anon select leads" on leads
  for select using (true);
create policy "anon update leads" on leads
  for update using (true);

-- ASSETS (Pro tier)
-- Dispatcher creates/assigns assets (anon, no login). No technician-side
-- writes needed today, so only insert/select/update by anon are granted —
-- same anon-link trust model as the rest of the schema.
create policy "anon insert assets" on assets
  for insert with check (true);
create policy "anon select assets" on assets
  for select using (true);
create policy "anon update assets" on assets
  for update using (true);

-- INVOICES (Pro tier)
-- Technician inserts an invoice on job completion; the client reads their
-- own invoice via its unguessable id (InvoiceView.jsx); dispatcher reads/
-- updates to mark paid.
create policy "anon insert invoices" on invoices
  for insert with check (true);
create policy "anon select invoices" on invoices
  for select using (true);
create policy "anon update invoices" on invoices
  for update using (true);

-- CHECKLIST_TEMPLATES (Pro tier)
-- Dispatcher creates/edits the template; technician reads it before
-- completing a job.
create policy "anon insert checklist_templates" on checklist_templates
  for insert with check (true);
create policy "anon select checklist_templates" on checklist_templates
  for select using (true);
create policy "anon update checklist_templates" on checklist_templates
  for update using (true);

-- ============================================================
-- ENABLE REALTIME
-- Run this after the tables are created.
-- Also toggle in Dashboard: Database > Replication > technicians
-- ============================================================
alter publication supabase_realtime add table technicians;
alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table assets;
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table inventory_items;
alter publication supabase_realtime add table weather_reschedule_drafts;
alter publication supabase_realtime add table marketing_drafts;
-- ============================================================
-- AUTONOMOUS AGENTS — setup
--
-- Everything below is optional infrastructure for the autonomous-operations
-- layer: auto-dispatch (event-driven, via trigger) and three scheduled
-- agents (lead nurture, invoice chasing, weekly digest) run via pg_cron.
-- Skip this whole block if you don't want any of that — the rest of
-- Minerva works fine without it.
--
-- Before running this block:
--   1. Project ref and anon public key below are already filled in for this
--      project (Settings > General / Settings > API). This is safe to embed
--      here — it's the same key already shipped in your frontend .env, and
--      every RLS policy in this schema already treats anon as fully trusted
--      (see the RLS notes above).
--   2. Deploy the six new edge functions listed in README.md first
--      (notify-slack, calendar-feed, nurture-stale-leads,
--      chase-unpaid-invoices, auto-assign-technician, daily-digest) —
--      these SQL jobs call them by URL and will just fail harmlessly
--      (logged, retried next run) until the functions exist.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- AUTO-DISPATCH TRIGGER
-- Fires once, right after a new job is inserted with no technician_id yet.
-- Calls auto-assign-technician, which only actually assigns anyone if the
-- job's business has auto_dispatch_enabled = true (checked inside the
-- function, not here, so this trigger stays simple and cheap for
-- businesses that don't use the feature).
create or replace function trigger_auto_assign_technician()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/auto-assign-technician',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := jsonb_build_object('job_id', new.id)
  );
  return new;
end;
$$ language plpgsql;

create trigger on_job_created_auto_assign
  after insert on jobs
  for each row
  when (new.technician_id is null)
  execute function trigger_auto_assign_technician();

-- SCHEDULED AGENTS
-- Hourly: nudge leads that have sat untouched in 'new' status too long.
select cron.schedule(
  'nurture-stale-leads-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/nurture-stale-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily at 9am UTC (~7pm/8pm AEST/AEDT): chase unpaid invoices older than 3 days.
select cron.schedule(
  'chase-unpaid-invoices-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/chase-unpaid-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily, 22:00 UTC (~8-9am AEST/AEDT): Slack digest of the last 24 hours —
-- jobs, leads, invoicing, plus a pointer to anything waiting on the owner
-- (pending marketing drafts, low-stock items). Skips quiet days with zero
-- activity, same as the old weekly version.
select cron.schedule(
  'daily-digest-daily',
  '0 22 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Weekly, Tuesday 22:00 UTC: retention check-in SMS for clients who haven't
-- come back within 30-60 days of their last completed job.
select cron.schedule(
  'retention-checkin-tuesdays',
  '0 22 * * 2',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/retention-checkin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily at 8am UTC: reconcile Stripe billed quantity against actually
-- connected technicians, Slack-alert on drift (does not auto-correct).
select cron.schedule(
  'reconcile-billing-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/reconcile-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily at 7am UTC: check inventory stock levels, Slack-alert on
-- low/reorder-threshold items (throttled per item — see
-- inventory_items.low_stock_alert_sent_at).
select cron.schedule(
  'check-inventory-levels-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/check-inventory-levels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Weekly, Sunday 21:00 UTC (~7-8am Monday AEST/AEDT, ahead of the weekly
-- digest): generate-growth-drafts writes new ad campaign / outreach-SMS
-- DRAFTS only — status='pending', nothing spent or sent. A human must
-- click Approve in the dispatcher's Marketing tab before launch-ad-campaign
-- or send-growth-message ever fires.
select cron.schedule(
  'generate-growth-drafts-sundays',
  '0 21 * * 0',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/generate-growth-drafts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ------------------------------------------------------------
-- SCHEDULED AGENTS — addendum
-- Six new functions to deploy (see README.md), four of them scheduled
-- here. send-weather-reschedule-sms and send-referral-code-sms are
-- click/event-triggered only (never on a cron), same reasoning as
-- launch-ad-campaign / send-growth-message not being in this block.
-- NOTE: this block must actually be run (same as the AUTONOMOUS AGENTS
-- block above it) for these four agents to go live — see README.md
-- "Scheduled agents + auto-dispatch (pg_cron)".
-- ------------------------------------------------------------

-- Daily at 6am UTC (~4-5pm AEST/AEDT): scan technician licences/tickets
-- for 30/14/7-day expiry thresholds + immediate alert for an expired/
-- expiring-within-3-days credential on a technician currently on a job.
select cron.schedule(
  'check-credential-expiry-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/check-credential-expiry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Every 15 minutes: cross-reference technician GPS breadcrumbs against
-- scheduled jobs to detect a technician who was on-site (within ~150m)
-- for 15+ minutes with the job never progressing — likely a no-show or a
-- client not home. New schedule frequency for this app (fastest existing
-- cron was hourly) — matches the ~15s GPS push cadence closely enough to
-- catch a wasted trip same-day, without hammering the DB every minute.
select cron.schedule(
  'detect-wasted-trips-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/detect-wasted-trips',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily at 20:00 UTC (~6-7am AEST/AEDT, ahead of the working day): check
-- tomorrow's scheduled jobs for weather-sensitive businesses against the
-- Open-Meteo forecast, writing a pending weather_reschedule_drafts row
-- for any risky one. WRITES ONLY — nothing is sent until a human clicks
-- Approve.
select cron.schedule(
  'check-weather-risk-daily',
  '0 20 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/check-weather-risk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily at 21:30 UTC: recompute each technician's rolling 7-day hours
-- (from technician_locations) and rolling emergency-job count (from
-- jobs.urgency), Slack-alert the dispatcher only (never the technician or
-- a client) if a technician is over the burnout hours threshold.
select cron.schedule(
  'update-technician-workload-daily',
  '30 21 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/update-technician-workload',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
