-- ============================================================
-- MINERVA — Add file-size and MIME-type limits to public storage
-- buckets (2026-09-23, Round 39).
--
-- checklist-photos and credential-documents were both created with
-- file_size_limit = null and allowed_mime_types = null — no server-side
-- restriction at all. The `accept="image/*"` / `accept="image/*,
-- application/pdf"` attributes on the two <input type="file"> elements
-- that upload into them (TechnicianView.jsx:1147, DispatcherView.jsx:3421)
-- are browser UI hints only; they do nothing to stop a raw call to the
-- Storage API (using the anon key, which is extractable from any
-- browser's JS bundle — same trust tier as everything else in
-- SECURITY_NOTES.md) from uploading a file of any type or size. Both
-- buckets are `public: true`, so an unrestricted upload is also
-- immediately servable back over a public URL.
--
-- Real-world exposure this closes: unbounded storage-cost abuse (a
-- single anon-key holder could upload arbitrarily large files with no
-- limit), and hosting/serving arbitrary file types (executables, HTML
-- with embedded scripts, etc.) rather than only the photos/PDFs these
-- buckets exist for.
--
-- Limits chosen to comfortably fit real usage with headroom, not to
-- change behavior for a real technician/dispatcher:
--   - checklist-photos: phone camera photos only, 15 MB cap (typical
--     phone photo is 2-8 MB even uncompressed; 15 MB leaves headroom
--     for high-res HEIC/RAW-adjacent formats without allowing arbitrary
--     large files).
--   - credential-documents: phone photos OR scanned PDFs, 20 MB cap
--     (a multi-page scanned licence/certification PDF can run larger
--     than a single photo).
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

update storage.buckets
set file_size_limit = 15728640, -- 15 MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id = 'checklist-photos';

update storage.buckets
set file_size_limit = 20971520, -- 20 MB
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
where id = 'credential-documents';
