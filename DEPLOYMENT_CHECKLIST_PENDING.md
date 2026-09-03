# Minerva — Pending Deployment Checklist (as of 2026-09-01)

## CRITICAL — fixed live 2026-09-02, read this first

**The entire production app was down for every real user** (not a checklist
gap — an active outage). Root cause: `CREATE POLICY` statements were run for
all 25 core tables (jobs, businesses, technicians, invoices, etc.) but the
underlying `GRANT SELECT/INSERT/UPDATE/DELETE ... TO anon` was never issued.
RLS policies are inert without the base table grant, so every anon-key read
and write — dispatcher map, technician GPS, customer intake, everything —
was failing with `permission denied for table X`. Likely broken since the
tables were first created; caught now because no one had done a full
end-to-end signup test yet (Day 7 testing was still pending).

Also found and fixed: the 3 Agent Ops tables (`agent_functions`,
`agent_insights`, `agent_council_reports`) had the same missing-grant bug,
and 21 of 23 pg_cron jobs had a corrupted/masked `Authorization` header
(literal bullet characters instead of the real anon JWT — looks like the key
was copied from the Supabase dashboard's obscured display instead of the
"reveal" view when the jobs were first scheduled), so every scheduled Agent
OS run had been failing with 401 since it was first scheduled.

Fixed via direct SQL grants + cron job recreation with the correct key.
Verified live: `jobs`/`businesses`/`technicians` now return 200 via the
anon key, `detect-wasted-trips` now runs and records `last_status: 'ok'` in
`agent_functions`. No code changes needed, no redeploy needed — this was
purely a database permissions issue.

## NEW — code/schema ready, needs deploy (2026-09-02, later same day)

This agent session had no cached `SUPABASE_ACCESS_TOKEN` (it's not stored in
any repo file, by design — was supplied inline in an earlier chat session),
so the two items below are code-complete and locally verified (syntax
checked) but **not yet applied to the live project**. Not a platform outage
this time, just no credential in this particular shell.

1. **`agent_functions.enabled` kill-switch UI toggle** — `DispatcherView.jsx`
   now has a live Enable/Disable button per gated function in the Agent Ops
   tab (calls `supabase.from('agent_functions').update({enabled})` directly
   from the frontend using the anon key, so no edge function redeploy is
   needed for this one — just ship the frontend build).
2. **Shared-secret auth on `harvest-industrial-leads` /
   `monitor-asset-telemetry`** — needs, in order:
   - Run the new `alter table businesses add column ingestion_key text
     default gen_random_uuid()::text;` statement in
     `supabase_schema_delta_industrial.sql` (safe to run anytime, additive).
   - `supabase functions deploy harvest-industrial-leads --no-verify-jwt`
   - `supabase functions deploy monitor-asset-telemetry --no-verify-jwt`
   - Until deployed, these two endpoints are still open (no key check live).
     No real vendor is wired to either yet, so no live traffic is affected
     either way — but don't forget this step before pointing a real feed at
     them. See `SECURITY_NOTES.md` for the full rationale.

---

Consolidated reference for everything still outstanding after the Track A/B
("Agent Expansion Pack" + Industrial sector) and "Agent Operating System"
(5-phase) builds. Nothing below has been confirmed live yet except where
marked. Work through it top to bottom — order matters (tables before
functions before cron, in a few places).

Blocked right now by a Supabase-wide dashboard/CLI login outage
(status.supabase.com, "User unable to log in to Supabase Dashboard",
investigating as of 2026-09-01 08:51 UTC). Nothing here can be run until
that clears — check status.supabase.com first.

---

## NEW — 2 code fixes made locally, not yet deployed (do these FIRST, before Steps 1-4 below)

1. **`ai-intake-chat` had a live production bug**: the function threw a hard
   error (`ANTHROPIC_API_KEY not configured in Supabase secrets`, 500
   response) for every single chat widget interaction, since
   `ANTHROPIC_API_KEY` was never actually set in Supabase secrets despite
   Standard-tier being sold with this feature live. Fixed locally by adding
   a deterministic `runTemplateIntake()` fallback (same 5-question flow:
   job description → urgency → name → phone → suburb, plus the existing
   referral-code and repeat-client logic, unchanged) that runs automatically
   whenever the key is absent, matching every other Agent OS function's
   already-correct fallback pattern. **This function needs a redeploy**
   (`npx supabase functions deploy ai-intake-chat`) even though it's in the
   "already confirmed live" list above — that deployed version is the
   broken one.
2. **Matching copy fix** (now that the feature genuinely works without the
   key, "AI" language was inaccurate either way): removed "AI intake
   chat"/"AI lead intake" wording from `Onboarding.jsx`, `LandingPage.jsx`
   (Features + Pricing sections), and `SuccessPage.jsx` per
   `SALES_CLAIMS_ACCURACY_NOTE.md`. These are bundled into the Step 4
   frontend push below — no separate action needed, just don't forget
   they're now part of that commit.

---

## Already confirmed live (no action needed)
- Original 27 edge functions (deployed 2026-09-01).
- `supabase_schema_delta_escalation.sql`, `supabase_schema_delta_agent_expansion.sql`,
  `supabase_schema_delta_industrial.sql`, `supabase_schema_delta_agent_cron.sql` — all
  4 ran successfully.
- The original `AUTONOMOUS AGENTS` cron block inside `supabase_schema.sql` (11 cron
  jobs + auto-dispatch trigger) — ran successfully.
- pg_cron / pg_net extensions — enabled (Database > Extensions).

---

## Step 1 — SQL delta files (Supabase SQL Editor), run in this exact order

### 1a. `supabase_schema_delta_agent_infra.sql` (Phase 1 tables)
Creates `agent_functions`, `agent_insights`, `record_agent_run()`, seeds 39 rows.

```sql
-- ============================================================
-- MINERVA — Delta: Agent Operating System, Phase 1 (infrastructure), 2026-09-01.
-- ============================================================

create table agent_functions (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  agent               text not null,
  enabled             boolean not null default true,
  last_run_at         timestamptz,
  last_status         text,
  last_error          text,
  error_count         integer not null default 0,
  last_health_alert_at timestamptz,
  created_at          timestamptz default now()
);
alter table agent_functions enable row level security;
create policy "anon insert agent_functions" on agent_functions
  for insert with check (true);
create policy "anon select agent_functions" on agent_functions
  for select using (true);
create policy "anon update agent_functions" on agent_functions
  for update using (true);
create policy "anon delete agent_functions" on agent_functions
  for delete using (true);

create table agent_insights (
  id            uuid primary key default gen_random_uuid(),
  agent         text not null,
  insight_type  text not null,
  summary       text not null,
  business_id   uuid references businesses(id),
  related_table text,
  related_id    uuid,
  created_at    timestamptz default now()
);
alter table agent_insights enable row level security;
create policy "anon insert agent_insights" on agent_insights
  for insert with check (true);
create policy "anon select agent_insights" on agent_insights
  for select using (true);
create policy "anon update agent_insights" on agent_insights
  for update using (true);
create policy "anon delete agent_insights" on agent_insights
  for delete using (true);

create or replace function record_agent_run(fn_name text, status text, error_msg text default null)
returns void as $$
begin
  insert into agent_functions (name, agent, last_run_at, last_status, last_error, error_count)
  values (fn_name, 'core', now(), status, error_msg, case when status = 'error' then 1 else 0 end)
  on conflict (name) do update set
    last_run_at = now(),
    last_status = excluded.last_status,
    last_error  = excluded.last_error,
    error_count = agent_functions.error_count + case when excluded.last_status = 'error' then 1 else 0 end;
end;
$$ language plpgsql;

insert into agent_functions (name, agent) values
  ('nurture-stale-leads',        'outreach'),
  ('chase-unpaid-invoices',      'outreach'),
  ('retention-checkin',          'outreach'),
  ('winback-lost-leads',         'outreach'),
  ('ai-intake-chat',             'outreach'),
  ('generate-growth-drafts',     'marketing'),
  ('launch-ad-campaign',         'marketing'),
  ('send-growth-message',        'marketing'),
  ('auto-assign-technician',     'scheduling'),
  ('detect-wasted-trips',        'scheduling'),
  ('check-weather-risk',         'scheduling'),
  ('update-technician-workload', 'scheduling'),
  ('reconcile-billing',          'finance'),
  ('check-credential-expiry',    'finance'),
  ('notify-slack',                  'core'),
  ('calendar-feed',                 'core'),
  ('daily-digest',                  'core'),
  ('check-inventory-levels',        'core'),
  ('verify-checklist-photos',       'core'),
  ('run-custom-workflows',          'core'),
  ('industrial-conductor',          'core'),
  ('harvest-industrial-leads',      'core'),
  ('enrich-industrial-leads',       'core'),
  ('monitor-asset-telemetry',       'core'),
  ('optimize-industrial-routes',    'core'),
  ('track-consumables',             'core'),
  ('detect-safety-hazards',         'core'),
  ('sequence-handoffs',             'core'),
  ('package-client-verification',   'core'),
  ('verify-industrial-compliance',  'core'),
  ('stripe-webhook',                'core'),
  ('missed-call-webhook',           'core'),
  ('send-completion-sms',           'core'),
  ('send-eta-sms',                  'core'),
  ('send-invoice-sms',              'core'),
  ('send-referral-code-sms',        'core'),
  ('send-setup-sms',                'core'),
  ('send-weather-reschedule-sms',   'core'),
  ('create-checkout-session',       'core'),
  ('sync-technician-billing',       'core')
on conflict (name) do nothing;
```

### 1b. `supabase_schema_delta_agent_phase3.sql` (Phase 3 column)
Only needs `agent_functions` to already exist — no function deploy dependency.

```sql
alter table technicians add column overload_alert_date date;
```

### 1c. `supabase_schema_delta_agent_council.sql` (Phase 4 table)

```sql
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
```

---

## Step 2 — Deploy edge functions (needs Supabase CLI login working)

Run from `~/Downloads/minerva`. These are NEW functions, plus existing ones
whose code changed during Track A/B or Agent OS phases 2-4 and need a
redeploy to pick up the new behavior.

**Track A/B (13 functions — 2 need `--no-verify-jwt`):**
```
npx supabase functions deploy verify-checklist-photos
npx supabase functions deploy run-custom-workflows
npx supabase functions deploy winback-lost-leads
npx supabase functions deploy industrial-conductor
npx supabase functions deploy harvest-industrial-leads --no-verify-jwt
npx supabase functions deploy enrich-industrial-leads
npx supabase functions deploy monitor-asset-telemetry --no-verify-jwt
npx supabase functions deploy optimize-industrial-routes
npx supabase functions deploy track-consumables
npx supabase functions deploy detect-safety-hazards
npx supabase functions deploy sequence-handoffs
npx supabase functions deploy package-client-verification
npx supabase functions deploy verify-industrial-compliance
```

**Agent OS Phase 1 (1 new function):**
```
npx supabase functions deploy test-agent-health
```

**Agent OS Phase 2 — Outreach + Finance reasoning (5 more; winback-lost-leads
already covered above):**
```
npx supabase functions deploy nurture-stale-leads
npx supabase functions deploy chase-unpaid-invoices
npx supabase functions deploy retention-checkin
npx supabase functions deploy reconcile-billing
npx supabase functions deploy check-credential-expiry
```

**Agent OS Phase 3 — Marketing + Scheduling (7 functions):**
```
npx supabase functions deploy generate-growth-drafts
npx supabase functions deploy launch-ad-campaign
npx supabase functions deploy send-growth-message
npx supabase functions deploy auto-assign-technician
npx supabase functions deploy detect-wasted-trips
npx supabase functions deploy check-weather-risk
npx supabase functions deploy update-technician-workload
```

**Agent OS Phase 4 (1 new function):**
```
npx supabase functions deploy agent-council-report
```

Total: 27 unique deploy commands.

---

## Step 3 — Remaining cron delta files (run AFTER their function is deployed)

### 3a. `supabase_schema_delta_agent_infra_cron.sql`
Run only after `test-agent-health` is deployed AND file 1a above has run.

```sql
select cron.schedule(
  'test-agent-health-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/test-agent-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### 3b. `supabase_schema_delta_agent_council_cron.sql`
Run only after `agent-council-report` is deployed AND file 1c above has run.

```sql
select cron.schedule(
  'agent-council-report-weekly',
  '0 21 * * 1',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/agent-council-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

---

## Step 4 — Push Phase 5 frontend change

From `~/Downloads/minerva`:
```
git add -A
git commit -m "Add read-only Agent Ops dashboard tab"
git push
```
(Vercel auto-deploys from `github.com/papalkarjahan-lang/minerva.git`, branch `main`.)
New tab lives at `/dispatch/<businessId>?agents=1` once deployed.

---

## Recap: full run order
1. SQL 1a (infra tables)
2. SQL 1b (phase3 column)
3. SQL 1c (council table)
4. Deploy all 27 functions listed in Step 2
5. SQL 3a (infra cron — needs test-agent-health deployed)
6. SQL 3b (council cron — needs agent-council-report deployed)
7. `git push` (Phase 5 UI)
