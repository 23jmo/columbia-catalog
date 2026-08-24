# Saved Classes — Bookmarks & Folders

**Version:** 1.0
**Date:** 2026-08-23
**Branch:** `class-bookmarks-folders`, **rebased onto `v1-implementation`**
**Parent spec:** `.plans/columbia-catalog-spec.md` (§8 Schedule, §14 Alerts, §15 Auth)

---

## 0. Prerequisite — rebase first

This spec is written against `v1-implementation`, not `main`. Nothing below
works on the current base.

```
git rebase v1-implementation      # from the class-bookmarks-folders worktree
```

`v1-implementation` supplies the four things this feature is built on top of:

| What | Where | Why it matters here |
|---|---|---|
| Real Google SSO | `hooks/use-session-account.ts`, `app/auth/callback/route.ts`, `lib/db/auth.ts` | Bookmarks are Supabase-only and gated on a session |
| Server-authoritative store pattern | `lib/watchlist/store.ts` + `hooks/use-watchlist.ts` | The bookmark store is a direct sibling of it, same shape, same discipline |
| Watch/alerts | `components/watch/watch-button.tsx`, `lib/db/watches.ts`, `lib/alerts/**` | The bell becomes a child of the bookmark |
| Plan sync | `lib/db/plan-sync.ts`, `lib/schedule/plans.ts`, `components/schedule/add-to-schedule-button.tsx` | "Add to plan" from saved, and the schedule dropdown |

`main` has none of it. Building here without the rebase means stubbing auth,
duplicating the watch UI, and a painful merge.

---

## 1. What this is

A **bookmark** is a student saying *"this specific section is a candidate."*
Not a plan (that's a commitment), not a watch (that's a promise to email
them). A parking lot for the twenty sections you're deciding between.

The three concepts, ordered by how much they claim:

```
bookmark   ★  "I'm considering this"        →  private, cheap, reversible
  └ bell   🔔 "email me when a seat opens"   →  a promise; escalates crawling
plan item  +  "this is my schedule"          →  participates in conflicts/credits
```

A bell requires a bookmark. A plan item does not — you can add a section to
your schedule without ever saving it, and vice versa.

### Non-goals for v1

- Per-bookmark notes. Folders are the only organizing tool.
- Sharing a folder with another student.
- Nested folders.
- Course-level bookmarks. See §2.

---

## 2. The unit is the section, not the course

You bookmark `20263COMS4113W001`, not `COMS4113`. Two sections of the same
course are two bookmarks.

This is the right call and also the awkward one, so it's worth stating the
reasoning: everything downstream of a save is section-shaped. The plan holds
section ids. A watch holds a section id. "MW 2:40 with Nieh" and "TuTh 1:10
with Yang" are different decisions, and saving "COMS4113" would throw away the
only thing the student was actually choosing between.

**The consequence for /search:** results there are *course* rows that expand
into sections. There is **no bookmark control on a collapsed course row.** You
expand, then save the section you want. A course-row bookmark would have to
either guess which section you meant or write something the model can't
represent. One extra click is the honest price.

---

## 3. Data model

New migration: `supabase/migrations/0007_bookmarks.sql`.

No backfill and no compatibility shim — the site has no users yet and the
`watches` table is empty in every environment.

```sql
-- ---------------------------------------------------------------------------
-- bookmark_folders
-- ---------------------------------------------------------------------------
-- A folder is a label, not a container: membership is many-to-many, so
-- deleting a folder never deletes a saved section (see bookmark_folder_items).
--
-- There is no `color` column. Folder cover art is DERIVED from folder_id, so
-- it is stable, unique, requires no picker in the create flow, and cannot
-- drift between the chip, the dropdown and the gallery card.

create table if not exists bookmark_folders (
  folder_id  uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (user_id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookmark_folders_name_length
    check (length(btrim(name)) between 1 and 60)
);

-- Case-insensitive uniqueness per user: "systems" and "Systems" must not both
-- exist, or the folder popover becomes a guessing game.
create unique index if not exists idx_bookmark_folders_user_name
  on bookmark_folders (user_id, lower(btrim(name)));

create index if not exists idx_bookmark_folders_user
  on bookmark_folders (user_id, created_at);

drop trigger if exists trg_bookmark_folders_updated_at on bookmark_folders;
create trigger trg_bookmark_folders_updated_at before update on bookmark_folders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- bookmarks
-- ---------------------------------------------------------------------------
-- Section-scoped. term_code is denormalized off sections so the /saved term
-- filter is an index scan rather than a join on every render.

create table if not exists bookmarks (
  user_id    uuid not null references users (user_id) on delete cascade,
  section_id text not null references sections (section_id)
               on update cascade on delete cascade,
  term_code  text not null references terms (term_code) on update cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, section_id)
);

create index if not exists idx_bookmarks_user_term
  on bookmarks (user_id, term_code, created_at desc);

-- Stamp term_code from the section so a client cannot file a bookmark under
-- the wrong term, and cannot forget to send one.
create or replace function bookmarks_stamp_term()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select s.term_code into new.term_code
    from sections s where s.section_id = new.section_id;
  return new;
end;
$$;

drop trigger if exists trg_bookmarks_stamp_term on bookmarks;
create trigger trg_bookmarks_stamp_term before insert on bookmarks
  for each row execute function bookmarks_stamp_term();

-- ---------------------------------------------------------------------------
-- bookmark_folder_items  (many-to-many)
-- ---------------------------------------------------------------------------
-- A bookmark in zero folders is "Uncategorized". That is a computed state,
-- not a row — see §5.

create table if not exists bookmark_folder_items (
  folder_id  uuid not null references bookmark_folders (folder_id) on delete cascade,
  user_id    uuid not null,
  section_id text not null,
  added_at   timestamptz not null default now(),
  primary key (folder_id, user_id, section_id),
  -- Composite FK: a folder item can only ever point at a bookmark the same
  -- user owns. Ownership is a schema fact, not an application check.
  foreign key (user_id, section_id)
    references bookmarks (user_id, section_id) on delete cascade
);

create index if not exists idx_bfi_bookmark on bookmark_folder_items (user_id, section_id);
```

### Limits

Enforced in the database, because the MCP write path (§9) means a client is
not the only thing that can create these.

```sql
-- 50 folders per user.
create or replace function bookmark_folders_enforce_cap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from bookmark_folders where user_id = new.user_id) >= 50 then
    raise exception 'folder_limit_reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- 500 bookmarks per user.
create or replace function bookmarks_enforce_cap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from bookmarks where user_id = new.user_id) >= 500 then
    raise exception 'bookmark_limit_reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
```

Both raise a named `errcode` so `lib/db/bookmarks.ts` can turn them into a
human sentence in the toast rather than a Postgres string.

**Deliberately not capped:** folders per bookmark. The row shows the first
three chips and `+N`; that's a display problem, not a data problem.

### Watch becomes a child of bookmark

```sql
-- A watch is a promise to email. It may only exist for a section the user has
-- saved, so that un-saving can never leave an orphaned promise behind.
alter table watches
  add constraint watches_requires_bookmark
  foreign key (user_id, section_id)
  references bookmarks (user_id, section_id)
  on delete cascade;
```

`on delete cascade` is what makes §7's "remove the bookmark, the bell goes
with it" true at the database level rather than in a click handler.

The existing `trg_watches_escalate_tier` trigger stays exactly as it is. **A
bookmark does not escalate the crawl tier — only turning the bell on does.**
Saving is browsing behavior; a few hundred casual saves would push most of the
catalog into hot-tier crawling for numbers nobody is waiting on.

### RLS

Every table is owner-private, per-command policies (never `for all`), matching
the style of `0005_users.sql`:

```sql
alter table bookmark_folders      enable row level security;
alter table bookmarks             enable row level security;
alter table bookmark_folder_items enable row level security;

-- bookmarks / bookmark_folders: user_id = (select auth.uid())
--   select, insert (with check), update (using + with check), delete
-- bookmark_folder_items: same, plus the composite FK already proves the
--   bookmark is the caller's. Policy is still written on user_id directly —
--   an EXISTS subquery here would be slower and no more correct.
```

No public aggregate function. Watcher counts are public by design (§14
fairness); **bookmark counts are not**, and nothing should be able to ask how
many people saved a section.

---

## 4. Client architecture

### 4.1 The store — `lib/bookmarks/store.ts`

A module-level store behind `useSyncExternalStore`, a direct sibling of
`lib/watchlist/store.ts`. Same reasoning applies: a bookmark icon in the
search row, one in the drawer over it, and one on the week grid must never
disagree, and they will if each owns a `useState`.

```ts
export type BookmarkStatus = "idle" | "loading" | "ready" | "signed_out";

export interface BookmarkSnapshot {
  status: BookmarkStatus;
  /** Saved section ids. */
  saved: ReadonlySet<string>;
  /** section_id → folder ids it belongs to. */
  folderIdsBySection: ReadonlyMap<string, readonly string[]>;
  /** The caller's folders, in creation order. */
  folders: readonly BookmarkFolder[];
  /** Toggles/filings in flight, keyed by section id. */
  pending: ReadonlySet<string>;
  error: string | null;
}

export interface BookmarkFolder {
  folderId: string;
  name: string;
  createdAt: string;
  /** Count within the currently-loaded term scope. */
  count: number;
}
```

**Optimistic, with loud rollback.** Same trade as the watchlist: during
registration a button that waits on a round trip reads as broken and gets
clicked again. The icon flips instantly; a refused write rolls it back and
raises an error toast that keeps the reason.

**Loaded once per session**, shared in-flight promise, so twenty section rows
on a course page produce one query.

**Realtime:** the bookmark store does *not* open its own subscription. Seat
freshness on `/saved` comes from the watchlist store's existing filtered
subscription, which already covers exactly the bell-on rows (§8.3).

### 4.2 Files

```
lib/db/bookmarks.ts               queries + mutations, the only place row shapes exist
lib/bookmarks/store.ts            the store
lib/bookmarks/folder-art.ts       deterministic gradient from folder_id
lib/bookmarks/grouping.ts         pure: sections → course-grouped, term-filtered
lib/bookmarks/bookmarks.test.ts

hooks/use-bookmarks.ts            useSyncExternalStore wrapper
hooks/use-bookmark.ts             per-section convenience: { saved, folders, toggle, pending }

lib/toast/store.ts                generic toast queue (§6)
components/base/toast/toaster.tsx
components/base/toast/toast.tsx

components/bookmarks/bookmark-button.tsx     the ★ icon + motion
components/bookmarks/bookmark-menu.tsx       the ⋯ overflow menu
components/bookmarks/folder-popover.tsx      checkbox list + inline create
components/bookmarks/folder-card.tsx         gallery card (animated cover)
components/bookmarks/folder-chip.tsx         static gradient chip
components/bookmarks/saved-section-row.tsx
components/bookmarks/saved-course-group.tsx
components/bookmarks/select-bar.tsx          bulk action bar
components/bookmarks/delete-folder-dialog.tsx

components/schedule/add-from-saved.tsx       the schedule toolbar dropdown

app/saved/page.tsx                           gallery
app/saved/[folderId]/page.tsx                one folder (also all / uncategorized)
app/saved/loading.tsx

supabase/migrations/0007_bookmarks.sql
```

Modified: `components/shell/nav.tsx` (+ `saved` nav key),
`components/shell/app-shell.tsx` (mount `<Toaster />`),
`app/search/course-result-row.tsx`, `app/course/[courseId]/sections-panel.tsx`,
`app/course/[courseId]/section-detail.tsx`,
`components/schedule/week-grid.tsx`, `components/schedule/schedule-view.tsx`
(toolbar), `lib/mcp/tools.ts` (§9).

---

## 5. Folders

### 5.1 Membership is many-to-many

`COMS4113 §001` can live in *Systems track* and *Spring backup* at once. The
popover is a **checkbox list**, not a radio list — the verb is "file", never
"move".

### 5.2 Uncategorized is computed, not stored

`Uncategorized` = every bookmark with zero folder memberships.

- No row in `bookmark_folders`.
- Cannot be renamed or deleted.
- **Does not appear in the folder popover.** You un-file by unchecking every
  folder, not by checking a pseudo-folder.
- A bookmark leaves it automatically the moment it's filed anywhere.

`All` is likewise a view, not a folder.

### 5.3 Cover art

Folder identity is visual and derived from `folder_id` — no picker, no stored
color, and the same folder looks the same everywhere.

`lib/bookmarks/folder-art.ts`:

```ts
/**
 * Hash folder_id → three hues drawn from the BoardUI chart tokens, plus three
 * stable positions. Rendered as layered radial-gradients.
 *
 * Token-based rather than raw hex so it flips with the theme like everything
 * else, and never has to be re-tuned for dark mode.
 */
export function folderArt(folderId: string): {
  stops: [string, string, string];   // css color values off --color-chart-N
  positions: [Vec2, Vec2, Vec2];
  seed: number;                      // fed to the shader on /saved cards
};
```

Two renderings of the same art:

| Surface | Rendering |
|---|---|
| Folder chips, popover rows, schedule dropdown, folder rail | **Static CSS mesh gradient.** Server-renderable, zero runtime cost. |
| Folder cards on the `/saved` gallery | **Animated fragment shader** — a slow fbm drift over the same three stops, same recipe as `components/application/settings/plan-art-flame.tsx`. |

The shader path must:
- fall back to the static CSS gradient when a WebGL context can't be created,
- fall back to the static gradient under `prefers-reduced-motion`,
- pause its rAF loop when the card is off-screen (`IntersectionObserver`) —
  a gallery of fifteen folders must not run fifteen live contexts.

### 5.4 Deleting a folder

Bookmarks survive by default; deleting them is an explicit opt-in on the same
dialog.

```
╔══════ Delete "Systems track"? ══════╗
  4 saved sections stay saved — they
  just leave this folder.

  ☐ Also remove those 4 saved sections

              [Cancel]  [Delete folder]
╚═════════════════════════════════════╝
```

- Unchecked (default): `delete from bookmark_folders where folder_id = …`.
  The `on delete cascade` on `bookmark_folder_items` drops the memberships;
  bookmarks that end up with zero memberships fall into Uncategorized.
- Checked: delete the member bookmarks first (which cascades their watches),
  then the folder. Both in one transaction — an RPC, not two client calls.
- The count in the copy and on the checkbox is the **live** count and is
  re-read when the dialog opens. "4 sections" must not be a stale number
  from the last render.

The confirmation toast for the checked path carries an Undo, same as §7.

---

## 6. Toasts — generic infrastructure, bookmarks as the first caller

There is no toaster in the repo. Build a real one.

### 6.1 The API

```ts
// lib/toast/store.ts
toast.success({ title, description?, action?, secondaryAction?, duration? });
toast.error({ title, description?, action? });
toast.dismiss(id);

interface ToastAction {
  label: string;
  /** A plain handler, or a render function for an action that opens a popover. */
  onPress?: () => void;
  render?: (props: { close: () => void; pin: () => void }) => ReactNode;
}
```

Mounted **once** in `AppShell`. Bookmarks is the first caller; the existing
silent failure paths get migrated to it in the same change:

- `PlanWriteDeniedError` from `lib/schedule/plans.ts`
- the watchlist store's optimistic rollback (`WatchNotAvailableError`)

Both currently fail quietly or inline. Neither should.

### 6.2 Behavior

- **Top-center**, sonner-style stack: newest on top, older ones collapsing
  behind it with a slight scale and offset.
- Auto-dismiss **5s**.
- Saving the *same* section twice in a row **updates the existing toast in
  place** and resets its timer, rather than stacking a duplicate.
- Max 3 visible; older ones drop.

### 6.3 Accessibility — the part that's easy to get wrong

A 5-second toast containing a button that opens a popover is a trap unless all
of this holds:

| Rule | Why |
|---|---|
| The toast region is `aria-live="polite"`, and **never steals focus** | A save is not an interruption |
| Hovering or focusing the toast **pauses** the dismiss timer | You cannot race a user's hand |
| Opening the folder popover **cancels** the timer entirely | The toast is pinned for as long as you're filing |
| `Escape` closes the popover and **resumes** the timer | Predictable exit |
| Closing the popover returns focus to the "Add to folder" button | No focus black hole |
| Every toast is reachable by `Tab` from the page, and dismissible with a close button | Keyboard users are not stranded |
| The popover itself is a focus-trapped `Dialog` from `react-aria-components` | Consistent with `account-menu.tsx` |

---

## 7. The save interaction

### 7.1 The row control cluster

Today every section row shows `[+ Add to schedule] [👁 Watch] 34`. It becomes:

```
unsaved   [+ Add]  [☆]
saved     [+ Add]  [★]  [⋯]
```

The overflow menu is where alerts and filing live, so the row stays at two
controls:

```
┌ ⋯ ─────────────────────────────────┐
│ 🔔  Alert me when a seat opens     │   ← toggles the watch; shows the
│      34 watching · nobody gets a   │     public watcher count and the
│      head start                    │     fairness line, as WatchButton does
│ 📁  Add to folder…                 │   ← same popover as the toast
│ ✖  Remove bookmark                 │
└────────────────────────────────────┘
```

`components/watch/watch-button.tsx` is **not deleted** — it stays in use on
`components/watch/watchlist-rail.tsx`, where every row is watched by
definition. What changes is that section rows no longer render it directly;
the bell lives in `bookmark-menu.tsx` and calls the same `toggleWatch`.

### 7.2 Signed out

Clicking `☆` while signed out saves nothing and raises the same top-center
toast:

```
      ┌───────────────────────────────────┐
      │ Sign in to save classes           │
      │            [Sign in with Columbia]│
      └───────────────────────────────────┘
```

The icon stays visible and enabled rather than disappearing or greying out — a
missing affordance reads as a missing feature; a door you know how to open
does not. This is the same discipline `WatchButton` and `AddToScheduleButton`
already apply.

The button hands off to the existing OAuth flow. **Nothing is held and
replayed** — no local staging, no claim-after-login.

### 7.3 Saving

```
      ┌──────────────────────────────────────┐
      │ ★ Saved COMS4113 §001                │
      │   Systems track ·                    │   ← folder chips if already filed
      │                     [Add to folder]  │
      └──────────────────────────────────────┘
```

`[Add to folder]` opens a popover **anchored under the toast**:

```
┌ Add to folder ──────────────┐
│ ☑ ▨ Systems track         4 │
│ ☐ ▨ Spring backup         2 │
│ ☐ ▨ Dream schedule        7 │
│ ─────────────────────────── │
│ + [ New folder name…    ] ↵ │
└─────────────────────────────┘
```

- Checkbox list (many-to-many), each row carrying its static gradient chip and
  its count.
- A filter input appears above the list once the user has **more than 8**
  folders.
- `+ New folder` swaps into a text input in place. `Enter` creates the folder,
  files the current bookmark into it, and returns to the list with it checked.
  No dialog, no navigation, no separate confirm.
- A duplicate name (case-insensitive) does not create a second folder — it
  checks the existing one and says so inline.
- Every check/uncheck writes immediately and optimistically. There is no
  `[Done]` button.

### 7.4 Removing

```
      ┌──────────────────────────────────────┐
      │ ✖ Removed COMS4113 §001              │
      │   Seat alerts turned off      [Undo] │   ← second line only if the bell was on
      └──────────────────────────────────────┘
```

Undo restores the bookmark, its folder memberships, **and** the watch if there
was one. The store keeps the removed record in memory for the toast's lifetime
so Undo is a re-insert, not a guess.

The "seat alerts turned off" line only appears when a watch actually existed.
Cancelling a promise silently would be the worst version of this.

### 7.5 Motion

`motion` is installed; `animation-judgement` applies.

| Transition | Treatment |
|---|---|
| Save | `☆ → ★` fill, spring scale `1 → 1.15 → 1`, ~200ms, **plus a small particle burst** (6–8 sparks, 400ms, fading out) |
| Remove | plain crossfade, 120ms, **no bounce, no particles** — celebrating a removal is wrong |
| Toast enter | slide down 8px + fade, 180ms ease-out |
| Toast exit | fade + 4px lift, 120ms |
| Stack collapse | 150ms, transform only |

The burst fires on **every** save, not just the first. Under
`prefers-reduced-motion` all of it degrades to an instant color change and an
opacity fade — no scale, no particles, no slide.

The particle burst renders in a portal above the icon with
`pointer-events: none`, so it can never intercept a click on a row underneath.

### 7.6 Where the cluster appears

All four:

1. **Expanded section rows in `/search`** — `app/search/course-result-row.tsx`.
   The main discovery surface.
2. **Course page sections panel and section detail** —
   `app/course/[courseId]/sections-panel.tsx`, `section-detail.tsx`.
3. **The course drawer over search** — `app/@drawer/(.)course/[courseId]`.
   Shares the components above, so mostly free.
4. **Blocks on the week grid** — `components/schedule/week-grid.tsx`. Space is
   tight: a hover/focus-revealed `☆` in the block corner, always present (not
   hover-gated) on touch. Saving a scheduled section as a fallback is a real
   move, and the grid is where you realize you need one.

---

## 8. `/saved`

### 8.1 Navigation

A **fourth top-level nav item**, after Schedule, with `RiBookmarkLine`:

```ts
{ key: "saved", label: "Saved", href: "/saved", icon: RiBookmarkLine }
```

Signed out, `/saved` renders an explanatory empty state with a sign-in button —
it does not redirect. Reads are free in this product; there just isn't anything
to read yet.

### 8.2 Routing — gallery first, real routes

```
/saved                  → the folder gallery
/saved/all              → every saved section
/saved/uncategorized    → bookmarks with no folder
/saved/<folder_id>      → one folder
```

Real routes, not a query param: each folder is linkable, survives a refresh,
gets its own server render, and the back button behaves.

**The gallery** — animated gradient cards, `All` and `Uncategorized` first,
then folders in creation order, then a `+ New folder` card:

```
┌░▒▓█────────┐ ┌█▓▒░────────┐ ┌▒░█▓────────┐ ┌ ─ ─ ─ ─ ┐
│ All        │ │ Uncategor. │ │ Systems    │ │    +    │
│ 12 saved   │ │ 5 saved    │ │ 4 saved    │ │   New   │
│ 4113 3157… │ │ 4995 1004… │ │ 4113 4118… │ │ folder  │
└────────────┘ └────────────┘ └────────────┘ └ ─ ─ ─ ─ ┘
```

Each card shows its count and the first few course codes inside it, so the
gallery answers "what's in there" without a click. Cards carry a `⋯` for
rename and delete.

**A folder page** groups saved sections under their course — mirroring how
`/search` treats the course as the result unit, so the two screens agree about
what a "class" is:

```
[Fall 2026 ▾]                    [Select]  [Add from saved is on /schedule]

COMS4113  Operating Systems                                    3 pts
  §001  Nieh    MW 2:40–3:55   Mudd 833   🔔 12/80 · live          [+][★][⋯]
        Systems track · Spring backup
  §002  Yang    TuTh 1:10–2:25 Mudd 233   🔕 80/80 · as of 3d ago  [+][★][⋯]
        Systems track

COMS3157  Advanced Programming                                 4 pts
  §001  Hauser  MW 6:10–7:25   Havemeyer 309  🔕 45/60 · as of 9:12am [+][★][⋯]
```

The course header carries title, credits, and reputation summary; each saved
section carries its own meeting time, instructor, seats, folder chips, and
control cluster.

### 8.3 Seats and provenance

Every seat number renders with its provenance — the product rule holds here.

| Row | Rendering |
|---|---|
| Bell on | `12/80 · live` — pushed by the watchlist store's existing filtered realtime subscription |
| Bell off | `80/80 · as of 3 days ago` — the crawl's own `sourceAsOf`, **muted** past a staleness threshold, with the age spelled out |

An old number must never pass as a current one. Since bookmarks don't escalate
the crawl tier, an unwatched saved section in a cold subject can genuinely be
days old, and the row says so plainly.

### 8.4 Term filter

A term pill in the header, defaulting to the **current term**, reusing
`components/shell/term-switcher.tsx`. Older terms are one click away, with
their counts shown in the menu so nothing feels lost.

The filter is in the URL (`?term=20263`) so a folder link carries its scope.

### 8.5 Select mode

A `[Select]` button turns rows into checkboxes with a bottom action bar. The
realistic flow after a heavy browsing session is triaging twenty saves at
once, and doing that one `⋯` menu at a time is miserable.

```
[Done]  3 selected                              [Select all in view]
──────────────────────────────────────────────────────────────────
☑ COMS4113 §001    ☐ COMS4113 §002    ☑ COMS3157 §001
──────────────────────────────────────────────────────────────────
        [📁 File…]   [+ Add to plan]   [✖ Remove]
```

- **File…** opens the same folder popover, applied to all selected. Mixed
  state (some selected bookmarks in a folder, some not) renders the checkbox
  indeterminate; clicking it files all of them.
- **Add to plan** adds every selection to the primary plan for the term.
  Conflicts do not block it (§9.1) — the resulting toast names how many
  conflicts it created and links to `/schedule`.
- **Remove** is one bulk write with a single Undo toast.

Select mode is `Escape`-dismissible and keyboard-operable (space toggles the
focused row).

---

## 9. `/schedule` — "Add from saved"

A dropdown in the `ScheduleView` `toolbar` slot (which already exists for
exactly this), grouped by folder:

```
[Add from saved ▾]  [Export .ics]
 ├ ▨ Systems track
 │    COMS4113 §001  MW 2:40–3:55
 │    COMS4118 §001  TuTh 1:10–2:25   ⚠ overlaps ECON3211 §002
 ├ ▨ Spring backup
 │    COMS3157 §001  MW 6:10–7:25
 └ Uncategorized
      MATH2010 §002  TuTh 10:10–11:25
```

- Sections already in the plan are shown checked and toggle off.
- Each entry shows its meeting time — the thing you're actually deciding on.
- **Conflicts are marked, not blocked.** `analyzePlan` runs against
  `plan ∪ {candidate}` as the menu opens; conflicting entries get a `⚠` and
  name what they clash with. Adding still works, and the resulting toast says
  `Added COMS4118 §001 — overlaps ECON3211 §002`. This product's schedule
  screen is built to *show* conflicts, not to forbid them; people stage
  conflicts deliberately while deciding.
- Empty state inside the dropdown links to `/search`, not to `/saved` — if you
  have nothing saved, the folder page has nothing to offer you either.

The inverse direction (`[+ Add to plan]` per row and in Select mode) lives on
`/saved`, per §8.5.

**Not in v1:** the same dropdown on Home. Home renders the primary plan
read-only; adding belongs on the screen where you can see what you're breaking.

---

## 10. MCP

Agents get read **and** write, behind a new scope, with writes routed through
the approval flow that already exists.

```
scope: bookmarks:rw          (additive; catalog:read is unchanged)

tools:
  list_bookmark_folders()                     → folders + counts
  list_bookmarks({ folderId?, termCode? })    → saved sections, hydrated
  propose_bookmark({ sectionIds[], folderName? })
  propose_unbookmark({ sectionIds[] })
```

`propose_*` does **not** write. It creates a proposal that lands in
`components/schedule/proposal-review.tsx`, the surface that already exists for
agent-suggested plan changes, and the student accepts or rejects it there. An
agent that can silently fill your saved list is a worse product than one that
has to ask.

Rules:
- An agent may create a folder **only** as part of an accepted proposal, and
  only by name — never by id.
- The 50/500 caps apply identically; the proposal is rejected at review time
  with the reason if accepting it would breach one.
- Rate limiting reuses `lib/mcp/ratelimit.ts`.
- Bookmark data is owner-private and RLS-scoped like everything else; the MCP
  token's user is the only user it can see.

---

## 11. Edge cases

| Case | Behavior |
|---|---|
| Section is deleted by a crawl (course cancelled) | `on delete cascade` drops the bookmark. `/saved` shows a one-time "2 saved sections were removed — those sections no longer exist in the catalog" notice on next visit. |
| Section id changes (registrar renumbering) | `on update cascade` carries the bookmark. |
| Same section saved from two tabs | Idempotent — `on conflict (user_id, section_id) do nothing`. The store reconciles on the next load. |
| Bookmark limit hit | Error toast: "You've saved 500 sections — remove some to save more." with a link to `/saved`. |
| Folder limit hit | Inline error in the create field, not a toast — the failure happened where the user was looking. |
| Duplicate folder name | The existing folder is checked instead, with an inline "already exists" note. No second folder. |
| Bell on, section becomes unavailable | Existing alert-sweep behavior. Unchanged. |
| Undo pressed after the toast expired | Not possible — Undo lives only on the toast, and the toast holds the record. |
| Signed out mid-session (token expiry in another tab) | `onAuthStateChange` flips the store to `signed_out`; icons revert to outline; the next click raises the sign-in toast. |
| WebGL unavailable | Every folder card renders its static CSS gradient. No blank cards, no error. |

---

## 12. Build order

Each phase is independently reviewable and leaves the app working.

**Phase 1 — Foundation**
`0007_bookmarks.sql` applied to the real project. `lib/db/bookmarks.ts`.
`lib/bookmarks/store.ts` + hooks. RLS verified by an actual cross-user read
attempt. Unit tests for the store.

**Phase 2 — Toast infrastructure**
`lib/toast/store.ts`, `components/base/toast/**`, mounted in `AppShell`.
Migrate `PlanWriteDeniedError` and the watchlist rollback onto it.

**Phase 3 — The save interaction**
`bookmark-button.tsx` (motion + burst), `bookmark-menu.tsx`,
`folder-popover.tsx`. Wire into `/search`, the course page, the drawer, the
week grid. The watch bell moves into the overflow menu.

**Phase 4 — `/saved`**
`folder-art.ts`, static chips, animated `folder-card.tsx` with fallbacks, the
gallery route, folder routes, course-grouped list, term filter, select mode,
delete-folder dialog.

**Phase 5 — Schedule integration**
`add-from-saved.tsx` in the toolbar, conflict marking via `analyzePlan`.

**Phase 6 — MCP**
`bookmarks:rw` scope, the four tools, proposal routing.

---

## 13. Definition of done

- [ ] `supabase/migrations/0007_bookmarks.sql` **applied to the real Supabase
      project**, and RLS verified by attempting a cross-user read — not merely
      written.
- [ ] Unit tests under `npx vitest run` covering: optimistic toggle and
      rollback, many-to-many folder math, Uncategorized computation, term
      filtering, course grouping, folder-art determinism, and the cap errors.
- [ ] **Browser QA pass on the real flows**, with before/after screenshots:
      save from search → file into a brand-new folder from the toast → verify
      it on `/saved` → add it to the plan from the schedule dropdown → unsave
      with the bell on → Undo. Plus keyboard-only and `prefers-reduced-motion`
      passes.
- [ ] `npm run check` clean (typecheck + lint + tests), per `AGENTS.md`.
- [ ] No `any` without a comment justifying it.
- [ ] No raw hex and no `dark:` prefixes — BoardUI semantic tokens only,
      including the gradient stops.
```
