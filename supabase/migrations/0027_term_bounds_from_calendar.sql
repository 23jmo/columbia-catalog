-- -----------------------------------------------------------------------------
-- 0027 — the academic calendar also sets each term's first and last day
-- -----------------------------------------------------------------------------
-- `terms.starts_on` / `terms.ends_on` have been null since the schema was
-- created, so `termBounds()` in lib/schedule/term-dates.ts has been falling
-- back to a per-season month/day shape. That shape is close, and close is the
-- wrong kind of wrong for a calendar export: the Fall 2026 fallback opens on
-- September 2 when classes actually begin September 8, so every exported .ics
-- carried a phantom first week of meetings. Spring 2027 fails the other way —
-- the fallback opens January 20, one day after the real January 19, so a
-- Tuesday class silently loses its first session.
--
-- The parser now reports `termStartsOn` / `termEndsOn` alongside the
-- milestones. They are plain calendar days rather than milestone rows because
-- `registration_milestone_kind` has no member for the end of a term.
--
-- Only ever widens: a term keeps whatever bounds it has if a later parse comes
-- back without them, so one unrecognised fetch cannot blank a good date.

create or replace function ingest_academic_calendar(p_payload jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_term    text := p_payload ->> 'termCode';
  v_entry   jsonb;
  v_written integer := 0;
  v_starts  date := nullif(btrim(p_payload ->> 'termStartsOn'), '')::date;
  v_ends    date := nullif(btrim(p_payload ->> 'termEndsOn'), '')::date;
begin
  if v_term is null then
    return 0;
  end if;
  perform ensure_term(v_term);

  for v_entry in select * from jsonb_array_elements(coalesce(p_payload -> 'milestones', '[]'::jsonb))
  loop
    -- `registration_milestone_kind` has no catch-all member, and inventing one
    -- would let a mis-parsed calendar row become a permanent annotation on the
    -- seat-history chart. An unrecognised kind is skipped instead.
    continue when (v_entry ->> 'kind') is null
      or (v_entry ->> 'kind') not in
         ('registration_open', 'appointment_window', 'add_drop_deadline', 'term_start');
    continue when (v_entry ->> 'occursAt') is null;

    insert into registration_milestones (term_code, kind, label, occurs_at, ends_at, audience, source_url)
    values (
      v_term,
      (v_entry ->> 'kind')::registration_milestone_kind,
      coalesce(nullif(btrim(v_entry ->> 'label'), ''), 'Milestone'),
      (v_entry ->> 'occursAt')::timestamptz,
      (v_entry ->> 'endsAt')::timestamptz,
      nullif(btrim(v_entry ->> 'audience'), ''),
      nullif(btrim(v_entry ->> 'sourceUrl'), '')
    )
    on conflict (term_code, kind, label) do update
       set occurs_at  = excluded.occurs_at,
           ends_at    = coalesce(excluded.ends_at, registration_milestones.ends_at),
           audience   = coalesce(excluded.audience, registration_milestones.audience),
           source_url = coalesce(excluded.source_url, registration_milestones.source_url);

    v_written := v_written + 1;
  end loop;

  -- A term is only bounded when BOTH ends are known: `termBounds()` treats a
  -- half-filled pair as unusable and falls back anyway, so writing one alone
  -- would record data that no reader can act on.
  if v_starts is not null and v_ends is not null and v_ends >= v_starts then
    update terms
       set starts_on = v_starts,
           ends_on   = v_ends
     where term_code = v_term
       and (starts_on is distinct from v_starts or ends_on is distinct from v_ends);
  end if;

  return v_written;
end;
$$;

revoke all on function ingest_academic_calendar(jsonb) from public;
grant execute on function ingest_academic_calendar(jsonb) to service_role;
