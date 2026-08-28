-- Backfill course credit values from the section rows that already carry them.
--
-- ── The bug this fixes ──────────────────────────────────────────────────────
--
-- The degree audit reads credits from `courses.points_min` / `points_max`, and
-- 7,708 of 10,582 course rows — 73% of the catalog — had neither. When a
-- student's own row also has no `points` (transcripts and the onboarding guess
-- both leave it null when the catalog cannot supply one), `pointsFor` in
-- `lib/requirements/evaluate.ts` falls through to `facts?.points ?? 0` and the
-- course counts as ZERO credits toward every `points_matching` requirement.
--
-- That is not a hypothetical. Of the 212 real rows in `student_courses`, 11
-- evaluated as zero, and they include the courses a Columbia audit most needs
-- to count: ENGI1102E "The Art of Engineering" (SEAS first-year requirement,
-- 4 points) and AFCV1020UN "African Civilization" (Global Core, 4 points).
--
-- ── Why sections are the right source ───────────────────────────────────────
--
-- The credits were never missing from the database — only from the table the
-- audit reads. `sections.min_unit` / `max_unit` is the registrar's own credit
-- statement for a specific offering, and every one of the 7,708 gap courses
-- has at least one section carrying it. The bulletin parser fills
-- `courses.points_*` when the Bulletin prints a points string in prose; these
-- are the courses where it did not, and the directory listing did.
--
-- ── What this writes ────────────────────────────────────────────────────────
--
-- 6,826 courses get a non-zero credit value. 882 resolve to a genuine 0.00 --
-- zero-unit discussion and lab components like SCNC1100CC "Frontiers of
-- Science-Disc", whose credit sits on the parent lecture. Writing the 0
-- explicitly is the point: it is the difference between "we know this is
-- zero-credit" and "we have no idea", and only the second should ever be a
-- reason to distrust a total.
--
-- `min` over `min_unit` and `max` over `max_unit` preserves variable-credit
-- courses as a range rather than collapsing them to one number, matching what
-- the bulletin parser writes for the courses it does cover.
--
-- Idempotent and additive: the WHERE clause touches only rows where BOTH
-- columns are null, so a course the Bulletin already described is never
-- overwritten by a section's number, and re-running changes nothing.

update courses c
set points_min = f.new_min,
    points_max = f.new_max,
    updated_at = now()
from (
  select s.course_id,
         min(s.min_unit) filter (where s.min_unit is not null) as new_min,
         max(s.max_unit) filter (where s.max_unit is not null) as new_max
  from sections s
  group by s.course_id
) as f
where f.course_id = c.course_id
  and c.points_min is null
  and c.points_max is null
  and (f.new_min is not null or f.new_max is not null);
