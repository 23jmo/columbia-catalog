-- =============================================================================
-- 0036_onboarding_confirm_source.sql — tell a tapped chip apart from a tick we
-- made on the student's behalf
--
-- 0032 added `onboarding_guess` for the guess-and-confirm grid, on the argument
-- that "a row the student ticked off a generated list is weaker evidence than
-- one they searched for by name". True, and the value has been carrying two
-- distinguishable things ever since:
--
--   1. The pre-checked tier-1 set, written onto the record the moment the deck
--      lands. Nobody has looked at it yet. This is OUR claim about their
--      transcript.
--   2. A chip the student read and pressed in the "usually taken too" strip.
--      That is THEIR claim, made by hand, and the only thing separating it from
--      a `picker` row is that they found it in a list instead of a search box.
--
-- Collapsing the two is what let a change of major erase deliberate work.
-- `reconcileDegreeChange` retires guesses whose `liked` is still null — correct
-- for (1), and for (2) it silently deleted courses the student had personally
-- confirmed, with no undo and no notice. Onboarding's whole contract is that
-- everything is reversible; quietly dropping an answer is the one thing that
-- cannot be reversed because the student never learns it happened.
--
-- So (2) gets its own provenance. It stays below `picker` in strength — the
-- student accepted a suggestion rather than going and finding the course — but
-- it is a statement they made, and nothing we infer about their degree may
-- overrule it.
--
-- Widening a check constraint is backward compatible in both directions that
-- matter: existing `onboarding_guess` rows keep their meaning exactly, and a
-- deployment running the previous app version writes only values this
-- constraint already allowed.
-- =============================================================================

alter table student_courses drop constraint if exists student_courses_source_check;
alter table student_courses add constraint student_courses_source_check
  check (source in (
    'picker',
    'transcript_paste',
    'transcript_pdf',
    'plan',
    'onboarding_guess',
    'onboarding_confirm'
  ));

comment on column student_courses.source is
  'How the row got here. `onboarding_guess` is a tick WE made on the student''s behalf and may be retired when their degree answers change; `onboarding_confirm` is a suggestion they pressed themselves and may not. See migration 0036.';
