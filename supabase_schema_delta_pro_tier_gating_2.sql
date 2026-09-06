-- ============================================================
-- MINERVA — Delta: Pro-tier gating, part 2 (2026-09-06, same-day follow-up
-- audit pass on UPDATE/DELETE paths and remaining add-on-gated tables).
--
-- supabase_schema_delta_pro_tier_gating.sql closed the gap for invoices/
-- assets/inventory_items but missed two more tables gated the exact same
-- way (frontend-only, per Onboarding.jsx's TIERS constant listing
-- "compliance checklists" as a Pro feature, same as invoicing/asset
-- tracking):
--   - technician_credentials (DispatcherView.jsx's AddCredentialModal —
--     the "Licence/Ticket Expiry Guardian")
--   - checklist_templates (DispatcherView.jsx's checklist setup — used for
--     both completion checklists and onboarding checklists)
-- Both have anon-writable INSERT RLS and no prior server-side check, same
-- exploit as before: a Starter/Standard business could insert directly via
-- supabase-js and get a Pro-only feature for free (and, for
-- checklist_templates specifically, the inserted row would actually be
-- read and acted on by TechnicianView, making it a fully usable bypass,
-- not just a dead row).
--
-- Reuses enforce_pro_tier_feature() already created by
-- supabase_schema_delta_pro_tier_gating.sql — only guards INSERT, same
-- reasoning as that file's header (removing/reading is unaffected, so a
-- business that downgrades doesn't get stuck unable to manage existing
-- data).
-- ============================================================

create or replace function enforce_pro_tier_technician_credentials() returns trigger as $$
begin
  perform enforce_pro_tier_feature(new.business_id, 'Licence/ticket credential tracking');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_pro_tier_technician_credentials on technician_credentials;
create trigger trg_enforce_pro_tier_technician_credentials
  before insert on technician_credentials
  for each row execute function enforce_pro_tier_technician_credentials();

create or replace function enforce_pro_tier_checklist_templates() returns trigger as $$
begin
  perform enforce_pro_tier_feature(new.business_id, 'Compliance checklists');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_pro_tier_checklist_templates on checklist_templates;
create trigger trg_enforce_pro_tier_checklist_templates
  before insert on checklist_templates
  for each row execute function enforce_pro_tier_checklist_templates();
