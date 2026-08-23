"use client";

import { useEffect, useState } from "react";
import { RiEyeLine, RiArrowUpLine, RiArrowDownLine, RiPulseLine } from "@remixicon/react";
import Link from "next/link";

import { ProvenanceStamp, SeatPill } from "@/components/course/seat-state";
import { WatchButton } from "@/components/watch/watch-button";
import { useWatchlist } from "@/hooks/use-watchlist";
import { getCoursesByIds, getSections } from "@/lib/data/catalog";
import { getRecentSeatMovement, type SeatSnapshot } from "@/lib/db/seat-history";
import type { Course, Section, TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * The Home rail: watched sections with live seat state, and the movement feed
 * beneath them (spec §5).
 *
 * ── Why this is a client component when the rest of Home is not ────────────
 *
 * Home is a server component on purpose — the week grid is meaningful markup
 * on first paint. This rail cannot be, and the reason is not "it has state":
 * it is that the whole point of the rail is to be *right now*. A
 * server-rendered watchlist is a photograph of the moment the request was
 * served, and during a registration window that is old before it is read. The
 * rail subscribes to Postgres realtime and repaints when a seat moves, which
 * is the feature.
 *
 * It renders as a self-contained column so Home's grid keeps its server
 * subtree intact around it.
 *
 * ── The feed shows drops as well as opens ──────────────────────────────────
 *
 * `getRecentSeatMovement` deliberately does not filter to "a seat opened". A
 * section going from 3 open to 1 open is exactly the signal that should stop
 * someone deliberating, and a feed that only carries good news would be a
 * worse instrument than no feed.
 */

export interface WatchlistRailProps {
  termCode: TermCode;
  className?: string;
}

interface Loaded {
  sections: Section[];
  courses: Map<string, Course>;
}

const NOTHING: Loaded = { sections: [], courses: new Map() };

export function WatchlistRail({ termCode, className }: WatchlistRailProps) {
  const { status, watched, seats } = useWatchlist();
  const watchedKey = [...watched].sort().join(",");

  const [loaded, setLoaded] = useState<{ key: string; data: Loaded }>({ key: "", data: NOTHING });
  const [movement, setMovement] = useState<{ key: string; rows: SeatSnapshot[] }>({
    key: "",
    rows: [],
  });

  // Derived from the key rather than cleared in an effect, so removing the last
  // watch empties the rail on the same commit as the click.
  const resolved = loaded.key === watchedKey ? loaded.data : NOTHING;
  const feed = movement.key === watchedKey ? movement.rows : [];

  useEffect(() => {
    if (!watchedKey) return;
    const ids = watchedKey.split(",");
    let active = true;

    void (async () => {
      try {
        const sections = await getSections(ids);
        const courses = await getCoursesByIds(
          [...new Set(sections.map((section) => section.courseId))],
          termCode,
        );
        if (!active) return;
        setLoaded({
          key: watchedKey,
          data: { sections, courses: new Map(courses.map((course) => [course.courseId, course])) },
        });
      } catch {
        // An unresolvable watchlist renders as empty rather than as an error
        // banner over the week grid, which is the part of Home that matters.
      }
    })();

    void getRecentSeatMovement(ids, 12).then((rows) => {
      if (active) setMovement({ key: watchedKey, rows });
    });

    return () => {
      active = false;
    };
  }, [watchedKey, termCode]);

  if (status === "signed_out") {
    return (
      <RailShell className={className}>
        <p className="text-caption-1-regular text-text-secondary">
          Sign in with your Columbia or Barnard account to watch sections. We email every watcher the moment a
          seat opens — all of them at once, never staggered.
        </p>
      </RailShell>
    );
  }

  if (watched.size === 0) {
    return (
      <RailShell className={className}>
        <p className="text-caption-1-regular text-text-secondary">
          Nothing watched yet. Open a course and press Watch on a section to be emailed when a seat
          opens.
        </p>
      </RailShell>
    );
  }

  return (
    <RailShell className={className} count={watched.size}>
      <ul className="flex list-none flex-col gap-2">
        {resolved.sections.map((section) => {
          const course = resolved.courses.get(section.courseId);
          const live = seats.get(section.sectionId);
          // Replaced wholesale, provenance included: a fresh count under a
          // stale "as of" is worse than either half on its own.
          const shown = live
            ? {
                ...section,
                enrollmentCount: live.enrollmentCount,
                enrollmentCap: live.enrollmentCap,
                waitlistCount: live.waitlistCount,
                status: live.status,
                sourceAsOf: live.sourceAsOf,
              }
            : section;

          return (
            <li
              key={section.sectionId}
              className="flex flex-col gap-1.5 rounded-2lg border border-border-table bg-background-primary-default p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/course/${section.courseId}`}
                  className="min-w-0 text-caption-1-medium text-text-primary hover:underline"
                >
                  {course ? `${course.subjectCode} ${course.number}` : section.courseId}
                  <span className="text-text-tertiary"> · {section.sectionCode}</span>
                  {course ? (
                    <span className="block truncate text-caption-2-regular text-text-secondary">
                      {course.title}
                    </span>
                  ) : null}
                </Link>
                <SeatPill section={shown} className="shrink-0" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <ProvenanceStamp sourceAsOf={shown.sourceAsOf} />
                <WatchButton
                  sectionId={section.sectionId}
                  sectionCode={section.sectionCode}
                  iconOnly
                />
              </div>
            </li>
          );
        })}
      </ul>

      <MovementFeed rows={feed} courses={resolved.courses} sections={resolved.sections} />
    </RailShell>
  );
}

function RailShell({
  children,
  count,
  className,
}: {
  children: React.ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "flex flex-col gap-3 rounded-3xl border border-border-table bg-background-secondary-default p-4",
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <RiEyeLine className="size-4 text-foreground-icon-tertiary" aria-hidden />
        <h2 className="text-body-semibold text-text-primary">Watchlist</h2>
        {count ? (
          <span className="text-caption-1-regular text-text-tertiary">{count}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/**
 * Recent movement across watched sections.
 *
 * Each row is one change: the table is change-only, so there is no such thing
 * here as a row that says "still 42". Direction is computed against the row
 * before it for the same section, and the first row we hold for a section gets
 * no arrow rather than a guessed one.
 */
function MovementFeed({
  rows,
  courses,
  sections,
}: {
  rows: SeatSnapshot[];
  courses: Map<string, Course>;
  sections: Section[];
}) {
  if (rows.length === 0) return null;

  const courseIdBySection = new Map(sections.map((s) => [s.sectionId, s.courseId]));
  const sectionCode = new Map(sections.map((s) => [s.sectionId, s.sectionCode]));

  /*
   * Rows arrive newest-first, so a row's previous reading is further DOWN the
   * list — which means the deltas have to be computed walking backwards. Doing
   * it in list order attributes each change to the reading before the one it
   * actually happened at, and inverts its sign.
   *
   * The oldest row we hold for a section gets no delta rather than a delta
   * against nothing: it is the start of what we know, not a change from zero.
   */
  const deltas: (number | null)[] = new Array(rows.length).fill(null);
  const olderCount = new Map<string, number>();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const older = olderCount.get(row.sectionId);
    deltas[index] = older === undefined ? null : row.enrollmentCount - older;
    olderCount.set(row.sectionId, row.enrollmentCount);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border-table pt-3">
      <div className="flex items-center gap-2">
        <RiPulseLine className="size-3.5 text-foreground-icon-tertiary" aria-hidden />
        <h3 className="text-caption-1-medium text-text-secondary">Recent movement</h3>
      </div>
      <ul className="flex list-none flex-col gap-1">
        {rows.map((row, index) => {
          const delta = deltas[index];
          const courseId = courseIdBySection.get(row.sectionId);
          const course = courseId ? courses.get(courseId) : undefined;
          return (
            <li
              key={`${row.sectionId}-${row.observedAt}`}
              className="flex items-baseline justify-between gap-2 text-caption-2-regular"
            >
              <span className="min-w-0 truncate text-text-secondary">
                {course ? `${course.subjectCode} ${course.number}` : row.sectionId}
                <span className="text-text-tertiary">
                  {" "}
                  {sectionCode.get(row.sectionId) ?? ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 tabular-nums text-text-tertiary">
                {/*
                  The number shown is ENROLLMENT, so the arrow reads against
                  the student, not with it: enrollment up means seats gone.
                  Colouring "up" green because up is usually good would be
                  exactly backwards here.
                */}
                {delta !== null && delta !== 0 ? (
                  <span
                    className="flex items-center gap-0.5"
                    title={
                      delta > 0
                        ? `${delta} more enrolled since the previous reading`
                        : `${Math.abs(delta)} seat${Math.abs(delta) === 1 ? "" : "s"} freed since the previous reading`
                    }
                  >
                    {delta > 0 ? (
                      <RiArrowUpLine className="size-3 text-amber-500" aria-hidden />
                    ) : (
                      <RiArrowDownLine className="size-3 text-emerald-500" aria-hidden />
                    )}
                    {Math.abs(delta)}
                  </span>
                ) : null}
                {row.enrollmentCount}
                {row.enrollmentCap !== null ? `/${row.enrollmentCap}` : ""}
                <time dateTime={row.observedAt}>{shortTime(row.observedAt)}</time>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function shortTime(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
