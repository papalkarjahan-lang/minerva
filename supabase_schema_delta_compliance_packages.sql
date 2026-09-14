-- Trade-sector compliance document packaging (added 2026-09-14)
-- Purely additive. Mirrors client_verification_packages (the industrial
-- sector's "Closer" pattern, see supabase_schema_delta_industrial.sql) for
-- ordinary trade jobs — assembles evidence already in the database
-- (checklist results/photos, materials used, technician credentials, the
-- invoice) into one packaged, human-reviewable document. IMPORTANT: this is
-- an evidence-assembly aid for a human to review and send to whoever needs
-- it (a client, an insurer, a regulator) — it is never automatically
-- lodged/filed anywhere. See generate-compliance-package's own header
-- comment for the full reasoning.

create table if not exists compliance_packages (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references jobs(id) on delete cascade,
  business_id   uuid references businesses(id) on delete cascade,
  summary       text, -- plain-language summary of what the evidence shows
  evidence      jsonb, -- assembled snapshot: checklist results/photos, materials, technician credentials, invoice, at time of packaging
  sent_at       timestamptz, -- set when a dispatcher clicks "Mark sent" after actually sending it themselves — never set automatically
  sent_to       text, -- free-text note a dispatcher enters, e.g. "emailed to client" or "given to WorkSafe inspector" — informational only
  created_at    timestamptz default now()
);
create index if not exists idx_compliance_packages_job on compliance_packages(job_id);
create index if not exists idx_compliance_packages_business on compliance_packages(business_id);

alter table compliance_packages enable row level security;
create policy "anon all compliance_packages" on compliance_packages
  for all using (true) with check (true);

grant select, insert, update, delete on compliance_packages to anon, authenticated, service_role;
