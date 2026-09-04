-- ============================================================
-- MINERVA — Delta: "Minerva Max" premium add-on tier (2026-09-04, same
-- afternoon as the round-2 batch). This does NOT add new features — every
-- feature it gates already exists (Minerva Max batch + round-2 batch).
-- What it adds is the monetization layer: per-business, per-addon opt-in
-- flags + trial tracking, so these features are individually salable
-- add-ons rather than always-on freebies bundled into base pricing.
--
-- Design (see product discussion, not re-derived here): individual addon
-- opt-in, not one $300-500 lump switch — a business turns addons on one at
-- a time as usage-triggered nudges prove their value, and only lands on
-- the full "Max" bundle once several are already sticking.
--
-- Honest scope note: this is feature-gating infrastructure only. It does
-- NOT wire real Stripe billing for these addons — enabling/trialing an
-- addon here just flips a flag the frontend/edge functions check. Real
-- recurring billing for individual addons would need its own explicit
-- Stripe walkthrough (new Prices, subscription-item add/remove flow),
-- same boundary as the base-tier Stripe setup.
--
-- Run once in the Supabase SQL Editor, or via the Management API. Purely
-- additive.
-- ============================================================

-- businesses.max_addons: { "surge_pricing": true, "ai_quotes": false, ... }
-- A key is only ever true once explicitly enabled (button click) or while
-- an active trial is running (see max_addon_trials) — never defaulted on.
alter table businesses add column max_addons jsonb not null default '{}'::jsonb;

-- businesses.max_addon_trials: { "surge_pricing": { "started_at": "...", "ends_at": "..." } }
-- 30-day trial per addon, started by an explicit "Start free trial" click.
-- hasAddon()/isTrialing() in src/maxAddons.js are the single source of
-- truth for reading these two columns — edge functions and the frontend
-- both use the same "enabled OR active trial" definition.
alter table businesses add column max_addon_trials jsonb not null default '{}'::jsonb;

-- Lets a dispatcher dismiss a specific usage-triggered upsell nudge (e.g.
-- "you left $420 in after-hours premium unclaimed last month") without it
-- reappearing every session. Keyed by a stable nudge_key per addon, not by
-- the computed dollar figure, so dismissing doesn't need re-matching exact
-- numbers next time the nudge recomputes.
create table upsell_nudge_dismissals (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  nudge_key     text not null,
  dismissed_at  timestamptz default now(),
  unique(business_id, nudge_key)
);
alter table upsell_nudge_dismissals enable row level security;
create policy "anon all upsell_nudge_dismissals" on upsell_nudge_dismissals
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- Grants — this project's Postgres setup does NOT auto-grant via schema-
-- level default privileges (see minerva_setup_progress.md's "Lesson for
-- future sessions" note from the 2026-09-02 outage), so the new table
-- needs an explicit grant alongside its RLS policy or it 403s despite the
-- policy being correct.
-- ------------------------------------------------------------
grant select, insert, update, delete on upsell_nudge_dismissals to anon, authenticated, service_role;
