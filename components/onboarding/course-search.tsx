"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RiAddLine, RiSearchLine } from "@remixicon/react";

import { Input } from "@/components/base/input/input";
import { searchCoursesAction, warmCourseSearchAction } from "@/app/onboarding/actions";
// Type-only: `server.ts` reaches the database and must not enter this bundle.
import type { CourseHit } from "@/lib/onboarding/server";
import { displayCourseTitle } from "@/lib/onboarding/course-title";
import { haptic } from "@/lib/haptics";

/**
 * The release valve on the guesses.
 *
 * Any generated list is wrong for somebody: the transfer student, the double
 * major the registry does not carry, the person who took a language course for
 * fun. Without a search box those students hit a wall on the second screen of
 * their first visit, which is the most expensive place in the product to hit
 * one.
 *
 * Search sits above the suggestion strip so it is the first correction tool,
 * not an afterthought under twenty chips. Debounced rather than submit-on-enter
 * because the answer is usually two characters into a course code.
 */

export interface CourseSearchProps {
  /** Ids already on the record, so the list can say "added" instead of offering it twice. */
  confirmedIds: ReadonlySet<string>;
  onAdd: (hit: CourseHit) => void;
  /**
   * The question the box answers. Defaults to the coursework screen's past
   * tense; the planned screen asks about this term with the same search.
   */
  label?: string;
}

/** Long enough to swallow a burst of typing, short enough not to feel laggy. */
const DEBOUNCE_MS = 180;

/**
 * Below this, a search is not worth a round trip: "c" matches most of the
 * catalog and answers a question nobody asked.
 */
const MIN_QUERY_LENGTH = 2;

export function CourseSearch({
  confirmedIds,
  onAdd,
  label = "Search for a course you took",
}: CourseSearchProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CourseHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /** Query we have actually answered. Empty-state must not flash during debounce. */
  const [settledQuery, setSettledQuery] = useState("");

  /*
   * Guards an out-of-order response. The action is called per keystroke-burst,
   * and a slow answer for "co" arriving after a fast one for "coms 3134" would
   * replace the right list with a stale one — the classic search race, and the
   * reason this is a ref rather than state.
   */
  const latestQuery = useRef("");

  const trimmed = query.trim();
  const isSearchable = trimmed.length >= MIN_QUERY_LENGTH;

  /*
   * Derived, not stored. Clearing the list for a too-short query used to be two
   * `setState` calls at the top of the effect below, which is a render
   * scheduled to undo a render that already happened — and the reason React's
   * `set-state-in-effect` rule refuses it. The results simply do not exist
   * while the box is empty, so the render says that rather than the state
   * remembering it.
   */
  const visibleHits = isSearchable ? hits : [];
  const visibleError = isSearchable ? error : null;

  useEffect(() => {
    void warmCourseSearchAction();
  }, []);

  useEffect(() => {
    const next = query.trim();
    latestQuery.current = next;

    if (next.length < MIN_QUERY_LENGTH) return;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchCoursesAction(next);
        if (latestQuery.current !== next) return;
        if (!result.ok) {
          setError(result.error ?? "Search failed.");
          setSettledQuery(next);
          return;
        }
        setError(null);
        setHits(result.hits ?? []);
        setSettledQuery(next);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <section className="mx-auto flex w-full flex-col gap-2">
      <label
        htmlFor="onboarding-course-search"
        className="text-center text-body-medium text-text-primary"
      >
        {label}
      </label>

      <Input
        id="onboarding-course-search"
        aria-label={label}
        placeholder="University Writing, COMS 3134…"
        value={query}
        onChange={setQuery}
        leadingIcon={RiSearchLine}
        size="medium"
        fieldClassName="py-3 shadow-sm"
      />

      {visibleError ? (
        <p className="text-center text-caption-1-regular text-text-error-primary">{visibleError}</p>
      ) : null}

      {isSearchable &&
      visibleHits.length === 0 &&
      !isPending &&
      !visibleError &&
      settledQuery === trimmed ? (
        <p className="text-center text-caption-1-regular text-text-secondary">
          Nothing in the two active terms matches that. If it was an older course, transfer credit
          or AP, import your transcript — we keep coursework we cannot find and mark it rather than
          refusing it.
        </p>
      ) : null}

      {visibleHits.length > 0 ? (
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-2lg border border-border-table bg-background-full p-1">
          {visibleHits.map((hit) => {
            const isAdded = confirmedIds.has(hit.courseId);
            return (
              <li key={hit.courseId}>
                <button
                  type="button"
                  disabled={isAdded}
                  onClick={() => {
                    haptic("success");
                    onAdd(hit);
                  }}
                  className={
                    isAdded
                      ? "flex w-full min-h-10 cursor-default items-center gap-2 rounded-lg px-2 text-left text-text-tertiary pointer-coarse:min-h-11"
                      : "flex w-full min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-background-secondary-hover pointer-coarse:min-h-11"
                  }
                >
                  <RiAddLine
                    className={isAdded ? "size-4 shrink-0 opacity-0" : "size-4 shrink-0 text-text-tertiary"}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 py-1">
                    <span className="block text-caption-1-medium text-text-primary">
                      {displayCourseTitle(hit.title)}
                    </span>
                    <span className="block truncate text-caption-2-regular text-text-secondary">
                      {hit.code}
                    </span>
                  </span>
                  {isAdded ? (
                    <span className="shrink-0 text-caption-2-regular text-text-tertiary">added</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
