"use server";

import { cookies } from "next/headers";

import { createServerSupabaseClient } from "@/lib/db/client";
import {
  loadGuessDeck,
  loadOnboardingFeedPreview,
  resolveCourseCodes,
  searchCourses,
  warmCourseSearch,
  type CourseHit,
  type ResolvedCourse,
} from "@/lib/onboarding/server";
import type { FeedCard } from "@/lib/recommend/feed";
import { hasAnythingToMigrate, toMigrationPayload } from "@/lib/onboarding/migrate";
import {
  guestOnboardingStateSchema,
  ONBOARDING_COOKIE,
  ONBOARDING_COOKIE_MAX_AGE,
  ONBOARDING_COOKIE_VALUE,
} from "@/lib/onboarding/state";
import type { GuessDeck } from "@/lib/onboarding/guess";

/**
 * Server actions for the onboarding flow.
 *
 * ── Every argument is treated as hostile ────────────────────────────────────
 *
 * A server action is a public POST endpoint with a generated name. The guest
 * state in particular arrives from a `localStorage` key the user can edit in
 * devtools, so it is re-validated with `guestOnboardingStateSchema` at every
 * entry point rather than cast — the same schema the browser used to write it,
 * so there is exactly one definition of what a valid state is.
 *
 * ── The failure convention, borrowed from `app/profile/actions.ts` ──────────
 *
 * Every action returns `{ ok, error? }` rather than throwing. A thrown server
 * action surfaces as a generic error overlay in production, which tells a
 * student nothing; a returned message can be rendered next to the control that
 * caused it. Onboarding is the first screen a student ever sees, so an
 * unexplained overlay here is the most expensive one in the app.
 *
 * ── Nothing here writes anything until sign-in ──────────────────────────────
 *
 * `guessDeckAction`, `searchCoursesAction` and `resolveCoursesAction` are pure
 * reads. The only write is `migrateGuestStateAction`, and it needs a session.
 * That is what "guest-allowed through the first feed" means in code.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/* ==========================================================================
 * The guess grid
 * ========================================================================== */

export interface DeckResult extends ActionResult {
  deck?: GuessDeck;
}

/**
 * Rank (or re-rank) the guess-and-confirm deck.
 *
 * Called when the student reaches the grid and again after every confirmation
 * (debounced on the client). Implications of a tap — "you took Intro if you
 * took Data Structures" — apply locally and do not wait for this.
 */
export async function guessDeckAction(rawState: unknown): Promise<DeckResult> {
  const parsed = guestOnboardingStateSchema.safeParse(rawState);
  if (!parsed.success) return { ok: false, error: "We lost track of your answers. Start again?" };

  try {
    return { ok: true, deck: await loadGuessDeck(parsed.data) };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    console.error("onboarding: guess deck failed:", cause);
    return {
      ok: false,
      error:
        process.env.NODE_ENV === "development"
          ? `Guess deck failed: ${detail}`
          : "We could not work out what you might have taken. Search for your courses instead.",
    };
  }
}

/* ==========================================================================
 * Feed preview (guest, read-only)
 * ========================================================================== */

export interface FeedPreviewResult extends ActionResult {
  cards?: FeedCard[];
}

export async function onboardingFeedPreviewAction(rawState: unknown): Promise<FeedPreviewResult> {
  const parsed = guestOnboardingStateSchema.safeParse(rawState);
  if (!parsed.success) return { ok: false, error: "We lost track of your answers. Start again?" };

  try {
    return { ok: true, cards: await loadOnboardingFeedPreview(parsed.data) };
  } catch (cause) {
    console.error("onboarding: feed preview failed:", cause);
    return { ok: false, error: "We could not rank recommendations right now." };
  }
}

/* ==========================================================================
 * The escape hatches
 * ========================================================================== */

export interface SearchResult extends ActionResult {
  hits?: CourseHit[];
}

export async function searchCoursesAction(query: string): Promise<SearchResult> {
  if (typeof query !== "string") return { ok: false, error: "Type a course code or title." };

  try {
    return { ok: true, hits: await searchCourses(query) };
  } catch (cause) {
    console.error("onboarding: course search failed:", cause);
    return { ok: false, error: "Search is not answering right now." };
  }
}

/** Warm the listing cache during degree questions so the first search is a scan. */
export async function warmCourseSearchAction(): Promise<ActionResult> {
  try {
    await warmCourseSearch();
    return { ok: true };
  } catch (cause) {
    console.error("onboarding: course search warm failed:", cause);
    return { ok: false };
  }
}

export interface ResolveResult extends ActionResult {
  courses?: ResolvedCourse[];
}

/**
 * Turn codes — typed, or read off a transcript — into storable rows.
 *
 * Codes our catalog does not know still come back, marked `inCatalog: false`.
 * That is the whole contract: unmatched coursework is accepted and marked,
 * never blocked. Rejecting it would make the product useless for transfers,
 * study-abroad returnees and anyone with AP credit — and it is precisely why
 * `student_courses.course_id` is not a foreign key.
 */
export async function resolveCoursesAction(codes: unknown): Promise<ResolveResult> {
  if (!Array.isArray(codes) || codes.some((code) => typeof code !== "string")) {
    return { ok: false, error: "That did not look like a list of course codes." };
  }
  // A transcript is tens of rows. The cap matches `addCoursesAction`'s.
  if (codes.length > 400) return { ok: false, error: "That is more rows than a transcript has." };

  try {
    return { ok: true, courses: await resolveCourseCodes(codes as string[]) };
  } catch (cause) {
    console.error("onboarding: course resolution failed:", cause);
    return { ok: false, error: "We could not look those up. Try again in a moment." };
  }
}

/* ==========================================================================
 * Completion
 * ========================================================================== */

/**
 * Mark onboarding done, so a returning visitor is not marched through it again.
 *
 * A cookie rather than `localStorage` because the "should this request go to
 * onboarding" decision has to be made on the server, before any JavaScript
 * runs. Deciding it in the browser would render the destination and then yank
 * it away, which reads as a bug rather than as a redirect.
 *
 * `httpOnly` is deliberately FALSE. This cookie authorises nothing — it is a
 * "has seen the wizard" flag — and the client needs to read it to know whether
 * to offer "redo onboarding". A forged value costs a student nothing except a
 * screen they can reach from a link.
 */
export async function completeOnboardingAction(): Promise<ActionResult> {
  const store = await cookies();
  store.set(ONBOARDING_COOKIE, ONBOARDING_COOKIE_VALUE, {
    maxAge: ONBOARDING_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}

/* ==========================================================================
 * Guest → account
 * ========================================================================== */

export interface MigrationResult extends ActionResult {
  /** Rows written. Reported so the UI can say "we saved 27 courses". */
  courses?: number;
  /** True when there was nothing to move. Not a failure. */
  empty?: boolean;
}

/**
 * Flush the guest's onboarding into their new account, in ONE transaction.
 *
 * The single-transaction requirement is the reason this is an RPC and not two
 * upserts: a student whose profile landed and whose thirty confirmed courses
 * did not has a degree audit against an empty transcript and no way to tell
 * that anything was lost. `apply_onboarding_state` (migration 0033) is a
 * plpgsql function, so its body either commits whole or not at all, and it is
 * `security invoker`, so it can only ever write the caller's own rows.
 *
 * The caller must NOT clear the local guest state until this returns `ok`.
 * Clearing on failure is the one bug that loses a student's entire session.
 */
export async function migrateGuestStateAction(rawState: unknown): Promise<MigrationResult> {
  const parsed = guestOnboardingStateSchema.safeParse(rawState);
  if (!parsed.success) {
    return { ok: false, error: "We could not read your saved answers." };
  }

  if (!hasAnythingToMigrate(parsed.data)) return { ok: true, empty: true, courses: 0 };

  const client = await createServerSupabaseClient();
  if (!client) return { ok: false, error: "Accounts are not available right now." };

  const { data: userData } = await client.auth.getUser();
  if (!userData?.user) return { ok: false, error: "Sign in first, then we'll save this." };

  const payload = toMigrationPayload(parsed.data);

  /*
   * The cast is unavoidable and it is narrowed to one line.
   *
   * `lib/db/schema.ts` holds a hand-maintained `Database` type whose `Functions`
   * map does not carry `apply_onboarding_state` — that function arrived in
   * migration 0033, after the type was last written, and that file belongs to
   * another lane. Casting the CLIENT rather than the argument keeps the payload
   * fully type-checked: `toMigrationPayload` still has to return a
   * `MigrationPayload`, and only the RPC name loses its check.
   */
  const rpc = client.rpc.bind(client) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await rpc("apply_onboarding_state", { p_state: payload });

  if (error) {
    console.error("onboarding: guest migration failed:", error);
    return { ok: false, error: "We could not save your answers. Nothing was lost — try again." };
  }

  /*
   * The RPC returns `{ ok, courses, programs, tags }`. Read defensively: the
   * function's return shape is not in the generated `Database` type (it was
   * added after the last generation), so this is the one place a cast is
   * unavoidable, and it is narrowed rather than trusted.
   */
  const written =
    data !== null && typeof data === "object"
      ? (data as { courses?: unknown }).courses
      : undefined;

  return {
    ok: true,
    courses: typeof written === "number" ? written : payload.courses.length,
  };
}
