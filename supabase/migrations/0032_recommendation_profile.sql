-- =============================================================================
-- 0032_recommendation_profile.sql — the storage the recommender needs
--
-- Spec: "Repositioning Columbia Catalog around profile-driven course
-- recommendation" (2026-08-24), §"Schema changes".
--
-- Five independent additions, grouped here because they land together and each
-- one is small:
--
--   1. `student_courses.liked`      — the preference signal (blocker #5)
--   2. `student_profiles.interest_tags` — declared interests
--   3. `courses.prerequisite_formula` + confidence — the structured prereq
--      corpus deferred in 0001_catalog.sql:189 (blocker #3)
--   4. `agent_*`                    — conversation memory and rate limiting
--
-- Every statement is idempotent, following the convention 0028 established
-- after a version-vs-filename mismatch left that migration half-applied.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. student_courses.liked — the preference signal
-- -----------------------------------------------------------------------------
-- The product thesis is "courses to take based on what you have taken OR
-- LIKED". The second half had nowhere to live: this table records what a
-- student took and deliberately holds no grade.
--
-- ── `liked` IS NOT A GRADE, AND THE DISTINCTION IS THE WHOLE POINT ───────────
--
-- 0028's header is emphatic that the absence of grades is load-bearing rather
-- than incidental: a grade column would "turn a set of course codes into an
-- education record and change this table's regulatory character entirely".
-- That reasoning is untouched here and must stay untouched.
--
-- A grade is issued BY the institution, is an official record of performance,
-- and is the thing FERPA is about. `liked` is a student's own opinion about a
-- course, volunteered to tune a recommendation feed, and it says nothing about
-- how they performed — a student can love a class they did badly in, which is
-- exactly the case a taste model must get right. It is the same regulatory
-- character as a bookmark.
--
-- NULL is a real and common state: "we have not asked". Two-valued would force
-- every un-reviewed course to read as disliked, which would poison the taste
-- vector with the majority of a transcript.

alter table student_courses add column if not exists liked boolean;

comment on column student_courses.liked is
  'Student''s own opinion, for recommendation tuning. NULL = not asked. NOT a grade and not derived from one — see this migration''s header before adding anything performance-related here.';

-- Onboarding's guess-and-confirm grid is a distinct provenance from the manual
-- picker: a row the student ticked off a generated list is weaker evidence than
-- one they searched for by name, and `source` is displayed in the UI.
alter table student_courses drop constraint if exists student_courses_source_check;
alter table student_courses add constraint student_courses_source_check
  check (source in (
    'picker',
    'transcript_paste',
    'transcript_pdf',
    'plan',
    'onboarding_guess'
  ));

-- Partial index: the taste vector reads only the rows that carry an opinion,
-- and those are a small minority of a transcript.
create index if not exists idx_student_courses_liked
  on student_courses (user_id) where liked is not null;

-- -----------------------------------------------------------------------------
-- 2. student_profiles.interest_tags
-- -----------------------------------------------------------------------------
-- Hand-authored, major-scoped tags ("AI/ML", "systems", "theory"). Each maps in
-- application code to a seed vector built from exemplar courses, so the tags
-- are opaque strings here on purpose — the mapping is curriculum judgement and
-- belongs in a reviewed source file, not in a row a migration seeds.

alter table student_profiles
  add column if not exists interest_tags text[] not null default array[]::text[];

comment on column student_profiles.interest_tags is
  'Student-selected interest tags, major-scoped. Opaque here; lib/recommend maps each to a seed vector.';

alter table student_profiles drop constraint if exists student_profiles_interest_tags_sane;
alter table student_profiles add constraint student_profiles_interest_tags_sane
  check (array_length(interest_tags, 1) is null or array_length(interest_tags, 1) <= 24);

-- -----------------------------------------------------------------------------
-- 3. courses.prerequisite_formula — the structured corpus
-- -----------------------------------------------------------------------------
-- 0001_catalog.sql:189 called this out explicitly as deferred:
--
--   "DEVIATION 2: the sketch's prerequisite_formula / corequisite_formula
--    promised structured parse output we do not have. The directory prints
--    prose. Stored as *_text to be honest about what it is; a structured
--    formula column can be added later without a rewrite."
--
-- This is that later. `lib/prereqs/parse.ts` is a 589-line recursive-descent
-- parser that has only ever run over a 127-course checked-in fixture; the
-- prose it needs is in `prerequisite_text` on every course that has any.
--
-- Shape: `PrereqRequirement` from lib/prereqs/types.ts minus the fields already
-- stored as columns — `{ tree, corequisites, instructorPermission, advisories }`,
-- where `tree` is a tagged union of course/all/any/advisory.
--
-- Held as jsonb rather than normalised into an edge table because it is a
-- BOOLEAN EXPRESSION, not a set: flattening "(A or B) and C" into edges loses
-- the parenthesisation, and the planner would then clear a student who took
-- only A and B.
--
-- `instructorPermission` is stored rather than derived, and it is the field
-- that stops the recommender's prerequisite filter from being cruel. Roughly a
-- third of Columbia's prerequisites end "or permission of the instructor",
-- which makes every gate above them SOFT — the course is still worth showing,
-- with what is missing named. A filter that dropped those rows would hide the
-- courses a motivated student is most likely to actually get into.

alter table courses add column if not exists prerequisite_formula jsonb;
alter table courses add column if not exists prerequisite_confidence text;

alter table courses drop constraint if exists courses_prerequisite_confidence_check;
alter table courses add constraint courses_prerequisite_confidence_check
  check (prerequisite_confidence is null or prerequisite_confidence in (
    -- every clause resolved to course references
    'structured',
    -- some courses resolved, some prose remained
    'partial',
    -- no course reference at all ("permission of the instructor")
    'prose'
  ));

comment on column courses.prerequisite_formula is
  'PrereqNode tree (lib/prereqs/types.ts) parsed from prerequisite_text. jsonb, not an edge table: the parenthesisation of "(A or B) and C" is load-bearing.';
comment on column courses.prerequisite_confidence is
  'How much of the prose became structure. Always displayed beside any claim the parse supports — a "prose" formula must never gate a course.';

-- Answers "which courses are reachable given what I have taken" by narrowing to
-- the rows a prereq filter can actually reason about.
create index if not exists idx_courses_prerequisite_confidence
  on courses (prerequisite_confidence) where prerequisite_formula is not null;

-- -----------------------------------------------------------------------------
-- 4. The agent's conversation state
-- -----------------------------------------------------------------------------
-- Owner-private throughout, matching the pattern 0005 established and 0028
-- reused. A conversation contains a student's academic situation in their own
-- words and is strictly more sensitive than their schedule.

create table if not exists agent_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users (user_id) on delete cascade,
  -- First prompt, truncated, for the thread list. Not model-generated: naming
  -- a thread with an LLM call would spend a rate-limited prompt on a label.
  title           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_agent_conversations_user
  on agent_conversations (user_id, updated_at desc);

drop trigger if exists trg_agent_conversations_updated_at on agent_conversations;
create trigger trg_agent_conversations_updated_at before update on agent_conversations
  for each row execute function set_updated_at();

create table if not exists agent_messages (
  message_id      uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references agent_conversations (conversation_id)
                    on delete cascade,
  user_id         uuid not null references users (user_id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  -- Rendered prose. The structured half (tool calls, the section cards a turn
  -- resolved to) lives in `parts` so a reloaded thread renders identically to a
  -- streamed one instead of degrading to plain text.
  content         text not null default '',
  parts           jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(parts) = 'array'),
  created_at      timestamptz not null default now()
);

create index if not exists idx_agent_messages_conversation
  on agent_messages (conversation_id, created_at);

comment on column agent_messages.parts is
  'AI SDK UIMessage parts: tool calls, tool results, and the course ids a turn cited. Kept so history renders as cards rather than as prose about cards.';

-- Rate limiting: 20 prompts per student per 6 hours.
--
-- One row per prompt rather than a counter, because a counter cannot answer
-- "when does my limit reset" — and a limit that cannot say when it lifts is
-- indistinguishable from being broken. Rows outside the window are swept by
-- `prune_agent_usage`.
create table if not exists agent_usage (
  usage_id   uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (user_id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_usage_user_time
  on agent_usage (user_id, created_at desc);

-- =============================================================================
-- Row level security
-- =============================================================================

alter table agent_conversations enable row level security;
alter table agent_messages      enable row level security;
alter table agent_usage         enable row level security;

drop policy if exists agent_conversations_select_own on agent_conversations;
create policy agent_conversations_select_own on agent_conversations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists agent_conversations_insert_own on agent_conversations;
create policy agent_conversations_insert_own on agent_conversations
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists agent_conversations_update_own on agent_conversations;
create policy agent_conversations_update_own on agent_conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists agent_conversations_delete_own on agent_conversations;
create policy agent_conversations_delete_own on agent_conversations
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists agent_messages_select_own on agent_messages;
create policy agent_messages_select_own on agent_messages
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists agent_messages_insert_own on agent_messages;
create policy agent_messages_insert_own on agent_messages
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists agent_messages_delete_own on agent_messages;
create policy agent_messages_delete_own on agent_messages
  for delete to authenticated using (user_id = (select auth.uid()));

-- Usage is readable by its owner so the UI can say "3 of 20 left, resets at
-- 4pm", but deliberately NOT insertable or deletable by them: a client that
-- could write its own usage rows could also decline to, and a client that
-- could delete them could reset its own limit. Only the server, through the
-- service role, records a prompt.
drop policy if exists agent_usage_select_own on agent_usage;
create policy agent_usage_select_own on agent_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Housekeeping
-- -----------------------------------------------------------------------------

create or replace function prune_agent_usage(older_than interval default interval '7 days')
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from agent_usage where created_at < now() - older_than;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function prune_agent_usage is
  'Sweeps rate-limit rows older than the window. security definer because it must reach every user''s rows, and it is granted to no one — service role only.';

revoke all on function prune_agent_usage(interval) from public;

-- -----------------------------------------------------------------------------
-- Erasure
-- -----------------------------------------------------------------------------
-- §15's "user-initiated deletion" now has more to erase. Extended rather than
-- replaced: a student asking to forget their academic record means the
-- conversations about it too.

create or replace function delete_my_academic_record()
returns void
language sql
volatile
security invoker
set search_path = public
as $$
  delete from agent_messages      where user_id = (select auth.uid());
  delete from agent_conversations where user_id = (select auth.uid());
  delete from student_courses     where user_id = (select auth.uid());
  delete from student_profiles    where user_id = (select auth.uid());
$$;

comment on function delete_my_academic_record is
  'Erases the caller''s self-reported coursework, degree context, and agent conversations. security invoker, so RLS still applies and it can only ever delete the caller''s own rows.';

revoke all on function delete_my_academic_record() from public;
grant execute on function delete_my_academic_record() to authenticated;
