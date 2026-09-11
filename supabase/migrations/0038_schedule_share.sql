-- ---------------------------------------------------------------------------
-- 0038 — shareable schedule links, keyed by term rather than by plan id.
--
-- The product now has ONE schedule per term (the primary plan). Local plans
-- are created offline with `plan_*` ids that only become uuids after the first
-- push, so a share function keyed by plan id would race the sync. Keying by
-- term sidesteps that: "share my Fall 2026 schedule" always names the caller's
-- primary plan for that term, whatever id it happens to hold right now.
--
-- `share_token` and `get_shared_plan(uuid)` already exist (0005). This adds:
--   · share_primary_plan(term, enabled)  — mint or clear the token, as the caller
--   · primary_plan_share_token(term)     — read it back, as the caller
--   · get_shared_schedule(token)         — the anonymous read, one JSON blob in
--                                          the shape the share page renders
-- ---------------------------------------------------------------------------

create or replace function share_primary_plan(p_term_code text, p_enabled boolean)
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan uuid;
  v_token uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select plan_id into v_plan
    from plans
   where user_id = v_user and term_code = p_term_code
   order by is_primary desc, created_at
   limit 1;

  if v_plan is null then
    if not p_enabled then
      return null;
    end if;
    -- Sharing before the first sync has landed: make the row so the link is
    -- real now. The next push updates it rather than re-inserting.
    insert into plans (user_id, term_code, name, is_primary)
    values (v_user, p_term_code, 'My schedule', true)
    returning plan_id into v_plan;
  end if;

  if p_enabled then
    update plans
       set share_token = coalesce(share_token, gen_random_uuid())
     where plan_id = v_plan
    returning share_token into v_token;
    return v_token::text;
  end if;

  update plans set share_token = null where plan_id = v_plan;
  return null;
end;
$$;

revoke all on function share_primary_plan(text, boolean) from public;
grant execute on function share_primary_plan(text, boolean) to authenticated;

create or replace function primary_plan_share_token(p_term_code text)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select share_token::text
    from plans
   where user_id = auth.uid() and term_code = p_term_code
   order by is_primary desc, created_at
   limit 1;
$$;

revoke all on function primary_plan_share_token(text) from public;
grant execute on function primary_plan_share_token(text) to authenticated;

-- The anonymous read. Definer rights, token as the only credential — same
-- reasoning as get_shared_plan in 0005. The owner's display name is included
-- because the student chose to share; a schedule with no name on it is a
-- worse preview and no more private, since the link already came from them.
create or replace function get_shared_schedule(p_share_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'planId',      p.plan_id::text,
           'termCode',    p.term_code,
           'name',        p.name,
           'ownerName',   u.display_name,
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
         )
    from plans p
    join users u on u.user_id = p.user_id
   where p.share_token = p_share_token
     and p_share_token is not null;
$$;

revoke all on function get_shared_schedule(uuid) from public;
grant execute on function get_shared_schedule(uuid) to anon, authenticated, service_role;
