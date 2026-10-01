-- ============================================================
-- MINERVA — Delta: real Stripe billing for Minerva Max add-ons (2026-10-01).
--
-- Closes the last explicitly-documented outstanding item in
-- DEPLOYMENT_CHECKLIST_PENDING.md: "Real Stripe per-add-on billing wiring
-- for the Minerva Max tier — the add-on enable/trial flags and gating are
-- live, but actually charging for each add-on through Stripe still needs
-- to be wired up."
--
-- Until now, enableMaxAddon/disableMaxAddon in DispatcherView.jsx just
-- flipped businesses.max_addons[key] straight from the browser — no Stripe
-- call at all (see the honest-scope note in
-- supabase_schema_delta_minerva_max_tier.sql). This delta adds the one
-- column needed to track per-addon Stripe subscription items so they can
-- be added/removed cleanly; the new update-addon-billing edge function
-- (deployed separately) is what actually calls Stripe and writes here.
--
-- max_addon_stripe_items maps addonKey -> Stripe subscription_item id, e.g.
-- {"ai_quotes": "si_abc123"}. Only populated for addons enabled through the
-- new billed flow — trial-only or pre-this-delta "flag flipped free" addons
-- correctly have no entry, since there is no Stripe item to remove for them.
--
-- Run once in the Supabase SQL Editor, or via `supabase db query --linked`.
-- Idempotent: `if not exists` / `on conflict do nothing` throughout.
-- ============================================================

alter table businesses add column if not exists max_addon_stripe_items jsonb not null default '{}'::jsonb;

insert into agent_functions (name, agent) values
  ('update-addon-billing', 'core')
on conflict (name) do nothing;
