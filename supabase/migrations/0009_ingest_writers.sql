-- =============================================================================
-- 0009 — transactional ingest writers
-- =============================================================================
-- The `CatalogWriter` contract says writes "are expected to be transactional".
-- Through PostgREST they cannot be: upserting subjects, then courses, then
-- sections, then meetings is four independent requests, and a failure on the
-- third leaves a subject page half-applied — sections pointing at courses whose
-- titles were updated, meetings belonging to a previous parse. That is precisely
-- the "overwrite good data with worse data" failure spec §10 forbids, arrived at
-- through the back door.
--
-- So each ingest kind is one function taking one JSONB document. A plpgsql
-- function body is a single transaction: it commits whole or not at all.
--
-- The payloads mirror the `Parsed*` types in lib/types.ts exactly, camelCase
-- included, so `lib/db/catalog-writer.ts` passes parser output through without
-- a translation layer that could drift from it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ensure_term — terms are an FK target, so they must exist before sections
-- -----------------------------------------------------------------------------
-- Derived from the code rather than seeded, because the crawler discovers terms
-- from directory URLs and a missing row would fail the whole page ingest for a
-- reason that has nothing to do with the data.

create or replace function ensure_term(p_term_code text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_year   integer;
  v_digit  text;
  v_season season;
begin
  if p_term_code is null or p_term_code !~ '^[0-9]{4}[123]$' then
    raise exception 'bad term code %', p_term_code using errcode = 'invalid_parameter_value';
  end if;

  v_year  := substring(p_term_code from 1 for 4)::integer;
  v_digit := substring(p_term_code from 5 for 1);
  v_season := case v_digit
                when '1' then 'Spring'::season
                when '2' then 'Summer'::season
                else 'Fall'::season
              end;

  insert into terms (term_code, season, year, directory_label, label)
  values (p_term_code, v_season, v_year,
          v_season::text || v_year::text,
          v_season::text || ' ' || v_year::text)
  on conflict (term_code) do nothing;

  return p_term_code;
end;
$$;

revoke all on function ensure_term(text) from public;
grant execute on function ensure_term(text) to service_role;

-- -----------------------------------------------------------------------------
-- upsert_instructor — resolve a printed name to a stable id
-- -----------------------------------------------------------------------------
-- The directory prints names, not UNIs. `normalized_name` is a stored generated
-- column with a unique index, so it can carry the ON CONFLICT target directly.

create or replace function upsert_instructor(p_full_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_full_name is null or btrim(p_full_name) = '' then
    return null;
  end if;

  insert into instructors (full_name)
  values (btrim(p_full_name))
  on conflict (normalized_name) do update
     set full_name = coalesce(instructors.full_name, excluded.full_name)
  returning instructor_id into v_id;

  return v_id;
end;
$$;

revoke all on function upsert_instructor(text) from public;
grant execute on function upsert_instructor(text) to service_role;

-- -----------------------------------------------------------------------------
-- resolve_building — best-effort name -> building_id
-- -----------------------------------------------------------------------------
-- Meetings keep the printed `building_name` unconditionally and additionally
-- point at `buildings` when a match exists. Commute warnings need the geocode;
-- an unmatched name must still render the room, so this never raises.

create or replace function resolve_building(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select b.building_id
    from buildings b
   where p_name is not null
     and lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g'))) =
         lower(btrim(regexp_replace(b.name, '\s+', ' ', 'g')))
   limit 1;
$$;

revoke all on function resolve_building(text) from public;
grant execute on function resolve_building(text) to service_role;

-- -----------------------------------------------------------------------------
-- ingest_subject_page — the main workload
-- -----------------------------------------------------------------------------
-- One subject-term directory page: every section for a subject in one request,
-- enrollment counts included (spec §10). Returns the number of sections written.
--
-- Payload shape (ParsedSubjectPage):
--   { subjectCode, termCode, courses: [ { courseId, subjectCode, number,
--     qualifier, title, sections: [ ParsedSection ] } ] }

create or replace function ingest_subject_page(
  p_payload     jsonb,
  p_observed_at timestamptz default now()
) returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_subject   text := upper(btrim(p_payload ->> 'subjectCode'));
  v_term      text := p_payload ->> 'termCode';
  v_course    jsonb;
  v_section   jsonb;
  v_section_id text;
  v_written   integer := 0;
  v_meeting   jsonb;
  v_instructor text;
  v_position  integer;
  v_iid       uuid;
begin
  if v_subject is null or v_subject = '' then
    raise exception 'ingest_subject_page: missing subjectCode'
      using errcode = 'invalid_parameter_value';
  end if;

  perform ensure_term(v_term);

  -- The subject index supplies the real name; a page ingest must not overwrite
  -- it with the code, so the name is only defaulted on first insert.
  insert into subjects (subject_code, subject_name)
  values (v_subject, v_subject)
  on conflict (subject_code) do nothing;

  for v_course in select * from jsonb_array_elements(coalesce(p_payload -> 'courses', '[]'::jsonb))
  loop
    insert into courses (course_id, subject_code, course_number, qualifier, title)
    values (
      v_course ->> 'courseId',
      v_subject,
      coalesce((v_course ->> 'number')::integer, 0),
      nullif(v_course ->> 'qualifier', ''),
      coalesce(nullif(btrim(v_course ->> 'title'), ''), v_course ->> 'courseId')
    )
    on conflict (course_id) do update
       -- Title only: the subject page does not carry descriptions or
       -- prerequisites, and blanking them here would undo the section-detail
       -- and bulletin ingests that do.
       set title = coalesce(nullif(btrim(excluded.title), ''), courses.title);

    for v_section in select * from jsonb_array_elements(coalesce(v_course -> 'sections', '[]'::jsonb))
    loop
      v_section_id := v_section ->> 'sectionId';
      if v_section_id is null or btrim(coalesce(v_section ->> 'callNumber', '')) = '' then
        continue;  -- unregisterable row; not an error, just not a section
      end if;

      insert into sections (
        section_id, course_id, term_code, subject_code,
        call_number, section_code,
        min_unit, max_unit,
        enrollment_count, enrollment_cap, status,
        source_as_of, last_seen_at, detail_url
      ) values (
        v_section_id,
        v_section ->> 'courseId',
        v_term,
        v_subject,
        v_section ->> 'callNumber',
        v_section ->> 'sectionCode',
        (v_section ->> 'pointsMin')::numeric,
        (v_section ->> 'pointsMax')::numeric,
        (v_section ->> 'enrollmentCount')::integer,
        (v_section ->> 'enrollmentCap')::integer,
        coalesce(nullif(v_section ->> 'status', '')::enrollment_status, 'unknown'),
        (v_section ->> 'sourceAsOf')::timestamptz,
        p_observed_at,
        nullif(v_section ->> 'detailUrl', '')
      )
      on conflict (section_id) do update
         set call_number      = excluded.call_number,
             min_unit         = coalesce(excluded.min_unit, sections.min_unit),
             max_unit         = coalesce(excluded.max_unit, sections.max_unit),
             enrollment_count = excluded.enrollment_count,
             enrollment_cap   = excluded.enrollment_cap,
             status           = excluded.status,
             source_as_of     = coalesce(excluded.source_as_of, sections.source_as_of),
             last_seen_at     = excluded.last_seen_at,
             detail_url       = coalesce(excluded.detail_url, sections.detail_url);

      -- Meetings: replace wholesale. A section that moved from Mudd 833 to
      -- Hamilton 602 must not end up listed in both, and the directory page is
      -- authoritative for the set as a whole, not row by row.
      if jsonb_typeof(v_section -> 'meetings') = 'array' then
        delete from meetings where section_id = v_section_id;

        for v_meeting in select * from jsonb_array_elements(v_section -> 'meetings')
        loop
          insert into meetings (
            section_id, weekday, start_minute, end_minute, building_id, building_name, room
          ) values (
            v_section_id,
            (v_meeting ->> 'weekday')::weekday_code,
            (v_meeting ->> 'startMinute')::integer,
            (v_meeting ->> 'endMinute')::integer,
            resolve_building(v_meeting ->> 'buildingName'),
            nullif(v_meeting ->> 'buildingName', ''),
            nullif(v_meeting ->> 'room', '')
          )
          on conflict do nothing;
        end loop;
      end if;

      -- Instructors: same replace-wholesale reasoning as meetings.
      if jsonb_typeof(v_section -> 'instructors') = 'array' then
        delete from section_instructors where section_id = v_section_id;
        v_position := 0;

        for v_instructor in
          select value #>> '{}' from jsonb_array_elements(v_section -> 'instructors')
        loop
          v_iid := upsert_instructor(v_instructor);
          if v_iid is not null then
            insert into section_instructors (section_id, instructor_id, position)
            values (v_section_id, v_iid, v_position)
            on conflict (section_id, instructor_id) do nothing;
            v_position := v_position + 1;
          end if;
        end loop;
      end if;

      v_written := v_written + 1;
    end loop;
  end loop;

  return v_written;
end;
$$;

comment on function ingest_subject_page is
  'Applies one parsed subject-term directory page in a single transaction. Returns sections written.';

revoke all on function ingest_subject_page(jsonb, timestamptz) from public;
grant execute on function ingest_subject_page(jsonb, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- ingest_section_detail — the fields only the per-section page carries
-- -----------------------------------------------------------------------------
-- Description, prerequisites and department belong to the COURSE even though
-- they are printed on a section page. Everything else is section-scoped.

create or replace function ingest_section_detail(
  p_payload     jsonb,
  p_observed_at timestamptz default now()
) returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_section_id text := p_payload ->> 'sectionId';
  v_course_id  text := p_payload ->> 'courseId';
begin
  if v_section_id is null then
    raise exception 'ingest_section_detail: missing sectionId'
      using errcode = 'invalid_parameter_value';
  end if;

  -- coalesce throughout: a detail page that failed to print a description must
  -- not erase the one we already hold.
  update courses c
     set description       = coalesce(nullif(btrim(p_payload ->> 'description'), ''), c.description),
         prerequisite_text = coalesce(nullif(btrim(p_payload ->> 'prerequisiteText'), ''), c.prerequisite_text),
         department        = coalesce(nullif(btrim(p_payload ->> 'department'), ''), c.department)
   where c.course_id = v_course_id;

  update sections s
     set component             = coalesce(nullif(p_payload ->> 'component', ''), s.component),
         method_of_instruction = coalesce(nullif(p_payload ->> 'methodOfInstruction', ''), s.method_of_instruction),
         grading_mode          = coalesce(nullif(p_payload ->> 'gradingMode', ''), s.grading_mode),
         note                  = coalesce(nullif(p_payload ->> 'note', ''), s.note),
         open_to               = coalesce(nullif(p_payload ->> 'openTo', ''), s.open_to),
         enrollment_count      = coalesce((p_payload ->> 'enrollmentCount')::integer, s.enrollment_count),
         enrollment_cap        = coalesce((p_payload ->> 'enrollmentCap')::integer, s.enrollment_cap),
         status                = coalesce(nullif(p_payload ->> 'status', '')::enrollment_status, s.status),
         source_as_of          = coalesce((p_payload ->> 'sourceAsOf')::timestamptz, s.source_as_of),
         last_seen_at          = p_observed_at
   where s.section_id = v_section_id;

  return case when found then 1 else 0 end;
end;
$$;

revoke all on function ingest_section_detail(jsonb, timestamptz) from public;
grant execute on function ingest_section_detail(jsonb, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- ingest_bulletin — meeting times the Directory of Classes does not print
-- -----------------------------------------------------------------------------
-- Matched on (course_id, section_code) rather than call number: the bulletin
-- frequently omits the call number, and when it prints one it is occasionally a
-- stale value from a prior term.

create or replace function ingest_bulletin(
  p_department  text,
  p_rows        jsonb,
  p_observed_at timestamptz default now()
) returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row     jsonb;
  v_meeting jsonb;
  v_written integer := 0;
  v_sid     text;
begin
  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    if jsonb_typeof(v_row -> 'meetings') <> 'array'
       or jsonb_array_length(v_row -> 'meetings') = 0 then
      continue;  -- a bulletin row with no times has nothing we need
    end if;

    -- Only ever fills sections that already exist. The bulletin must not be
    -- able to invent a section the registrar is not offering.
    select s.section_id into v_sid
      from sections s
     where s.course_id = (v_row ->> 'courseCode')
       and s.section_code = (v_row ->> 'sectionCode')
     order by s.term_code desc
     limit 1;

    if v_sid is null then
      continue;
    end if;

    delete from meetings where section_id = v_sid;

    for v_meeting in select * from jsonb_array_elements(v_row -> 'meetings')
    loop
      insert into meetings (
        section_id, weekday, start_minute, end_minute, building_id, building_name, room
      ) values (
        v_sid,
        (v_meeting ->> 'weekday')::weekday_code,
        (v_meeting ->> 'startMinute')::integer,
        (v_meeting ->> 'endMinute')::integer,
        resolve_building(v_meeting ->> 'buildingName'),
        nullif(v_meeting ->> 'buildingName', ''),
        nullif(v_meeting ->> 'room', '')
      )
      on conflict do nothing;
    end loop;

    update sections set last_seen_at = p_observed_at where section_id = v_sid;
    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$$;

revoke all on function ingest_bulletin(text, jsonb, timestamptz) from public;
grant execute on function ingest_bulletin(text, jsonb, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- ingest_subject_index — the ~900 subjects and their real names
-- -----------------------------------------------------------------------------

create or replace function ingest_subject_index(p_payload jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_entry   jsonb;
  v_written integer := 0;
  v_code    text;
begin
  for v_entry in select * from jsonb_array_elements(coalesce(p_payload -> 'subjects', '[]'::jsonb))
  loop
    v_code := upper(btrim(v_entry ->> 'subjectCode'));
    continue when v_code is null or v_code !~ '^[A-Z]{2,6}$';

    insert into subjects (subject_code, subject_name, school)
    values (
      v_code,
      coalesce(nullif(btrim(v_entry ->> 'subjectName'), ''), v_code),
      nullif(btrim(v_entry ->> 'school'), '')
    )
    on conflict (subject_code) do update
       set subject_name = coalesce(nullif(btrim(excluded.subject_name), ''), subjects.subject_name),
           school       = coalesce(excluded.school, subjects.school);

    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$$;

revoke all on function ingest_subject_index(jsonb) from public;
grant execute on function ingest_subject_index(jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- ingest_academic_calendar — what makes the seat-history line mean anything
-- -----------------------------------------------------------------------------
-- Also the producer for the registration windows that drive the 30s tier
-- (spec §10, "Registration-window detection").

create or replace function ingest_academic_calendar(p_payload jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_term    text := p_payload ->> 'termCode';
  v_entry   jsonb;
  v_written integer := 0;
begin
  if v_term is null then
    return 0;
  end if;
  perform ensure_term(v_term);

  for v_entry in select * from jsonb_array_elements(coalesce(p_payload -> 'milestones', '[]'::jsonb))
  loop
    -- `registration_milestone_kind` has no catch-all member, and inventing one
    -- would let a mis-parsed calendar row become a permanent annotation on the
    -- seat-history chart. An unrecognised kind is skipped instead.
    continue when (v_entry ->> 'kind') is null
      or (v_entry ->> 'kind') not in
         ('registration_open', 'appointment_window', 'add_drop_deadline', 'term_start');
    continue when (v_entry ->> 'occursAt') is null;

    insert into registration_milestones (term_code, kind, label, occurs_at, ends_at, audience, source_url)
    values (
      v_term,
      (v_entry ->> 'kind')::registration_milestone_kind,
      coalesce(nullif(btrim(v_entry ->> 'label'), ''), 'Milestone'),
      (v_entry ->> 'occursAt')::timestamptz,
      (v_entry ->> 'endsAt')::timestamptz,
      nullif(btrim(v_entry ->> 'audience'), ''),
      nullif(btrim(v_entry ->> 'sourceUrl'), '')
    )
    on conflict (term_code, kind, label) do update
       set occurs_at  = excluded.occurs_at,
           ends_at    = coalesce(excluded.ends_at, registration_milestones.ends_at),
           audience   = coalesce(excluded.audience, registration_milestones.audience),
           source_url = coalesce(excluded.source_url, registration_milestones.source_url);

    v_written := v_written + 1;
  end loop;

  return v_written;
end;
$$;

revoke all on function ingest_academic_calendar(jsonb) from public;
grant execute on function ingest_academic_calendar(jsonb) to service_role;
