-- ---------------------------------------------------------------------------
-- 0011 — course qualifiers are not single letters.
--
-- `courses.qualifier` was constrained to `^[A-Z]$`, which encodes the old
-- Columbia course code shape (COMS W3157, MATH V1201). The registrar moved to
-- two-letter school prefixes years ago and the directory prints both, so a
-- sample of eight subjects for Fall 2026 yields:
--
--   UN 133   N 84   BC 76   A 67   GR 54   GU 53   B 10   PS 6   CC 1   GS 1
--
-- Two-letter qualifiers are 64% of that sample. The constraint was rejecting
-- the majority of the catalog: `ingest_subject_page` is one transaction, so a
-- single COMSBC3997 row aborted the entire COMS subject page and the crawl
-- recorded a fetch that produced nothing.
--
-- Widened to 1–3 characters rather than dropped. The point of the check is to
-- catch a parser that has started splitting the course code in the wrong
-- place — "COMSBC3997" mis-split yields a qualifier like "BC3997", which this
-- still rejects. An unbounded text column would accept it silently, and a
-- course_id built from it would be wrong forever.
-- ---------------------------------------------------------------------------

alter table courses drop constraint if exists courses_qualifier_check;
alter table courses add constraint courses_qualifier_check
  check (qualifier is null or qualifier ~ '^[A-Z]{1,3}$');
