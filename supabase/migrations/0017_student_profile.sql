-- =============================================================================
-- 0017_student_profile.sql — the self-reported academic record behind /profile
--
-- Spec reference: §22 open question 4 ("full degree-audit … remains unscoped
-- and is the largest possible future feature"), §15 "Auth & Accounts".
--
-- ── The one thing to understand before changing this file ────────────────────
--
-- EVERY ROW HERE IS SELF-REPORTED. None of it comes from Columbia and none of
-- it can. `vergil_api_spec.md` §9 lists the student-record endpoints
-- (studentclasses, academicplans, transfercredits, gpa) and §15 rules them out:
-- they need a Vergil bearer token, which AGENTS.md forbids us from touching,
-- and centralized third-party ingestion of education records creates FERPA
-- exposure.
--
-- So this is a student's own notes about their own degree, stored under the
-- same owner-private RLS as their plans. `source` on every course records how
-- it got here and is displayed in the UI — provenance travels, per §3.
--
-- DELIBERATELY ABSENT: grades and GPA. There is no column for either. The
-- transcript importer shows grades during review and discards them. Adding a
-- grade column later would turn a set of course codes into an education record
-- and change this table's regulatory character entirely, so the absence is
-- load-bearing rather than incidental.
--
-- ALSO ABSENT: any storage for the transcript FILE. PDFs are parsed in the
-- browser (`lib/profile/pdf-text.ts`) and never uploaded. There is no bucket.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- student_profiles
-- -----------------------------------------------------------------------------
-- One row per user. Separate from `users` rather than columns on it because
-- `users` mirrors auth identity and is written by the auth trigger; this is
-- application data the student edits.

create table if not exists student_profiles (
  user_id      uuid primary key references users (user_id) on delete cascade,
  -- 'CC' | 'SEAS' | 'GS' | 'BC'. Constrained rather than free text so a typo
  -- cannot silently detach a student from their Core.
  school       text check (school in ('CC', 'SEAS', 'GS', 'BC')),
  -- Program ids from lib/requirements/programs, e.g. 'cc-major-computer-science'.
  -- Not a FK: programs live in code and in a future parsed registry, not in a
  -- table, and a FK to a table that does not exist is a migration nobody can run.
  program_ids  text[] not null default array[]::text[],
  class_year   text,
  -- 'programId:groupId' -> ISO timestamp the student ticked it.
  attestations jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint student_profiles_program_ids_sane
    check (array_length(program_ids, 1) is null or array_length(program_ids, 1) <= 8),
  constraint student_profiles_attestations_is_object
    check (jsonb_typeof(attestations) = 'object')
);

comment on table student_profiles is
  'Self-reported degree context. Never sourced from Columbia — see the header of this migration.';
comment on column student_profiles.attestations is
  'Requirements the student certified themselves, for rules no public data source can verify (language placement, swim test, SEAS List B).';

drop trigger if exists trg_student_profiles_updated_at on student_profiles;
create trigger trg_student_profiles_updated_at before update on student_profiles
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- student_courses
-- -----------------------------------------------------------------------------
-- The coursework a student says they have done.
--
-- `course_id` is NOT a foreign key to `courses`, and that is deliberate. A
-- transcript legitimately contains courses our catalog does not hold: archived
-- terms we have not backfilled, transfer credit from another institution,
-- courses the registrar has since retired. A FK would reject exactly those rows
-- — the ones a student most needs recorded — and it would reject them at import
-- time with a database error rather than a explanation. The audit engine
-- already handles an unresolvable course id correctly: it counts toward nothing
-- flagged and is reported in `unmatchedCourseIds`.

create table if not exists student_courses (
  user_id     uuid not null references users (user_id) on delete cascade,
  course_id   text not null check (btrim(course_id) <> ''),
  -- No FK to terms, for the same reason as course_id above.
  term_code   text,
  -- As printed on their transcript: 'Fall 2024'. Kept because an imported row
  -- may carry a term we cannot map to a term_code.
  term_label  text,
  points      numeric(4, 2) check (points is null or (points >= 0 and points <= 30)),
  source      text not null default 'picker'
                check (source in ('picker', 'transcript_paste', 'transcript_pdf', 'plan')),
  added_at    timestamptz not null default now(),
  primary key (user_id, course_id)
);

comment on table student_courses is
  'Self-reported completed coursework. No grade column, by design — see the migration header.';
comment on column student_courses.course_id is
  'Intentionally not a FK: transfer credit and un-backfilled archived terms are legitimate rows our catalog does not contain.';

create index if not exists idx_student_courses_user on student_courses (user_id, added_at desc);

-- =============================================================================
-- Row level security
-- =============================================================================
-- Owner-private, per command, matching the pattern established in 0005.
-- Nothing here is ever world-readable: a shared schedule link exposes a plan,
-- never a transcript.

alter table student_profiles enable row level security;
alter table student_courses  enable row level security;

-- student_profiles ---------------------------------------------------------
drop policy if exists student_profiles_select_own on student_profiles;
create policy student_profiles_select_own on student_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists student_profiles_insert_own on student_profiles;
create policy student_profiles_insert_own on student_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists student_profiles_update_own on student_profiles;
create policy student_profiles_update_own on student_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists student_profiles_delete_own on student_profiles;
create policy student_profiles_delete_own on student_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- student_courses ----------------------------------------------------------
drop policy if exists student_courses_select_own on student_courses;
create policy student_courses_select_own on student_courses
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists student_courses_insert_own on student_courses;
create policy student_courses_insert_own on student_courses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists student_courses_update_own on student_courses;
create policy student_courses_update_own on student_courses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists student_courses_delete_own on student_courses;
create policy student_courses_delete_own on student_courses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Export and erasure
-- -----------------------------------------------------------------------------
-- `vergil_api_spec.md` §15 requires "user-initiated deletion and export of
-- stored personal data" as a named practice. Deletion of the account already
-- cascades from auth.users; this is the narrower "forget my academic record but
-- keep my schedule" case, which is the one a student actually asks for.

create or replace function delete_my_academic_record()
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  delete from student_courses  where user_id = (select auth.uid());
  delete from student_profiles where user_id = (select auth.uid());
$$;

comment on function delete_my_academic_record is
  'Erases the caller''s self-reported coursework and degree context. security invoker, so RLS still applies and it can only ever delete the caller''s own rows.';

revoke all on function delete_my_academic_record() from public;
grant execute on function delete_my_academic_record() to authenticated;
