-- =============================================================================
-- 0023_bookmark_proposals.sql — agents may propose bookmarks, not create them
--
-- 0019 built the proposal queue for one thing: changes to a PLAN. Saving a
-- class is the second kind of write an agent can now suggest, and it goes
-- through the same door for the same reason — "agents propose, they do not
-- act" is a property of the write path, not of the plans table, and a bookmark
-- an agent created without being asked is exactly as unwelcome as a section it
-- silently added to your Tuesday.
--
-- Two changes, both narrowing rather than widening:
--
--   · `plan_id` becomes nullable. A bookmark proposal has no plan — inventing
--     a sentinel plan id so a NOT NULL column stays satisfied would put a
--     value in the database that means "ignore me", which is how a later
--     query ends up joining on nothing.
--
--   · `kind` gains two values, and a CHECK constraint now enforces the pairing
--     the code assumes: plan kinds require a plan, bookmark kinds forbid one.
--     Without it, `plan_id` being nullable makes "add_section with no plan" a
--     representable state, and the first thing to notice would be the review
--     screen throwing on a null.
--
-- No RLS changes. The policies from 0019 are per-command and scoped by
-- `user_id`; nothing here touches who can see a row.
-- =============================================================================

alter table plan_proposals
  alter column plan_id drop not null;

alter table plan_proposals
  drop constraint if exists plan_proposals_kind_check;

alter table plan_proposals
  add constraint plan_proposals_kind_check
  check (kind in ('add_section', 'remove_section', 'add_bookmark', 'remove_bookmark'));

-- The pairing invariant. Named so a violation reads as what it is rather than
-- as an anonymous check failure.
alter table plan_proposals
  drop constraint if exists plan_proposals_plan_id_matches_kind;

alter table plan_proposals
  add constraint plan_proposals_plan_id_matches_kind
  check (
    (kind in ('add_section', 'remove_section') and plan_id is not null)
    or
    (kind in ('add_bookmark', 'remove_bookmark') and plan_id is null)
  );
