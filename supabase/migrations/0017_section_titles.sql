-- =============================================================================
-- 0017_section_titles.sql — the title a section actually has
--
-- The directory prints one title per COURSE in the `<th>` that opens each
-- block, and a second title per SECTION in the `<h1>` inside that row's
-- `div.course-details`. We were reading only the first.
--
-- That is not a cosmetic gap. In Fall 2026, COMS E6998 has 20 sections and 20
-- distinct titles — "LLM BASED GENERATIVE AI", "HIGH PERF MACH LEARNING", and
-- eighteen more. They are twenty different classes. Storing only the course
-- title made every one of them render, serialise, search and answer over MCP
-- as the same thing, which is a wrong answer rather than a missing one.
--
-- Measured over COMS Fall 2026 (41 courses, 112 section rows): 7 courses (17%)
-- have sections that disagree on title; the other 34 repeat one string across
-- every row.
--
-- ── Stored raw, including when it repeats the course title ─────────────────
--
-- Most sections' `<h1>` simply echoes the course title, and it is tempting to
-- null those out here. We do not. The database records what the page said; the
-- wire format (`projectSection` in lib/catalog-list-types.ts) is what drops a
-- title that merely restates the course, so `title` on the client means
-- exactly "this section is not interchangeable with its siblings". Deciding
-- that at ingest would bake a presentation rule into the archive and lose the
-- ability to tell "the page said nothing" from "the page repeated itself".
--
-- Whitespace is trimmed and nothing else. Case and internal spacing are the
-- source's, because the comparison that matters folds both anyway.
--
-- ZERO new fetches: this reads a field already present on the subject-index
-- pages the crawler visits every sweep. The `section_detail` job kind stays
-- parked.
-- =============================================================================

alter table sections add column if not exists title text;

comment on column sections.title is
  'The section''s own title from the directory row''s <h1>. Often equals the course title; stored faithfully either way. Consumers suppress the echo, ingest does not.';

-- -----------------------------------------------------------------------------
-- ingest_subject_page — unchanged except for the two title lines
-- -----------------------------------------------------------------------------
-- Replaced wholesale rather than patched, because a plpgsql function has no
-- partial replacement. The only differences from 0009 are `title` in the
-- insert column list, its value, and the coalesce in the update.

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
        call_number, section_code, title,
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
        nullif(btrim(coalesce(v_section ->> 'title', '')), ''),
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
             -- Same rule as every other field the directory may omit on a
             -- given sweep: a page that stops printing a title must not erase
             -- one we already hold.
             title            = coalesce(excluded.title, sections.title),
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
  'Applies one parsed subject-term directory page in a single transaction, including per-section titles. Returns sections written.';

revoke all on function ingest_subject_page(jsonb, timestamptz) from public;
grant execute on function ingest_subject_page(jsonb, timestamptz) to service_role;
