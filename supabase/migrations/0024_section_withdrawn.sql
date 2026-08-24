-- ---------------------------------------------------------------------------
-- 0024 — withdrawn sections
--
-- When Columbia pulls a section, the Directory does not 404. It serves HTTP
-- 200 and a 474-byte page titled "Section Removed". `parse_section_detail`
-- correctly refuses to invent an identity from that and throws, so the crawler
-- recorded a parse error and backed the job off — retrying, forever, a page
-- whose answer will never change. Meanwhile the section stayed in `sections`
-- and kept rendering: a student could find it, open it, and plan around it.
--
-- ── Why a column and not a delete ─────────────────────────────────────────
--
-- Deleting is the obvious move and it is wrong here. `watches` and plan items
-- reference `sections`, and a student who is watching a section that gets
-- pulled deserves to be told, not to have the row disappear from under them
-- and take their watch with it. Keeping the row and stamping it lets every
-- read decide for itself: search and the catalog filter it out, the course
-- page shows it struck through, and a watcher still has something to look at.
--
-- The column is nullable with no default because NULL is the honest value for
-- the other ~9,500 sections: not "we checked and it is fine", but "this
-- question has never been asked about this row".
-- ---------------------------------------------------------------------------

alter table sections
  add column if not exists withdrawn_at timestamptz;

comment on column sections.withdrawn_at is
  'When Columbia stopped publishing this section (the Directory served a '
  '"Section Removed" tombstone). NULL means still published. Rows are kept '
  'rather than deleted so watches and plan items do not vanish under a student.';

-- Every catalog read filters on `withdrawn_at is null`, and withdrawn rows are
-- a rounding error against the table, so a partial index on the live majority
-- would be worthless. This one serves the opposite question — "what has been
-- pulled?" — which is what an operator actually asks.
create index if not exists idx_sections_withdrawn
  on sections (withdrawn_at desc)
  where withdrawn_at is not null;

-- ---------------------------------------------------------------------------
-- mark_section_withdrawn
--
-- Idempotent, and deliberately does NOT refresh the timestamp on a section
-- already marked: the value that matters is when the section was FIRST seen
-- gone, and re-stamping it on every subsequent crawl would slowly erase that.
--
-- Returns the number of rows actually changed so the caller can tell a real
-- withdrawal from a tombstone for a section we never had a row for — which is
-- a normal outcome, not an error. Those exist: a section can be pulled between
-- the subject page listing it and the detail crawl reaching it.
-- ---------------------------------------------------------------------------
create or replace function mark_section_withdrawn(
  p_section_id text,
  p_at timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update sections
     set withdrawn_at = p_at,
         updated_at   = now()
   where section_id = p_section_id
     and withdrawn_at is null;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function mark_section_withdrawn(text, timestamptz) from public;
grant execute on function mark_section_withdrawn(text, timestamptz) to service_role;
