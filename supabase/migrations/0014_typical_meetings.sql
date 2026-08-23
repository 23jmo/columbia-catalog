-- ---------------------------------------------------------------------------
-- 0014 — historical meeting times, labelled as historical.
--
-- Columbia stopped publishing meeting days, times and rooms in the public
-- Directory of Classes after Spring 2025; they now appear only in Vergil,
-- behind a UNI login (.plans/BLOCKERS.md #5). Every Fall 2026 section therefore
-- ingests with zero meetings, which leaves the schedule grid with nothing to
-- place, conflict detection with nothing to compare, and the commute warnings
-- with no rooms to route between.
--
-- The catalog does still hold real meeting times for Spring 2025 and earlier.
-- A course that met TR 11:40-12:55 last time it ran will very probably meet at
-- a similar time again — but "very probably" is not a fact, and the product
-- rule is that a guess is never presented as one.
--
-- So this function returns the most recent term in which the same course and
-- section code actually met, ALONG WITH the term it came from. The caller is
-- structurally unable to render the time without also having the evidence:
-- there is no field here that says "this section meets at 11:40". It says
-- "COMS 4118 section 001 met at 11:40 in Spring 2025".
--
-- Matching is course + section code, not course alone. Section 001 and section
-- 002 of the same course are different classes at different times, and
-- collapsing them would produce a confident average of two unrelated schedules.
-- ---------------------------------------------------------------------------

create or replace function typical_meetings(p_section_ids text[])
returns table (
  section_id      text,
  source_term     text,
  source_section  text,
  weekday         weekday_code,
  start_minute    integer,
  end_minute      integer,
  building_id     text,
  building_name   text,
  room            text
)
language sql
stable
security definer
set search_path = public
as $$
  with wanted as (
    select s.section_id, s.course_id, s.section_code, s.term_code
      from sections s
     where s.section_id = any (p_section_ids)
       -- Only sections that genuinely have no times of their own. A section
       -- with real meetings must never be overridden by a historical guess.
       and not exists (select 1 from meetings m where m.section_id = s.section_id)
  ),
  candidate as (
    select w.section_id as target_id,
           past.section_id as source_id,
           past.term_code  as source_term,
           past.section_code as source_section,
           -- Term codes sort chronologically as text: YYYY + season digit,
           -- and 1 < 2 < 3 matches Spring < Summer < Fall within a year.
           row_number() over (
             partition by w.section_id order by past.term_code desc
           ) as recency
      from wanted w
      join sections past
        on past.course_id = w.course_id
       and past.section_code = w.section_code
       and past.term_code < w.term_code
     where exists (select 1 from meetings m where m.section_id = past.section_id)
  )
  select c.target_id,
         c.source_term,
         c.source_section,
         m.weekday,
         m.start_minute,
         m.end_minute,
         m.building_id,
         m.building_name,
         m.room
    from candidate c
    join meetings m on m.section_id = c.source_id
   where c.recency = 1
   order by c.target_id, m.weekday, m.start_minute;
$$;

revoke all on function typical_meetings(text[]) from public;
grant execute on function typical_meetings(text[]) to anon, authenticated, service_role;

comment on function typical_meetings(text[]) is
  'Most recent historical meeting pattern for sections that have none. Always returns source_term alongside the times: the caller cannot render the time without the provenance.';
