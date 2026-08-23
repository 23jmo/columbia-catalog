-- ---------------------------------------------------------------------------
-- 0016 — course prose from the bulletin
-- ---------------------------------------------------------------------------
-- The Directory of Classes publishes a course as a title and a number: no
-- description, no credit range, no prerequisites. Before this migration all
-- three columns were null for all 7,906 courses, which made `description` a
-- dead search field and left every course page with nothing to read.
--
-- The bulletin department pages we already crawl carry all three, in the
-- courseblock above each schedule table. `parseBulletinCourseBlocks` reads
-- them; this writes them.
--
-- ── Fill, never overwrite ──────────────────────────────────────────────────
--
-- Every assignment below is guarded by `is null` on the existing value. That is
-- the house rule (never overwrite good data with worse data) and here it has a
-- specific target: `title`. The bulletin sets many course names in caps —
-- "UNDERGRAD PROJECTS IN COMPUTER SCIENCE" against the directory's "Undergrad
-- Projects in Computer Science" — so an unguarded update would degrade a title
-- on every crawl, and the damage would compound because the next crawl would
-- see nothing wrong with what it found.
--
-- The same guard makes this function safely re-runnable: a second pass over the
-- same page writes nothing and returns 0.
--
-- ── Never invents a course ─────────────────────────────────────────────────
--
-- The update matches an existing `course_id` and does nothing when there is no
-- match. A bulletin page lists courses that are not offered in any term we
-- carry, and the SEAS curriculum "track" markers (COMS E0001, 0.00 points)
-- parse as courses but are not ones. Both are correctly dropped on the floor.

create or replace function ingest_bulletin_courses(
  p_department  text,
  p_courses     jsonb,
  p_observed_at timestamptz default now()
) returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_course  jsonb;
  v_id      text;
  v_written integer := 0;
  v_touched integer;
begin
  for v_course in select * from jsonb_array_elements(coalesce(p_courses, '[]'::jsonb))
  loop
    v_id := nullif(btrim(v_course ->> 'courseCode'), '');
    continue when v_id is null;

    update courses c
       set description = coalesce(
             c.description,
             nullif(btrim(v_course ->> 'description'), '')
           ),
           prerequisite_text = coalesce(
             c.prerequisite_text,
             nullif(btrim(v_course ->> 'prerequisiteText'), '')
           ),
           points_min = coalesce(c.points_min, (v_course ->> 'pointsMin')::numeric),
           points_max = coalesce(c.points_max, (v_course ->> 'pointsMax')::numeric),
           department = coalesce(c.department, nullif(btrim(p_department), '')),
           updated_at = p_observed_at
     where c.course_id = v_id
       -- Only report a write when something actually changed. Without this the
       -- crawler's record count would say "127 records" on every re-crawl of a
       -- page that had already been fully absorbed.
       and (
            (c.description is null       and nullif(btrim(v_course ->> 'description'), '') is not null)
         or (c.prerequisite_text is null and nullif(btrim(v_course ->> 'prerequisiteText'), '') is not null)
         or (c.points_min is null        and (v_course ->> 'pointsMin') is not null)
         or (c.points_max is null        and (v_course ->> 'pointsMax') is not null)
         or (c.department is null        and nullif(btrim(p_department), '') is not null)
       );

    get diagnostics v_touched = row_count;
    v_written := v_written + v_touched;
  end loop;

  return v_written;
end;
$$;

revoke all on function ingest_bulletin_courses(text, jsonb, timestamptz) from public;
grant execute on function ingest_bulletin_courses(text, jsonb, timestamptz) to service_role;
