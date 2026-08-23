-- =============================================================================
-- 0018_courses_missing_description.sql — find the prose gap
--
-- The bulletin backfill (0016) fills description, points and prerequisites,
-- but `bulletin.columbia.edu` only publishes course listings for Columbia
-- College, Engineering and Barnard. Its sitemap has no department pages for
-- Law, Business, Nursing, Social Work, Public Health, SPS, the Arts or GSAPP.
-- Those schools account for roughly 5,000 courses that have a title, a call
-- number, and nothing a reader could use to choose.
--
-- Every one of those descriptions is printed on the section detail page at
-- doc.sis.columbia.edu, alongside the four section columns we have never
-- written (component, method of instruction, grading mode, open-to).
--
-- This function names the cheapest set of pages that would close the gap: ONE
-- section per course, not one per section. The description belongs to the
-- course, so fetching a second section of the same course spends a request to
-- learn something already known — ~17,000 fetches become ~5,000.
--
-- `distinct on (course_id)` with `term_code desc` picks the most recent
-- offering, because a course's description is rewritten over the years and the
-- newest page is the one that describes what will actually be taught.
-- =============================================================================

create or replace function courses_missing_description(p_limit integer default 5000)
returns table (
  course_id  text,
  section_id text,
  term_code  text,
  detail_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (s.course_id)
         s.course_id,
         s.section_id,
         s.term_code,
         s.detail_url
    from sections s
    join courses c on c.course_id = s.course_id
   where c.description is null
     -- A section with no detail_url has no page to fetch. Returning it would
     -- enqueue a job with no URL, which the fetcher would reject one at a time.
     and s.detail_url is not null
   order by s.course_id, s.term_code desc, s.section_code
   limit greatest(1, p_limit);
$$;

comment on function courses_missing_description is
  'One fetchable section detail page per course that has no description yet. Newest term wins.';

revoke all on function courses_missing_description(integer) from public;
grant execute on function courses_missing_description(integer) to service_role;
