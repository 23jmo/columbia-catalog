-- =============================================================================
-- 0019_plan_proposals.sql — make "agents propose, they do not act" durable
--
-- Spec §16 gives MCP write tools no authority: `add_section` and
-- `remove_section` record an intent and hand back a link, and only a human
-- click inside the app may turn one into a plan change.
--
-- That mechanism has been correct and completely non-functional in production.
-- The store behind it was a `Map` in module scope, which on Vercel means: an
-- agent proposes on one lambda instance, the student opens the review link,
-- that request lands on a different instance, and the proposal does not exist.
-- Worse than an error — the agent reports success and the diff evaporates.
--
-- ── Why RLS and not a service-role table ────────────────────────────────────
--
-- A proposal is a claim about what somebody wants done to THEIR plan. The MCP
-- server authenticates the student and acts as them, so the database can be
-- the thing that enforces ownership rather than a `where user_id = $1` that a
-- future caller might forget. Every policy here is `user_id = auth.uid()`.
--
-- ── Why an agent may insert but never accept ────────────────────────────────
--
-- There is deliberately NO update policy that lets a row move to 'accepted' or
-- 'rejected' by any path except `resolve_plan_proposal`, which is
-- security-definer and checks `auth.uid()` itself. Without that, a compromised
-- or over-eager agent holding the student's token could propose a change and
-- then accept its own proposal, which is exactly the authority the spec
-- refuses to give it. The status column is not writable from the client.
-- =============================================================================

create table if not exists plan_proposals (
  proposal_id      text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  plan_id          text not null,
  kind             text not null check (kind in ('add_section', 'remove_section')),
  section_id       text not null,
  course_id        text,
  summary          text not null,
  note             text,
  review_url       text not null,
  status           text not null default 'pending'
                     check (status in ('pending', 'accepted', 'rejected', 'expired')),
  origin_client_id text not null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  resolved_at      timestamptz
);

-- The only hot read: "what is pending for me, newest first".
create index if not exists plan_proposals_pending_idx
  on plan_proposals (user_id, created_at desc)
  where status = 'pending';

alter table plan_proposals enable row level security;

drop policy if exists plan_proposals_select_own on plan_proposals;
create policy plan_proposals_select_own on plan_proposals
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists plan_proposals_insert_own on plan_proposals;
create policy plan_proposals_insert_own on plan_proposals
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- An agent may only ever create a pending row. It cannot propose something
    -- that arrives already accepted.
    and status = 'pending'
  );

drop policy if exists plan_proposals_delete_own on plan_proposals;
create policy plan_proposals_delete_own on plan_proposals
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- No update policy at all. See the header.

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Pending proposals for the caller, expiring stale ones on the way past.
--
-- Lazy expiry rather than a cron: a proposal nobody looks at costs nothing, and
-- the only moment its staleness is observable is the moment somebody reads it.
create or replace function list_plan_proposals()
returns setof plan_proposals
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;

  update plan_proposals
     set status = 'expired', resolved_at = now()
   where user_id = v_user
     and status = 'pending'
     and expires_at <= now();

  return query
    select * from plan_proposals
     where user_id = v_user and status = 'pending'
     order by created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- The accept/reject door
-- ---------------------------------------------------------------------------

-- Moves one pending proposal to a terminal state. The ONLY way status changes.
--
-- Returns the row so the caller can apply the diff it describes; returns
-- nothing when the proposal is missing, already resolved, or somebody else's —
-- the three cases are deliberately indistinguishable to the caller, so this
-- cannot be used to probe for another user's proposal ids.
create or replace function resolve_plan_proposal(
  p_proposal_id text,
  p_status      text
)
returns setof plan_proposals
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_status not in ('accepted', 'rejected', 'expired') then
    return;
  end if;

  return query
    update plan_proposals
       set status = p_status, resolved_at = now()
     where proposal_id = p_proposal_id
       and user_id = v_user
       and status = 'pending'
    returning *;
end;
$$;

revoke all on function list_plan_proposals() from public;
revoke all on function resolve_plan_proposal(text, text) from public;
grant execute on function list_plan_proposals() to authenticated;
grant execute on function resolve_plan_proposal(text, text) to authenticated;
