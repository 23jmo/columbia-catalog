-- ---------------------------------------------------------------------------
-- 0012 — subject codes are padded with underscores.
--
-- `subjects.subject_code` was checked against `^[A-Z]{2,6}$`. Columbia pads
-- short subject codes to four characters with trailing underscores, and the
-- padded form is what appears in the directory URL:
--
--   https://doc.sis.columbia.edu/subj/PE__/_Fall2026.html
--   https://doc.sis.columbia.edu/subj/LAW_/_Fall2026.html
--
-- `lib/ingest/parsers/subject-index.ts` keeps the padding verbatim for exactly
-- that reason — stripping it would produce a subject code that cannot be turned
-- back into a fetchable URL. The check then rejected it on write.
--
-- The first full crawl of Fall 2026 + Spring 2027 lost 36 of 432 subject-term
-- pages to this, every one of them a whole subject: Physical Education, Law,
-- Nursing, Medicine, Occupational Therapy, Public Health, Urban Studies and
-- more. `ingest_subject_page` is one transaction, so a subject whose code the
-- check rejects loses all of its courses and sections, not just its own row.
--
-- Trailing underscores only, and still capped at six characters: the check
-- exists to catch a parser that has started reading the wrong cell, and
-- "Physical Education" arriving as a subject code should still fail.
-- ---------------------------------------------------------------------------

alter table subjects drop constraint if exists subjects_subject_code_check;
alter table subjects add constraint subjects_subject_code_check
  check (subject_code ~ '^[A-Z]{2,6}_*$' and char_length(subject_code) <= 6);
