-- ============================================================
-- MINERVA — Delta: job cancel/reschedule SMS idempotency columns
-- (2026-09-30).
--
-- WHY: cancelJob/rescheduleJob (DispatcherView.jsx, new this round) are
-- the first way to cancel or reschedule a job at all in this app — until
-- now a job could only ever move forward (assigned -> started -> complete),
-- so nothing analogous to `sms_sent`/`completion_sms_sent`/
-- `technician_notified_at` existed for either event. These follow the
-- exact same claim-before-send pattern as every other SMS-sending function
-- in this codebase (see send-job-assignment-sms's `technician_notified_for`
-- comment) so a flaky-connection resubmit from the dispatcher or a
-- duplicate network retry can't double-text a client/technician.
-- ============================================================

alter table jobs add column if not exists cancelled_sms_sent_at timestamptz;
-- Set once send-job-cancelled-sms has successfully claimed this job's
-- cancellation notification. A cancelled job never uncancels, so a plain
-- null-check claim (no "-for" variant needed) is sufficient.

alter table jobs add column if not exists rescheduled_sms_sent_for timestamptz;
-- Stores the scheduled_time value a reschedule SMS has already been sent
-- for (not just whether one was ever sent) — same "_for" pattern as
-- technician_notified_for, since a job can legitimately be rescheduled
-- more than once and each new time deserves its own notification.

insert into agent_functions (name, agent) values
  ('send-job-cancelled-sms', 'core'),
  ('send-job-rescheduled-sms', 'core')
on conflict (name) do nothing;
