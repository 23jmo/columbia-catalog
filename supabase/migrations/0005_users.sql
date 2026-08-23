-- =============================================================================
-- 0005_users.sql — accounts, plans, watches, alerts, MCP tokens, and RLS
--
-- Spec reference: §11 "Data Model / User", §14 "Alerts", §15 "Auth & Accounts".
--
-- The one rule this file enforces: EVERYTHING READ-ONLY IS FREE, AN ACCOUNT
-- GATES EVERY WRITE. Catalog, history and reviews carry world-readable SELECT
-- policies (0001/0002/0004). Everything in this file is private to its owner,
-- enforced by row-level security rather than by application code, because the
-- MCP server, the API routes and the browser client all reach the same tables
-- and only the database sees all three.
--
-- Auth is Google SSO restricted to columbia.edu and barnard.edu. The domain
-- restriction is configured in Supabase Auth (hosted-domain) AND checked here,
-- because a check constraint cannot be misconfigured in a dashboard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
-- Mirrors auth.users. Supabase owns identity; this is our profile row and the
-- FK target every other user table points at.

create table if not exists users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  google_sub  text,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Google SSO is restricted to Columbia and Barnard, subdomains included
  -- (cumc.columbia.edu, gsb.columbia.edu, ...).
  constraint users_columbia_domain
    check (email ~* '@([a-z0-9-]+\.)*(columbia|barnard)\.edu$')
);

comment on table users is
  'Profile row mirroring auth.users. The email domain check is the second half of the Google hosted-domain restriction.';

create unique index if not exists idx_users_email      on users (lower(email));
create unique index if not exists idx_users_google_sub on users (google_sub) where google_sub is not null;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

-- Provision the profile row the moment Supabase Auth creates the identity, so
-- there is never a signed-in user with no row to hang a plan off.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (user_id, email, google_sub, display_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'sub',
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (user_id) do update
     set email = excluded.email,
         google_sub = coalesce(excluded.google_sub, users.google_sub);
  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- plans
-- -----------------------------------------------------------------------------
-- DEVIATION: `share_token` added. Shared schedule links are a free, no-account
-- read (spec §15). The token is NOT exposed through an RLS hole — anonymous
-- access goes through get_shared_plan() below, so a plan is readable only by
-- someone holding the unguessable token, never by plan_id enumeration.

create table if not exists plans (
  plan_id     uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (user_id) on delete cascade,
  term_code   text not null references terms (term_code) on update cascade,
  name        text not null default 'My schedule' check (btrim(name) <> ''),
  is_primary  boolean not null default false,
  share_token uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_plans_user_term on plans (user_id, term_code);
-- Exactly one primary plan per user per term.
create unique index if not exists idx_plans_one_primary
  on plans (user_id, term_code) where is_primary;
create unique index if not exists idx_plans_share_token
  on plans (share_token) where share_token is not null;

drop trigger if exists trg_plans_updated_at on plans;
create trigger trg_plans_updated_at before update on plans
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- plan_items
-- -----------------------------------------------------------------------------

create table if not exists plan_items (
  plan_id    uuid not null references plans (plan_id) on delete cascade,
  section_id text not null references sections (section_id)
               on update cascade on delete cascade,
  position   integer not null default 0 check (position >= 0),
  added_at   timestamptz not null default now(),
  primary key (plan_id, section_id)
);

create index if not exists idx_plan_items_section on plan_items (section_id);

-- -----------------------------------------------------------------------------
-- custom_blocks
-- -----------------------------------------------------------------------------
-- Non-course commitments. They participate fully in conflict and commute
-- checks, so times use the same minutes-from-midnight representation meetings
-- do — a job shift and a lecture must be comparable without a conversion.

create table if not exists custom_blocks (
  block_id      uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references plans (plan_id) on delete cascade,
  label         text not null check (btrim(label) <> ''),
  weekday       weekday_code not null,
  start_minute  integer not null check (start_minute between 0 and 1440),
  end_minute    integer not null check (end_minute between 0 and 1440),
  created_at    timestamptz not null default now(),
  check (end_minute >= start_minute)
);

create index if not exists idx_custom_blocks_plan on custom_blocks (plan_id);

-- -----------------------------------------------------------------------------
-- watches
-- -----------------------------------------------------------------------------
-- DEVIATION: `enrollment_count_at_watch` added. WatchWithState.deltaSinceWatched
-- is "enrollment delta since the watch was created"; without a baseline stamped
-- at watch time it would require reconstructing history at read time on every
-- watchlist render.

create table if not exists watches (
  user_id                   uuid not null references users (user_id) on delete cascade,
  section_id                text not null references sections (section_id)
                              on update cascade on delete cascade,
  created_at                timestamptz not null default now(),
  -- Baseline for deltaSinceWatched.
  enrollment_count_at_watch integer,
  notify_email              boolean not null default true,
  primary key (user_id, section_id)
);

comment on table watches is
  'Watchlist. Watcher counts are public (spec §14 fairness), individual watches are not.';

-- The alert sweep's access path: everyone watching a section that just opened.
create index if not exists idx_watches_section on watches (section_id);

-- Stamp the baseline from the section's current reading so callers cannot
-- forget to, and cannot fake it.
create or replace function watches_stamp_baseline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select s.enrollment_count into new.enrollment_count_at_watch
    from sections s where s.section_id = new.section_id;
  return new;
end;
$$;

drop trigger if exists trg_watches_stamp_baseline on watches;
create trigger trg_watches_stamp_baseline
  before insert on watches
  for each row execute function watches_stamp_baseline();

-- Escalate a subject to the hot tier as soon as anything in it is watched.
-- This is what "hot (subjects containing watched sections)" means in §10.
create or replace function watches_escalate_crawl_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text;
  v_term    text;
begin
  select s.subject_code, s.term_code into v_subject, v_term
    from sections s where s.section_id = new.section_id;

  if v_subject is null then
    return null;
  end if;

  update crawl_jobs j
     set tier = 'hot',
         next_fetch_at = least(j.next_fetch_at, next_fetch_with_jitter('hot', 1.0))
   where j.kind = 'subject_term'
     and j.target_key = v_subject
     and j.term_code is not distinct from v_term
     and crawl_tier_rank(j.tier) < crawl_tier_rank('hot');

  return null;
end;
$$;

drop trigger if exists trg_watches_escalate_tier on watches;
create trigger trg_watches_escalate_tier
  after insert on watches
  for each row execute function watches_escalate_crawl_tier();

-- -----------------------------------------------------------------------------
-- alerts_sent
-- -----------------------------------------------------------------------------
-- DEVIATION: `transition_at` added and uniquely indexed with (user_id,
-- section_id). One alert per watcher per open-transition — the natural dedupe
-- key. Without it, a sweep that runs twice sends twice.

create table if not exists alerts_sent (
  alert_id      uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (user_id) on delete cascade,
  section_id    text not null references sections (section_id)
                  on update cascade on delete cascade,
  sent_at       timestamptz not null default now(),
  reason        text not null default 'seat_opened',
  -- observed_at of the snapshot that triggered this alert.
  transition_at timestamptz,
  channel       text not null default 'email'
);

create unique index if not exists idx_alerts_sent_dedupe
  on alerts_sent (user_id, section_id, transition_at) where transition_at is not null;
create index if not exists idx_alerts_sent_user    on alerts_sent (user_id, sent_at desc);
create index if not exists idx_alerts_sent_section on alerts_sent (section_id, sent_at desc);

-- -----------------------------------------------------------------------------
-- mcp_tokens
-- -----------------------------------------------------------------------------
-- DEVIATION: the raw token is never stored. token_hash holds a SHA-256 of the
-- secret and token_prefix holds the first few visible characters so a user can
-- tell their tokens apart in a list. A database dump must not be a set of
-- working credentials.

create table if not exists mcp_tokens (
  token_id      uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (user_id) on delete cascade,
  name          text not null default 'MCP token',
  -- hex sha-256 of the secret; the secret itself is shown once and discarded.
  token_hash    text not null,
  token_prefix  text,
  scopes        text[] not null default array['catalog:read']::text[],
  expires_at    timestamptz,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (token_hash ~ '^[0-9a-f]{64}$')
);

comment on column mcp_tokens.token_hash is
  'SHA-256 hex of the bearer secret. The secret is never stored.';

create unique index if not exists idx_mcp_tokens_hash on mcp_tokens (token_hash);
create index if not exists idx_mcp_tokens_user on mcp_tokens (user_id, created_at desc);
create index if not exists idx_mcp_tokens_active
  on mcp_tokens (user_id) where revoked_at is null;

-- =============================================================================
-- Row level security
-- =============================================================================
-- Every table below is owner-private. Policies are written per command rather
-- than as a single FOR ALL so that USING (what you may see) and WITH CHECK
-- (what you may write) are both explicit — a FOR ALL policy silently applies
-- its USING clause as the check for UPDATE, which is easy to get subtly wrong.
--
-- plan_items and custom_blocks have no user_id of their own; ownership is
-- proved through the parent plan. The EXISTS subquery reads `plans`, which is
-- itself RLS-protected, but policy subqueries run with the policy's own view of
-- the table, so this is a genuine ownership test rather than a recursive one.

alter table users         enable row level security;
alter table plans         enable row level security;
alter table plan_items    enable row level security;
alter table custom_blocks enable row level security;
alter table watches       enable row level security;
alter table alerts_sent   enable row level security;
alter table mcp_tokens    enable row level security;

-- users ------------------------------------------------------------------
drop policy if exists users_select_own on users;
create policy users_select_own on users
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists users_update_own on users;
create policy users_update_own on users
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No delete policy: account deletion goes through auth.users and cascades.

-- plans ------------------------------------------------------------------
drop policy if exists plans_select_own on plans;
create policy plans_select_own on plans
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists plans_insert_own on plans;
create policy plans_insert_own on plans
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists plans_update_own on plans;
create policy plans_update_own on plans
  for update to authenticated
  using (user_id = (select auth.uid()))
  -- A user may not reassign a plan to somebody else.
  with check (user_id = (select auth.uid()));

drop policy if exists plans_delete_own on plans;
create policy plans_delete_own on plans
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- plan_items -------------------------------------------------------------
drop policy if exists plan_items_select_own on plan_items;
create policy plan_items_select_own on plan_items
  for select to authenticated
  using (exists (
    select 1 from plans p
     where p.plan_id = plan_items.plan_id and p.user_id = (select auth.uid())
  ));

drop policy if exists plan_items_insert_own on plan_items;
create policy plan_items_insert_own on plan_items
  for insert to authenticated
  with check (exists (
    select 1 from plans p
     where p.plan_id = plan_items.plan_id and p.user_id = (select auth.uid())
  ));

drop policy if exists plan_items_update_own on plan_items;
create policy plan_items_update_own on plan_items
  for update to authenticated
  using (exists (
    select 1 from plans p
     where p.plan_id = plan_items.plan_id and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from plans p
     where p.plan_id = plan_items.plan_id and p.user_id = (select auth.uid())
  ));

drop policy if exists plan_items_delete_own on plan_items;
create policy plan_items_delete_own on plan_items
  for delete to authenticated
  using (exists (
    select 1 from plans p
     where p.plan_id = plan_items.plan_id and p.user_id = (select auth.uid())
  ));

-- custom_blocks ----------------------------------------------------------
drop policy if exists custom_blocks_select_own on custom_blocks;
create policy custom_blocks_select_own on custom_blocks
  for select to authenticated
  using (exists (
    select 1 from plans p
     where p.plan_id = custom_blocks.plan_id and p.user_id = (select auth.uid())
  ));

drop policy if exists custom_blocks_insert_own on custom_blocks;
create policy custom_blocks_insert_own on custom_blocks
  for insert to authenticated
  with check (exists (
    select 1 from plans p
     where p.plan_id = custom_blocks.plan_id and p.user_id = (select auth.uid())
  ));

drop policy if exists custom_blocks_update_own on custom_blocks;
create policy custom_blocks_update_own on custom_blocks
  for update to authenticated
  using (exists (
    select 1 from plans p
     where p.plan_id = custom_blocks.plan_id and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from plans p
     where p.plan_id = custom_blocks.plan_id and p.user_id = (select auth.uid())
  ));

drop policy if exists custom_blocks_delete_own on custom_blocks;
create policy custom_blocks_delete_own on custom_blocks
  for delete to authenticated
  using (exists (
    select 1 from plans p
     where p.plan_id = custom_blocks.plan_id and p.user_id = (select auth.uid())
  ));

-- watches ----------------------------------------------------------------
drop policy if exists watches_select_own on watches;
create policy watches_select_own on watches
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists watches_insert_own on watches;
create policy watches_insert_own on watches
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists watches_update_own on watches;
create policy watches_update_own on watches
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists watches_delete_own on watches;
create policy watches_delete_own on watches
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- alerts_sent ------------------------------------------------------------
-- Readable by its recipient so "we emailed you at 4:02" is inspectable.
-- Writable only by the alert sweep, which runs as the service role: no insert,
-- update or delete policy exists at all.
drop policy if exists alerts_sent_select_own on alerts_sent;
create policy alerts_sent_select_own on alerts_sent
  for select to authenticated
  using (user_id = (select auth.uid()));

-- mcp_tokens -------------------------------------------------------------
drop policy if exists mcp_tokens_select_own on mcp_tokens;
create policy mcp_tokens_select_own on mcp_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists mcp_tokens_insert_own on mcp_tokens;
create policy mcp_tokens_insert_own on mcp_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists mcp_tokens_update_own on mcp_tokens;
create policy mcp_tokens_update_own on mcp_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists mcp_tokens_delete_own on mcp_tokens;
create policy mcp_tokens_delete_own on mcp_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Shared schedule links
-- -----------------------------------------------------------------------------
-- A shared plan is a free read for anyone holding the token. This is a function
-- rather than an RLS policy on purpose: a policy like `using (share_token is
-- not null)` would let anyone walk plan_ids and read every shared schedule.
-- Here the token IS the credential and nothing is readable without it.

create or replace function get_shared_plan(p_share_token uuid)
returns table (
  plan_id     uuid,
  term_code   text,
  name        text,
  created_at  timestamptz,
  section_ids text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select p.plan_id,
         p.term_code,
         p.name,
         p.created_at,
         coalesce(
           (select array_agg(pi.section_id order by pi.position, pi.section_id)
              from plan_items pi where pi.plan_id = p.plan_id),
           array[]::text[]
         )
    from plans p
   where p.share_token = p_share_token
     and p_share_token is not null;
$$;

comment on function get_shared_plan is
  'Anonymous read of a shared schedule. The token is the credential; there is no RLS hole and no plan_id enumeration.';

create or replace function get_shared_plan_blocks(p_share_token uuid)
returns table (
  block_id     uuid,
  label        text,
  weekday      weekday_code,
  start_minute integer,
  end_minute   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select b.block_id, b.label, b.weekday, b.start_minute, b.end_minute
    from custom_blocks b
    join plans p on p.plan_id = b.plan_id
   where p.share_token = p_share_token
     and p_share_token is not null;
$$;

revoke all on function get_shared_plan(uuid) from public;
grant execute on function get_shared_plan(uuid) to anon, authenticated, service_role;
revoke all on function get_shared_plan_blocks(uuid) from public;
grant execute on function get_shared_plan_blocks(uuid) to anon, authenticated, service_role;
