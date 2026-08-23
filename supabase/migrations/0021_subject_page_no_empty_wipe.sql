-- -----------------------------------------------------------------------------
-- 0021 — an empty meetings array must not erase meetings from a better source
-- -----------------------------------------------------------------------------
-- `ingest_subject_page` replaced meetings wholesale under this guard:
--
--     if jsonb_typeof(v_section -> 'meetings') = 'array' then
--       delete from meetings where section_id = v_section_id;
--       <insert each element>
--
-- An EMPTY array satisfies `jsonb_typeof(...) = 'array'`, so the delete fired
-- and the insert loop wrote nothing.
--
-- Harmless for 20243/20251, where the Directory of Classes prints day/time/room
-- and the array arrives full. Destructive for 20263/20271, where the Directory
-- publishes no times at all: the parser emits `meetings: []` for every section,
-- so each subject_term re-crawl deleted the patterns the BULLETIN had supplied.
-- Measured: Fall 2026 fell from 2,369 meetings to 1,478 during a single heal
-- pass, and the daily cron would have repeated it indefinitely.
--
-- `meetings` has two writers — ingest_subject_page and ingest_bulletin — and
-- which is authoritative depends on the term. An empty array cannot distinguish
-- "this section has no meetings" from "this source does not publish meetings",
-- and those need opposite handling. Treating empty as "no information" is the
-- only reading that cannot destroy the other source's work, and it is what the
-- never-overwrite-good-data-with-worse-data rule requires.
--
-- The cost, stated plainly: a section that genuinely drops all its meetings
-- keeps its last known pattern instead of going blank. That is a stale row
-- rather than a missing one, it carries a visible provenance stamp, and it is
-- recoverable — whereas the deletion it replaces is not.
--
-- Everything else in this function is byte-identical to 0009. The instructor
-- roster gets the same guard for the same reason.

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
      -- ONLY when the page actually carried meetings. A page that prints no
      -- times at all must not be able to blank a pattern the bulletin
      -- published; see this migration's header.
      if jsonb_typeof(v_section -> 'meetings') = 'array'
         and jsonb_array_length(v_section -> 'meetings') > 0 then
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
      -- Same guard, same reason: an empty roster on a page that does not
      -- print instructors is not evidence the section has none.
      if jsonb_typeof(v_section -> 'instructors') = 'array'
         and jsonb_array_length(v_section -> 'instructors') > 0 then
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
