-- ---------------------------------------------------------------------------
-- 0013 — plan persistence and watch counts.
--
-- ── Why a whole-term replace instead of granular writes ────────────────────
--
-- `PlanStore` in lib/schedule/plans.ts is SYNCHRONOUS: listPlans() returns
-- Plan[], not Promise<Plan[]>. That is not an oversight. A schedule grid has to
-- respond to a drag inside one frame, and awaiting a network round trip per
-- section toggle would make the planner feel broken on campus wifi.
--
-- So local storage stays the read path and the source of truth for the session,
-- and Supabase is written through behind it. The unit of that write is the
-- whole term, because the client always knows the complete desired state and
-- diffing it into per-row calls would only invent failure modes — a plan whose
-- items committed but whose primary flag did not is worse than either outcome.
--
-- Everything below runs as `auth.uid()`. A user cannot write another user's
-- plans even by passing their plan_id, because every statement is scoped to the
-- caller and the RLS policies in 0005 apply underneath.
--
-- ── Ids ────────────────────────────────────────────────────────────────────
--
-- Local plans are created offline with ids like `plan_a1b2c3d4e5f6`, which are
-- not uuids. Rather than force the client to invent uuids, an unparseable id is
-- treated as "new": the database mints one and the function returns the
-- canonical plan list, which the client adopts. Ids converge on the first push
-- and stay stable after.
-- ---------------------------------------------------------------------------

-- Null when the text is not a uuid, instead of raising. Used to decide whether
-- an incoming plan or block is an update or an insert.
create or replace function try_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_user_plans
-- ---------------------------------------------------------------------------
-- Returns the caller's plans for a term in exactly the shape lib/types.ts Plan
-- declares, so the client can hand the result straight to the store with no
-- field-by-field mapping to drift out of sync.

create or replace function list_user_plans(p_term_code text default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(plan order by plan ->> 'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'planId',      p.plan_id::text,
             'userId',      p.user_id::text,
             'termCode',    p.term_code,
             'name',        p.name,
             'isPrimary',   p.is_primary,
             'sectionIds',  coalesce(
                              (select jsonb_agg(i.section_id order by i.position, i.added_at)
                                 from plan_items i where i.plan_id = p.plan_id),
                              '[]'::jsonb),
             'customBlocks', coalesce(
                              (select jsonb_agg(jsonb_build_object(
                                        'blockId',     b.block_id::text,
                                        'label',       b.label,
                                        'weekday',     b.weekday,
                                        'startMinute', b.start_minute,
                                        'endMinute',   b.end_minute)
                                      order by b.weekday, b.start_minute)
                                 from custom_blocks b where b.plan_id = p.plan_id),
                              '[]'::jsonb)
           ) as plan
      from plans p
     where p.user_id = auth.uid()
       and (p_term_code is null or p.term_code = p_term_code)
  ) rows;
$$;

revoke all on function list_user_plans(text) from public;
grant execute on function list_user_plans(text) to authenticated;

-- ---------------------------------------------------------------------------
-- replace_user_plans
-- ---------------------------------------------------------------------------

create or replace function replace_user_plans(p_term_code text, p_plans jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_plan    jsonb;
  v_id      uuid;
  v_keep    uuid[] := '{}';
  v_primary uuid := null;
  v_section text;
  v_block   jsonb;
  v_pos     integer;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(p_plans) <> 'array' then
    raise exception 'p_plans must be a JSON array';
  end if;

  for v_plan in select * from jsonb_array_elements(p_plans) loop
    v_id := try_uuid(v_plan ->> 'planId');

    -- An id we do not own is treated as absent rather than as an error: it is
    -- almost always a stale local cache, and minting a fresh plan is the
    -- recoverable outcome.
    if v_id is not null and not exists (
      select 1 from plans where plan_id = v_id and user_id = v_user
    ) then
      v_id := null;
    end if;

    if v_id is null then
      insert into plans (user_id, term_code, name, is_primary)
      values (v_user, p_term_code, coalesce(nullif(btrim(v_plan ->> 'name'), ''), 'My schedule'), false)
      returning plan_id into v_id;
    else
      update plans
         set name = coalesce(nullif(btrim(v_plan ->> 'name'), ''), name),
             term_code = p_term_code,
             -- Cleared here and set once at the end. The partial unique index
             -- on (user_id, term_code) where is_primary is checked per
             -- statement, so moving the flag between two plans in one pass
             -- would collide if both were true at any point.
             is_primary = false
       where plan_id = v_id;
    end if;

    v_keep := v_keep || v_id;
    if coalesce((v_plan ->> 'isPrimary')::boolean, false) and v_primary is null then
      v_primary := v_id;
    end if;

    -- Items and blocks are replaced wholesale. The client sent the complete
    -- desired state; merging would leave a removed section alive.
    delete from plan_items where plan_id = v_id;
    v_pos := 0;
    for v_section in
      select value #>> '{}' from jsonb_array_elements(coalesce(v_plan -> 'sectionIds', '[]'::jsonb))
    loop
      -- Skipped rather than failed: a section can legitimately vanish between
      -- terms, and refusing the whole plan would strand the student's schedule
      -- over one stale id.
      if exists (select 1 from sections where section_id = v_section) then
        insert into plan_items (plan_id, section_id, position)
        values (v_id, v_section, v_pos)
        on conflict (plan_id, section_id) do nothing;
        v_pos := v_pos + 1;
      end if;
    end loop;

    delete from custom_blocks where plan_id = v_id;
    for v_block in select * from jsonb_array_elements(coalesce(v_plan -> 'customBlocks', '[]'::jsonb)) loop
      insert into custom_blocks (plan_id, label, weekday, start_minute, end_minute)
      values (
        v_id,
        coalesce(nullif(btrim(v_block ->> 'label'), ''), 'Busy'),
        (v_block ->> 'weekday')::weekday_code,
        greatest(0, least(1440, coalesce((v_block ->> 'startMinute')::integer, 0))),
        greatest(0, least(1440, coalesce((v_block ->> 'endMinute')::integer, 0)))
      );
    end loop;
  end loop;

  -- Anything the client did not send for this term was deleted there.
  delete from plans
   where user_id = v_user
     and term_code = p_term_code
     and not (plan_id = any (v_keep));

  if v_primary is null then
    select plan_id into v_primary
      from plans where user_id = v_user and term_code = p_term_code
     order by created_at limit 1;
  end if;
  if v_primary is not null then
    update plans set is_primary = true where plan_id = v_primary;
  end if;

  return list_user_plans(p_term_code);
end;
$$;

revoke all on function replace_user_plans(text, jsonb) from public;
grant execute on function replace_user_plans(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- watch_counts
-- ---------------------------------------------------------------------------
-- Spec §14: watcher counts are public, individual watches are not. Returning
-- only an aggregate is what makes that structural — there is no shape of this
-- result that can name a watcher. Definer rights so an anonymous reader gets
-- the count without RLS on `watches` having to expose a row.

create or replace function watch_counts(p_section_ids text[])
returns table (section_id text, watcher_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select w.section_id, count(*)::bigint
    from watches w
   where w.section_id = any (p_section_ids)
   group by w.section_id;
$$;

revoke all on function watch_counts(text[]) from public;
grant execute on function watch_counts(text[]) to anon, authenticated, service_role;
