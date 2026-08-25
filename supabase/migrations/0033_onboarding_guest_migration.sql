-- =============================================================================
-- 0033_onboarding_guest_migration.sql — flushing a guest's onboarding into the
-- database in ONE transaction.
--
-- Spec: "Repositioning LionPlan around profile-driven course
-- recommendation" (2026-08-24), §"Schema changes":
--
--   "Guest→user migration: onboarding state in localStorage under a versioned
--    key, flushed into student_profiles + student_courses in a single
--    transaction on first sign-in."
--
-- ── Why this is a function and not two upserts from the client ───────────────
--
-- A student can complete the entire onboarding flow signed out. By the time
-- they sign in, one localStorage key holds their school, their majors, thirty
-- confirmed courses, which of those they loved, and their interest tags. Moving
-- that with two PostgREST calls means there is a window — a network round trip,
-- on a phone, during registration week — in which the profile has landed and
-- the coursework has not. A student who closes the tab in that window has a
-- degree audit against an empty transcript and no way to tell that anything
-- was lost.
--
-- A plpgsql function body is a single transaction. Either everything below
-- commits or nothing does.
--
-- ── security invoker, deliberately ──────────────────────────────────────────
--
-- Every statement runs as the caller against the RLS'd tables 0028 created, so
-- `auth.uid()` is the only user id in play and there is no argument in which a
-- caller could name someone else's record. A `security definer` version would
-- need a user-id parameter and would then be a hole shaped exactly like the one
-- it pretended to close.
--
-- ── Idempotent by construction ──────────────────────────────────────────────
--
-- Sign-in can fire this more than once: a student who signs in on their phone
-- and then on their laptop still has the guest key in the second browser. Both
-- writes are upserts keyed on the natural key, so the second call corrects the
-- first rather than duplicating it.
-- =============================================================================

create or replace function apply_onboarding_state(p_state jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_user_id      uuid := (select auth.uid());
  v_school       text;
  v_class_year   text;
  v_program_ids  text[];
  v_tags         text[];
  v_courses      jsonb;
  v_course_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'apply_onboarding_state: not signed in'
      using errcode = '28000';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'apply_onboarding_state: state must be a json object'
      using errcode = '22023';
  end if;

  v_school     := nullif(p_state ->> 'school', '');
  v_class_year := nullif(p_state ->> 'class_year', '');

  -- `coalesce` on the array extraction rather than on the jsonb: a missing key
  -- and an explicit `null` must both become the empty array, and only one of
  -- those two shapes survives `jsonb_array_elements_text` unaided.
  v_program_ids := coalesce(
    (select array_agg(value) from jsonb_array_elements_text(
       case when jsonb_typeof(p_state -> 'program_ids') = 'array'
            then p_state -> 'program_ids' else '[]'::jsonb end)),
    array[]::text[]);

  v_tags := coalesce(
    (select array_agg(value) from jsonb_array_elements_text(
       case when jsonb_typeof(p_state -> 'interest_tags') = 'array'
            then p_state -> 'interest_tags' else '[]'::jsonb end)),
    array[]::text[]);

  v_courses := case when jsonb_typeof(p_state -> 'courses') = 'array'
                    then p_state -> 'courses' else '[]'::jsonb end;

  -- ---------------------------------------------------------------------------
  -- student_profiles
  -- ---------------------------------------------------------------------------
  -- COALESCE on update rather than a blind overwrite. A student who had already
  -- set a school on another device and then completed onboarding as a guest in
  -- a fresh browser must not have their existing degree context blanked by the
  -- nulls in that guest state. A guest value that IS present still wins — it is
  -- the more recent statement of intent.
  --
  -- Arrays union rather than replace, for the same reason and one more: a
  -- student who declared a minor on the profile page and a major in onboarding
  -- meant to have both.
  insert into student_profiles as target
    (user_id, school, class_year, program_ids, interest_tags)
  values
    (v_user_id, v_school, v_class_year, v_program_ids, v_tags)
  on conflict (user_id) do update set
    school        = coalesce(excluded.school, target.school),
    class_year    = coalesce(excluded.class_year, target.class_year),
    program_ids   = (
      select coalesce(array_agg(distinct id), array[]::text[])
      from unnest(target.program_ids || excluded.program_ids) as id
    ),
    interest_tags = (
      select coalesce(array_agg(distinct tag), array[]::text[])
      from unnest(target.interest_tags || excluded.interest_tags) as tag
    );

  -- ---------------------------------------------------------------------------
  -- student_courses
  -- ---------------------------------------------------------------------------
  -- `course_id` is NOT a foreign key (see 0028's header) precisely so transfer
  -- credit, AP credit and archived terms are storable. Nothing here validates a
  -- course id against `courses`, and nothing here ever should: a row we cannot
  -- resolve is marked "not in our catalog" in the UI and excluded from
  -- similarity and requirement matching, which is a display decision, not a
  -- reason to refuse a student's own record.
  --
  -- On conflict, `liked` coalesces so a re-run cannot erase an opinion the
  -- student gave on another device, while a fresh opinion still overwrites.
  with incoming as (
    select
      nullif(btrim(row_data ->> 'course_id'), '')                as course_id,
      nullif(row_data ->> 'term_label', '')                      as term_label,
      case when jsonb_typeof(row_data -> 'points') = 'number'
           then (row_data ->> 'points')::numeric(4, 2) end       as points,
      case when jsonb_typeof(row_data -> 'liked') = 'boolean'
           then (row_data ->> 'liked')::boolean end              as liked,
      coalesce(nullif(row_data ->> 'source', ''), 'onboarding_guess') as source
    from jsonb_array_elements(v_courses) as row_data
  ),
  -- Distinct on course_id: the table is keyed (user_id, course_id), and
  -- Postgres refuses an ON CONFLICT whose command touches the same row twice.
  -- Without this a duplicate in the payload aborts the WHOLE migration, which
  -- is the one outcome this function exists to prevent.
  deduped as (
    select distinct on (course_id) *
    from incoming
    where course_id is not null
      -- Parenthesised deliberately: `and` binds tighter than `or`, so dropping
      -- these brackets would admit every out-of-range row that happened to have
      -- a course id, and `points numeric(4,2) check (points between 0 and 30)`
      -- would then abort the whole migration on one bad number.
      and (points is null or (points >= 0 and points <= 30))
    order by course_id
  ),
  written as (
    insert into student_courses as target
      (user_id, course_id, term_label, points, liked, source)
    select v_user_id, course_id, term_label, points, liked, source
    from deduped
    where course_id is not null
    on conflict (user_id, course_id) do update set
      term_label = coalesce(excluded.term_label, target.term_label),
      points     = coalesce(excluded.points, target.points),
      liked      = coalesce(excluded.liked, target.liked),
      source     = excluded.source
    returning 1
  )
  select count(*) into v_course_count from written;

  return jsonb_build_object(
    'ok', true,
    'courses', v_course_count,
    'programs', coalesce(array_length(v_program_ids, 1), 0),
    'tags', coalesce(array_length(v_tags, 1), 0)
  );
end;
$$;

comment on function apply_onboarding_state(jsonb) is
  'Flushes a guest''s onboarding state into student_profiles + student_courses in ONE transaction. security invoker, so it can only ever write the caller''s own rows. Idempotent: re-running corrects rather than duplicates.';

revoke all on function apply_onboarding_state(jsonb) from public;
grant execute on function apply_onboarding_state(jsonb) to authenticated;
