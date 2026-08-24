-- =============================================================================
-- 0022_bookmarks.sql — saved classes and the folders that organise them
--
-- Spec: `.plans/saved-classes-bookmarks-folders-spec.md`.
--
-- Three concepts already exist in this database and this migration adds the
-- one that was missing between them:
--
--   bookmark   "I am considering this section"     ← new, private, cheap
--     └ watch  "email me when a seat opens"        ← a promise (0005)
--   plan_item  "this is my schedule"               ← a commitment (0005)
--
-- ── Why the section and not the course ─────────────────────────────────────
--
-- Everything downstream of a save is section-shaped: plan_items hold section
-- ids, watches hold section ids, conflicts are computed from meetings. "MW
-- 2:40 with Nieh" and "TuTh 1:10 with Yang" are different decisions, and a
-- course-level bookmark would throw away the only thing the student was
-- choosing between.
--
-- ── Why a folder is a label, not a container ───────────────────────────────
--
-- Membership is many-to-many. A section can be in "Systems track" and in
-- "Spring backup" at once, because a class genuinely serves more than one
-- purpose while you are deciding. The consequence that matters: deleting a
-- folder is deleting a LABEL, so it must never delete the saved sections
-- underneath it. That is why bookmark_folder_items is a separate table and not
-- a folder_id column on bookmarks.
--
-- ── What is NOT here ───────────────────────────────────────────────────────
--
-- No public aggregate. Watcher counts are public by design (spec §14: you
-- deserve to know what you are up against), but nothing may ask how many
-- people bookmarked a section. Saving is private browsing behaviour and
-- publishing it would turn a parking lot into a leaderboard.
--
-- No `color` column. Folder cover art is derived from folder_id in the client
-- (lib/bookmarks/folder-art.ts), so it is stable, unique per folder, needs no
-- picker in the create flow, and cannot drift between the chip, the dropdown
-- and the gallery card.
--
-- No backfill. The site has no users and `watches` is empty in every
-- environment, so the FK added at the bottom of this file can be created
-- outright rather than after a data migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- bookmark_folders
-- -----------------------------------------------------------------------------

create table if not exists bookmark_folders (
  folder_id  uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (user_id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookmark_folders_name_length
    check (length(btrim(name)) between 1 and 60)
);

comment on table bookmark_folders is
  'User-defined labels for saved sections. Membership is many-to-many; deleting a folder never deletes a bookmark.';

-- Case-insensitive uniqueness per user: "systems" and "Systems" must not both
-- exist, or the folder picker becomes a guessing game.
create unique index if not exists idx_bookmark_folders_user_name
  on bookmark_folders (user_id, lower(btrim(name)));

create index if not exists idx_bookmark_folders_user
  on bookmark_folders (user_id, created_at);

drop trigger if exists trg_bookmark_folders_updated_at on bookmark_folders;
create trigger trg_bookmark_folders_updated_at before update on bookmark_folders
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- bookmarks
-- -----------------------------------------------------------------------------
-- term_code is denormalised off `sections` so the /saved term filter is an
-- index scan rather than a join on every render. It is stamped by a trigger
-- rather than sent by the client: a caller cannot then file a bookmark under
-- the wrong term, and cannot forget to send one.

create table if not exists bookmarks (
  user_id    uuid not null references users (user_id) on delete cascade,
  section_id text not null references sections (section_id)
               on update cascade on delete cascade,
  term_code  text not null references terms (term_code) on update cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, section_id)
);

comment on table bookmarks is
  'Saved sections. Private to their owner — unlike watches, there is deliberately no public count.';

create index if not exists idx_bookmarks_user_term
  on bookmarks (user_id, term_code, created_at desc);

create or replace function bookmarks_stamp_term()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select s.term_code into new.term_code
    from sections s where s.section_id = new.section_id;

  if new.term_code is null then
    raise exception 'unknown_section' using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookmarks_stamp_term on bookmarks;
create trigger trg_bookmarks_stamp_term before insert on bookmarks
  for each row execute function bookmarks_stamp_term();

-- -----------------------------------------------------------------------------
-- bookmark_folder_items
-- -----------------------------------------------------------------------------
-- A bookmark in zero folders is "Uncategorized". That is a computed state, not
-- a row: there is no system folder to rename, delete, or accidentally file
-- something into twice.

create table if not exists bookmark_folder_items (
  folder_id  uuid not null references bookmark_folders (folder_id) on delete cascade,
  user_id    uuid not null,
  section_id text not null,
  added_at   timestamptz not null default now(),
  primary key (folder_id, user_id, section_id),
  -- Composite FK: a folder item can only ever point at a bookmark the SAME
  -- user owns. Cross-user filing is impossible by schema rather than by a
  -- policy that happens to be written correctly today.
  constraint bookmark_folder_items_bookmark_fk
    foreign key (user_id, section_id)
    references bookmarks (user_id, section_id) on delete cascade
);

comment on table bookmark_folder_items is
  'Many-to-many between bookmarks and folders. Zero rows for a bookmark means Uncategorized.';

-- "What is in this folder", the folder-page read.
create index if not exists idx_bfi_folder on bookmark_folder_items (folder_id, added_at desc);
-- "Which folders is this bookmark in", the row-chip read.
create index if not exists idx_bfi_bookmark on bookmark_folder_items (user_id, section_id);

-- -----------------------------------------------------------------------------
-- Limits
-- -----------------------------------------------------------------------------
-- Enforced in the database, not the client, because the MCP write path means a
-- browser is not the only thing that can create these. Both raise a named
-- errcode so the client can turn the failure into a sentence a student
-- understands instead of a Postgres string.

create or replace function bookmark_folders_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from bookmark_folders where user_id = new.user_id) >= 50 then
    raise exception 'folder_limit_reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookmark_folders_cap on bookmark_folders;
create trigger trg_bookmark_folders_cap before insert on bookmark_folders
  for each row execute function bookmark_folders_enforce_cap();

create or replace function bookmarks_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from bookmarks where user_id = new.user_id) >= 500 then
    raise exception 'bookmark_limit_reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookmarks_cap on bookmarks;
create trigger trg_bookmarks_cap before insert on bookmarks
  for each row execute function bookmarks_enforce_cap();

-- Folders per bookmark is deliberately uncapped. A row showing four folder
-- chips instead of three is a display problem, not a data problem.

-- -----------------------------------------------------------------------------
-- A watch is now a child of a bookmark
-- -----------------------------------------------------------------------------
-- The bell lives inside the saved section's overflow menu, so every watch has
-- a bookmark above it. Expressing that as a foreign key rather than as a rule
-- in a click handler is what makes "removing the bookmark turns off the seat
-- alert" true even when the removal came from the MCP path, a bulk action, or
-- a cascade from a cancelled section.

alter table watches
  drop constraint if exists watches_requires_bookmark;

alter table watches
  add constraint watches_requires_bookmark
  foreign key (user_id, section_id)
  references bookmarks (user_id, section_id)
  on delete cascade;

-- `trg_watches_escalate_tier` (0005) is deliberately left alone. Turning the
-- bell on still escalates its subject to the hot crawl tier; bookmarking does
-- NOT. Saving is browsing behaviour, and a few hundred casual saves would push
-- most of the catalog into hot-tier crawling for seat numbers nobody is
-- waiting on. The honest consequence — that a saved-but-unwatched section can
-- show a days-old reading — is handled in the UI by always printing the "as
-- of" stamp beside the number.

-- -----------------------------------------------------------------------------
-- Deleting a folder and its bookmarks, atomically
-- -----------------------------------------------------------------------------
-- The delete dialog offers "also remove the N saved sections". Doing that as
-- two client calls leaves a window where the folder is gone and the bookmarks
-- are not, and a failure in between is unexplainable to the student. One
-- security-definer function, one transaction.
--
-- It is definer-rights but reads auth.uid() itself and filters every statement
-- by it, so it can only ever delete the caller's own rows.

create or replace function delete_bookmark_folder(
  p_folder_id uuid,
  p_delete_bookmarks boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_removed integer := 0;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from bookmark_folders
     where folder_id = p_folder_id and user_id = v_user
  ) then
    raise exception 'folder_not_found' using errcode = 'no_data_found';
  end if;

  if p_delete_bookmarks then
    with doomed as (
      delete from bookmarks b
       where b.user_id = v_user
         and exists (
           select 1 from bookmark_folder_items i
            where i.folder_id = p_folder_id
              and i.user_id = b.user_id
              and i.section_id = b.section_id
         )
      returning 1
    )
    select count(*) into v_removed from doomed;
  end if;

  delete from bookmark_folders
   where folder_id = p_folder_id and user_id = v_user;

  return v_removed;
end;
$$;

comment on function delete_bookmark_folder is
  'Deletes a folder, optionally with its bookmarks, in one transaction. Caller-scoped via auth.uid().';

revoke all on function delete_bookmark_folder(uuid, boolean) from public;
grant execute on function delete_bookmark_folder(uuid, boolean) to authenticated;

-- =============================================================================
-- Row level security
-- =============================================================================
-- Owner-private, per-command policies. Never `for all`: its USING clause is
-- silently reused as the check for UPDATE, which is easy to get subtly wrong.
--
-- bookmark_folder_items carries its own user_id (rather than proving ownership
-- through the folder with an EXISTS subquery) precisely so these policies stay
-- a single indexed comparison. The composite FK already guarantees the
-- user_id matches a real bookmark of that user's.

alter table bookmark_folders      enable row level security;
alter table bookmarks             enable row level security;
alter table bookmark_folder_items enable row level security;

-- bookmark_folders ---------------------------------------------------------
drop policy if exists bookmark_folders_select_own on bookmark_folders;
create policy bookmark_folders_select_own on bookmark_folders
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists bookmark_folders_insert_own on bookmark_folders;
create policy bookmark_folders_insert_own on bookmark_folders
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists bookmark_folders_update_own on bookmark_folders;
create policy bookmark_folders_update_own on bookmark_folders
  for update to authenticated
  using (user_id = (select auth.uid()))
  -- A user may not hand a folder to somebody else.
  with check (user_id = (select auth.uid()));

drop policy if exists bookmark_folders_delete_own on bookmark_folders;
create policy bookmark_folders_delete_own on bookmark_folders
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- bookmarks ----------------------------------------------------------------
drop policy if exists bookmarks_select_own on bookmarks;
create policy bookmarks_select_own on bookmarks
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists bookmarks_insert_own on bookmarks;
create policy bookmarks_insert_own on bookmarks
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists bookmarks_update_own on bookmarks;
create policy bookmarks_update_own on bookmarks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists bookmarks_delete_own on bookmarks;
create policy bookmarks_delete_own on bookmarks
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- bookmark_folder_items ----------------------------------------------------
drop policy if exists bookmark_folder_items_select_own on bookmark_folder_items;
create policy bookmark_folder_items_select_own on bookmark_folder_items
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists bookmark_folder_items_insert_own on bookmark_folder_items;
create policy bookmark_folder_items_insert_own on bookmark_folder_items
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists bookmark_folder_items_delete_own on bookmark_folder_items;
create policy bookmark_folder_items_delete_own on bookmark_folder_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- No update policy: a folder item has nothing to change. Refiling is a delete
-- and an insert, which is also what the checkbox in the picker does.
