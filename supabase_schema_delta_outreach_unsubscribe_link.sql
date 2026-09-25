-- ============================================================
-- MINERVA — register outreach-unsubscribe with the Agent OS (2026-09-25).
--
-- New function: a real, self-service, one-click unsubscribe link for
-- Minerva's own cold outreach emails (send-outreach-batch), now that
-- RESEND_API_KEY is actually configured and that send path is no longer
-- an inert no-op. Previously the ONLY unsubscribe mechanism was a plain
-- "reply \"unsubscribe\"" text line, requiring a human to notice the
-- reply and manually flip outreach_prospects.unsubscribed_at in the
-- admin console — see outreach-unsubscribe/index.ts header for the full
-- Spam Act 2003 compliance rationale.
--
-- Deliberately NO enabled-check wired into the function's own code, same
-- risk-based reasoning as track-review-click/stripe-webhook: by the time
-- this link is clicked, it has already been sent to a real prospect's
-- real inbox, so a kill switch could only ever turn a working
-- unsubscribe link into a broken one for someone actively trying to
-- opt out — exactly the outcome Spam Act compliance requires avoiding.
-- Registered for dashboard visibility/health tracking only
-- (record_agent_run).
-- ============================================================

insert into agent_functions (name, agent) values
  ('outreach-unsubscribe', 'outreach')
on conflict (name) do nothing;
