"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RiAddLine, RiSearchLine } from "@remixicon/react";

import { searchCoursesAction, warmCourseSearchAction } from "@/app/onboarding/actions";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { displayCourseTitle } from "@/lib/onboarding/course-title";
// Type-only: `server.ts` reaches the database and must not enter this bundle.
import type { CourseHit } from "@/lib/onboarding/server";
import { formatCourseId, parseBulletinCode } from "@/lib/requirements/code";
import { cx } from "@/utils/cx";

/**
 * Catalog search for the profile course picker.
 *
 * Same action, debounce, and ranking as onboarding's `CourseSearch`: a
 * substring scan over the two active terms, by code or title. The search
 * screen's worker index never enters this dialog — that is a multi-megabyte
 * artifact, and this box does not need it.
 */

export interface CatalogPick {
  courseId: string;
  code: string;
  title: string | null;
  points: number | null;
}

export interface CatalogSearchProps {
  /** Ids already on the record or in the current batch. */
  blockedIds: ReadonlySet<string>;
  onPick: (pick: CatalogPick) => void;
  query: string;
  onQueryChange: (query: string) => void;
}

const DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 2;

export function CatalogSearch({
  blockedIds,
  onPick,
  query,
  onQueryChange,
}: CatalogSearchProps) {
  const [hits, setHits] = useState<CourseHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const latestQuery = useRef("");

  const trimmed = query.trim();
  const isSearchable = trimmed.length >= MIN_QUERY_LENGTH;
  const visibleHits = isSearchable ? hits : [];
  const visibleError = isSearchable ? error : null;

  // A code the catalog did not return still has a shape we can store.
  const unmatchedCode = unmatchedFromQuery(trimmed, visibleHits, blockedIds);

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
          return;
        }
        setError(null);
        setHits(result.hits ?? []);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        id="profile-catalog-search"
        label="Search courses"
        placeholder="COMS 3134, organic chemistry…"
        value={query}
        onChange={onQueryChange}
        leadingIcon={RiSearchLine}
        hint={
          isPending && isSearchable
            ? "Searching the catalog…"
            : "Code or title — the same search as setup."
        }
      />

      {visibleError ? (
        <p className="text-caption-1-regular text-text-error-primary" role="alert">
          {visibleError}
        </p>
      ) : null}

      {isSearchable && visibleHits.length === 0 && !isPending && !visibleError ? (
        <p className="text-caption-1-regular text-pretty text-text-secondary">
          Nothing in the two active terms matches that. Older courses, transfer
          credit and AP can still be added by code, or imported from a transcript.
        </p>
      ) : null}

      {visibleHits.length > 0 ? (
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-2lg border border-border-table bg-background-full p-1">
          {visibleHits.map((hit) => {
            const blocked = blockedIds.has(hit.courseId);
            return (
              <li key={hit.courseId}>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() =>
                    onPick({
                      courseId: hit.courseId,
                      code: hit.code,
                      title: hit.title,
                      points: hit.points,
                    })
                  }
                  className={cx(
                    "flex w-full min-h-10 items-center gap-2 rounded-lg px-2 text-left pointer-coarse:min-h-11",
                    blocked
                      ? "cursor-default text-text-tertiary"
                      : "cursor-pointer transition-colors duration-150 hover:bg-background-secondary-hover",
                  )}
                >
                  <RiAddLine
                    className={
                      blocked
                        ? "size-4 shrink-0 opacity-0"
                        : "size-4 shrink-0 text-foreground-icon-tertiary"
                    }
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 py-1">
                    <span className="block text-caption-1-medium tabular-nums text-text-primary">
                      {hit.code}
                    </span>
                    <span className="block truncate text-caption-2-regular text-text-secondary">
                      {displayCourseTitle(hit.title)}
                    </span>
                  </span>
                  {blocked ? (
                    <span className="shrink-0 text-caption-2-regular text-text-tertiary">
                      added
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Wait for the in-flight search — a code that is about to appear in
          hits should not also be offered as an unmatched fallback. */}
      {unmatchedCode && !isPending ? (
        <Button
          size="small"
          variant="secondary"
          leadingIcon={RiAddLine}
          onClick={() =>
            onPick({
              courseId: unmatchedCode.courseId,
              code: unmatchedCode.code,
              title: null,
              points: null,
            })
          }
          className="self-start"
        >
          Add {unmatchedCode.code} anyway
        </Button>
      ) : null}
    </div>
  );
}

/** Valid Columbia code that search did not find in the two active terms. */
export function unmatchedFromQuery(
  trimmed: string,
  hits: ReadonlyArray<{ courseId: string }>,
  blockedIds: ReadonlySet<string>,
): { courseId: string; code: string } | null {
  if (trimmed.length < 4) return null;
  const parsed = parseBulletinCode(trimmed);
  if (!parsed) return null;
  if (blockedIds.has(parsed.courseId)) return null;
  if (hits.some((hit) => hit.courseId === parsed.courseId)) return null;
  return { courseId: parsed.courseId, code: formatCourseId(parsed.courseId) };
}
