-- ============================================================
-- MINERVA — incoming-sms-webhook retention cron, 2026-10-11. Run AFTER
-- supabase_schema_delta_incoming_sms_webhook.sql (needs the table to
-- already exist). Same 90-day pattern as
-- supabase_schema_delta_retention_cleanup.sql's own
-- cleanup-processed-call-sids-daily, kept as its own self-contained delta
-- rather than editing that already-deployed file.
-- ============================================================

select cron.schedule(
  'cleanup-processed-sms-sids-daily',
  '45 3 * * *',
  $$delete from processed_sms_sids where processed_at < now() - interval '90 days';$$
);

-- Verify after running:
--   select * from cron.job where jobname = 'cleanup-processed-sms-sids-daily'; -- expect: 1 row
