-- ---------------------------------------------------------------------------
-- 0015 — pick the historical pattern from the same SEASON first.
--
-- 0014 ranked candidate source terms by recency alone. For a Fall 2026 section
-- that picks Spring 2025 (20251) over Fall 2024 (20243), because term codes
-- sort chronologically and Spring 2025 is simply later. It is the wrong
-- choice twice over:
--
--   · A course that runs in both terms is often scheduled differently in each
--     — a fall MWF lecture becomes a spring TR seminar, and the room follows
--     the season's timetable, not the most recent one.
--
--   · A great many courses run in one season only. For a fall-only course,
--     recency-first finds nothing at all in a spring source term, so the
--     section is left with no pattern even though we hold a perfectly good
--     fall one.
--
-- So the ranking becomes: same season first, then most recent. The season is
-- the term code's last digit (1 Spring, 2 Summer, 3 Fall), which is already
-- how `terms.term_code` is constructed and checked in 0001.
--
-- Recency still breaks the tie inside a season, and a cross-season match is
-- still returned when it is all we have — with its own `source_term`, so a
-- reader can see for themselves that the pattern came from a different part of
-- the year and weigh it accordingly. The product rule is unchanged: the time
-- never travels without the evidence.
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
           row_number() over (
             partition by w.section_id
             order by
               -- Same season wins outright; recency only breaks ties.
               (right(past.term_code, 1) = right(w.term_code, 1)) desc,
               past.term_code desc
           ) as rank
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
   where c.rank = 1
   order by c.target_id, m.weekday, m.start_minute;
$$;

revoke all on function typical_meetings(text[]) from public;
grant execute on function typical_meetings(text[]) to anon, authenticated, service_role;

comment on function typical_meetings(text[]) is
  'Historical meeting pattern for sections that have none, preferring the same season and then the most recent term. Always returns source_term alongside the times: the caller cannot render the time without the provenance.';
