-- Lead-source attribution (added 2026-09-13)
-- Purely additive: leads.source already exists (free-text, defaults to
-- 'ai_intake_chat' or 'voice_intake_agent' or 'referral'), but there was no
-- way to tell *which* outreach effort or ad campaign actually drove a click
-- to the intake widget in the first place. utm_source/utm_medium/utm_campaign
-- capture the standard UTM params from the widget URL (e.g.
-- /intake/:businessId?utm_source=facebook&utm_campaign=spring_promo) exactly
-- once, at lead-capture time — nothing retroactive, no cross-business
-- sharing, same anon-link trust model as every other column in this schema.

alter table leads add column if not exists utm_source text;
alter table leads add column if not exists utm_medium text;
alter table leads add column if not exists utm_campaign text;

-- lead_attribution_summary: per-business channel breakdown so a dispatcher
-- (or a growth report) can see which channel is actually converting, not
-- just which one produced the most raw leads. "Channel" collapses to the
-- most specific thing actually known: utm_campaign if set, else utm_source,
-- else the plain `source` column (e.g. 'referral', 'ai_intake_chat') — so a
-- lead with no UTM params at all still shows up under something readable
-- instead of a blank row.
create or replace view lead_attribution_summary as
select
  business_id,
  coalesce(utm_campaign, utm_source, source, 'direct') as channel,
  count(*) as total_leads,
  count(*) filter (where status = 'converted') as converted_leads,
  count(*) filter (where status = 'lost') as lost_leads,
  case when count(*) > 0
    then round(100.0 * count(*) filter (where status = 'converted') / count(*), 1)
    else 0
  end as conversion_rate_pct
from leads
group by business_id, coalesce(utm_campaign, utm_source, source, 'direct');

-- Matches the explicit grant pattern used for every other anon-readable
-- object in this schema (see the big grant block after Table 4/leads) —
-- without this, PostgREST returns an empty/forbidden result for the anon
-- role even though the view itself compiles fine.
grant select on lead_attribution_summary to anon, authenticated, service_role;
