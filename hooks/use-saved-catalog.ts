"use client";

import { useEffect, useState } from "react";

import { getCoursesByIds, getSections } from "@/lib/data/catalog";
import type { Course, Section, TermCode } from "@/lib/types";

/**
 * Turns saved section ids into the catalog records `/saved` renders.
 *
 * ── Why this is a client fetch and not a server render ────────────────────
 *
 * The bookmark store is the only thing that knows what is saved, and it lives
 * in the browser behind the reader's Supabase session. A server component
 * cannot ask it, and a server round trip that could would be answering with
 * data the store may already have moved past — bookmarks change on click, not
 * on navigation.
 *
 * ── Keyed by the id set, not cleared in an effect ──────────────────────────
 *
 * `resolved` is derived by comparing the fetched key against the current one,
 * so removing the last saved class empties the list on the same commit as the
 * click rather than one paint later. The alternative — an effect that calls
 * `setState(null)` when the ids change — renders one frame of stale rows, and
 * during a fast Select-mode purge that frame is a row you just deleted looking
 * like it survived.
 */

export interface SavedCatalog {
  sections: Section[];
  courses: Map<string, Course>;
  /** True while the first answer for the current id set is outstanding. */
  isResolving: boolean;
  /** Set when the lookup failed outright, so the page can say so. */
  error: string | null;
}

const NOTHING: SavedCatalog = {
  sections: [],
  courses: new Map(),
  isResolving: false,
  error: null,
};

interface Resolved {
  key: string;
  sections: Section[];
  courses: Map<string, Course>;
  error: string | null;
}

export function useSavedCatalog(sectionIds: readonly string[]): SavedCatalog {
  // A stable string key: a fresh array identity on every render would refetch
  // the whole catalog every time any unrelated part of the page updates.
  const key = [...sectionIds].sort().join(",");
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!key) return;
    let active = true;

    void (async () => {
      try {
        const sections = await getSections(key.split(","));

        /*
         * `getCoursesByIds` is term-scoped — it filters the embedded sections
         * by `term_code` and defaults to the current term. A saved list spans
         * terms by design (you shortlist Spring classes during Fall
         * registration), so one call would silently drop every course whose
         * only saved section is in the other term, and those sections would
         * then be grouped under a course that does not exist and dropped
         * again by `groupSavedByCourse`.
         *
         * One request per term present, merged. In practice that is one or
         * two: the saved set only ever spans the terms the reader has been
         * browsing.
         */
        const idsByTerm = new Map<TermCode, Set<string>>();
        for (const section of sections) {
          const bucket = idsByTerm.get(section.termCode) ?? new Set<string>();
          bucket.add(section.courseId);
          idsByTerm.set(section.termCode, bucket);
        }

        const perTerm = await Promise.all(
          [...idsByTerm].map(([termCode, courseIds]) =>
            getCoursesByIds([...courseIds], termCode),
          ),
        );
        if (!active) return;

        const courses = new Map<string, Course>();
        for (const course of perTerm.flat()) courses.set(course.courseId, course);

        setResolved({ key, sections, courses, error: null });
      } catch (cause) {
        if (!active) return;
        setResolved({
          key,
          sections: [],
          courses: new Map(),
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [key]);

  if (!key) return NOTHING;
  if (resolved?.key !== key) return { ...NOTHING, isResolving: true };

  return {
    sections: resolved.sections,
    courses: resolved.courses,
    isResolving: false,
    error: resolved.error,
  };
}
