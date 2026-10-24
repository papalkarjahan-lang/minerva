-- ============================================================
-- MINERVA — Delta: register check-service-credentials with the Agent OS,
-- 2026-10-24. No new table or column — reuses agent_functions/agent_insights,
-- both already live. Run once, AFTER check-service-credentials has been
-- deployed.
--
-- What this fixes: test-agent-health flags a cron function unhealthy only
-- if it stops running or THROWS repeatedly — a failed Twilio/Resend send
-- never throws (the shared helper catches it and returns false), so the
-- function still reports status:'ok' every time regardless of whether the
-- SMS/email actually went anywhere. Found live 2026-10-24: Twilio's trial
-- account expired 2026-09-18 with no subsequent upgrade, and nothing in
-- this codebase ever noticed for over a month. check-service-credentials
-- checks the real external services directly instead of inferring health
-- from "did our own code crash."
-- ============================================================

insert into agent_functions (name, agent) values
  ('check-service-credentials', 'core')
on conflict (name) do nothing;
