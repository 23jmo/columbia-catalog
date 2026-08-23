-- -----------------------------------------------------------------------------
-- 0020 — ingest_bulletin must file a row under the term the row came from
-- -----------------------------------------------------------------------------
-- The 0009 version resolved a section like this:
--
--     where s.course_id = (v_row ->> 'courseCode')
--       and s.section_code = (v_row ->> 'sectionCode')
--     order by s.term_code desc
--     limit 1;
--
-- The row's own term was never consulted. A bulletin department page mixes
-- terms in one document — `bulletin-cs.html` carries Fall 2026 and Spring 2026
-- tables side by side — so for any course+section key that exists in more than
-- one term (7,206 of them here) the lookup picked whichever term sorted highest
-- and then DELETED that section's meetings and wrote the other term's pattern
-- into it. A Spring listing arrived wearing a Fall label, and because the write
-- also filled building_name and room, the campus map pinned a room the class
-- does not meet in. That is worse than an empty map: it is confidently wrong.
--
-- Why the term was available all along, and why nobody used it:
-- `parseBulletinDepartment` returns `ParsedBulletinRowWithTerm`, which carries
-- the term resolved from each schedule table's "Fall 2026: COMS W4113" header.
-- But `ParserRegistry.parseBulletinPage` DECLARED its return as
-- `ParsedBulletinRow[]` — a type with no term field. The value was in the JSON
-- at runtime and invisible in the types, so the SQL was written as though the
-- term simply did not exist. The companion commit widens that declaration.
--
-- Matching stays on (course_id, section_code) rather than call number for the
-- reason 0009 gave — the bulletin often omits the call number and sometimes
-- prints a stale one — with term_code added as the third key.

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
  v_term    text;
begin
  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    if jsonb_typeof(v_row -> 'meetings') <> 'array'
       or jsonb_array_length(v_row -> 'meetings') = 0 then
      continue;  -- a bulletin row with no times has nothing we need
    end if;

    v_term := nullif(btrim(coalesce(v_row ->> 'termCode', '')), '');

    -- A row whose table header we could not read is a row we cannot file. The
    -- old code's fallback — guess the newest term — is exactly the bug this
    -- migration exists to remove, so there is deliberately no fallback here.
    if v_term is null then
      continue;
    end if;

    -- Only ever fills sections that already exist. The bulletin must not be
    -- able to invent a section the registrar is not offering.
    select s.section_id into v_sid
      from sections s
     where s.course_id = (v_row ->> 'courseCode')
       and s.section_code = (v_row ->> 'sectionCode')
       and s.term_code = v_term;

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
