"use client";

import { useMemo, useState, useTransition } from "react";
import { RiAddLine } from "@remixicon/react";

import { addCoursesAction } from "@/app/profile/actions";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { CatalogSearch, type CatalogPick } from "./catalog-search";
import { ProfileModal } from "./profile-modal";

/**
 * Add coursework by hand.
 *
 * Search is the same catalog scan onboarding uses: code or title, two active
 * terms, debounced. Outstanding-requirement suggestions sit under an empty
 * box because those are the courses this student is most likely adding.
 *
 * A code the catalog does not know is still addable. Transfer, AP, and
 * archived terms are legitimate rows — `student_courses.course_id` is not a
 * foreign key — and the coursework card already marks them.
 */

export interface CourseSuggestion {
  courseId: string;
  code: string;
  title: string | null;
  /** The requirement it would count toward, for context. */
  requirement: string;
}

export interface CoursePickerProps {
  suggestions: CourseSuggestion[];
  /** Course ids already on the record — never offered twice. */
  takenCourseIds: string[];
  /** False when nobody is signed in; the trigger stays visible but inert. */
  signedIn?: boolean;
  className?: string;
}

interface Draft {
  courseId: string;
  code: string;
  title: string | null;
  points: number | null;
}

export function CoursePicker({
  suggestions,
  takenCourseIds,
  signedIn = true,
  className,
}: CoursePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const taken = useMemo(() => new Set(takenCourseIds), [takenCourseIds]);
  const draftIds = useMemo(() => new Set(drafts.map((draft) => draft.courseId)), [drafts]);
  const blockedIds = useMemo(() => new Set([...taken, ...draftIds]), [taken, draftIds]);

  const isSearching = query.trim().length >= 2;

  const visibleSuggestions = useMemo(() => {
    if (isSearching) return [];
    return suggestions
      .filter((suggestion) => !blockedIds.has(suggestion.courseId))
      .slice(0, 12);
  }, [suggestions, blockedIds, isSearching]);

  const addDraft = (pick: CatalogPick) => {
    if (blockedIds.has(pick.courseId)) return;
    setDrafts((current) => [...current, pick]);
    setQuery("");
    setError(null);
  };

  const close = () => {
    setIsOpen(false);
    setQuery("");
    setError(null);
  };

  const submit = () => {
    if (drafts.length === 0) {
      close();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addCoursesAction(
        drafts.map((draft) => ({
          code: draft.courseId,
          source: "picker",
          points: draft.points,
        })),
      );
      if (!result.ok) {
        setError(result.error ?? "Could not save those.");
        return;
      }
      setDrafts([]);
      close();
    });
  };

  return (
    <>
      <Button
        size="small"
        variant="secondary"
        leadingIcon={RiAddLine}
        onClick={() => setIsOpen(true)}
        disabled={!signedIn}
        title={signedIn ? undefined : "Sign in to keep a course record."}
        className={className}
      >
        Add a course
      </Button>

      <ProfileModal
        isOpen={isOpen}
        onClose={close}
        title="Add coursework"
        description="Search by code or title. You can also pick from requirements you still need."
        footer={
          <>
            <Button size="small" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button size="small" disabled={isPending || drafts.length === 0} onClick={submit}>
              {isPending
                ? "Saving…"
                : drafts.length === 0
                  ? "Add"
                  : `Add ${drafts.length} course${drafts.length === 1 ? "" : "s"}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <CatalogSearch
            blockedIds={blockedIds}
            onPick={addDraft}
            query={query}
            onQueryChange={setQuery}
          />

          {drafts.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-caption-1-medium text-text-secondary">
                Ready to add ({drafts.length})
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {drafts.map((draft) => (
                  <li key={draft.courseId}>
                    <button
                      type="button"
                      aria-label={`Remove ${draft.code} from this batch`}
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter((entry) => entry.courseId !== draft.courseId),
                        )
                      }
                      className="rounded-md bg-background-secondary-default px-1.5 py-1 text-caption-1-medium tabular-nums text-text-secondary outline-none transition-colors duration-150 hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                    >
                      {draft.code} ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {visibleSuggestions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-caption-1-medium text-text-secondary">
                From your outstanding requirements
              </p>
              <ul className="flex flex-col gap-1">
                {visibleSuggestions.map((suggestion) => (
                  <li key={suggestion.courseId}>
                    <button
                      type="button"
                      onClick={() =>
                        addDraft({
                          courseId: suggestion.courseId,
                          code: suggestion.code,
                          title: suggestion.title,
                          points: null,
                        })
                      }
                      className={cx(
                        "flex w-full min-h-10 items-center gap-2 rounded-2lg p-2 text-left outline-none transition-colors duration-150 pointer-coarse:min-h-11",
                        "hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                      )}
                    >
                      <RiAddLine
                        className="size-4 shrink-0 text-foreground-icon-tertiary"
                        aria-hidden
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-body-medium tabular-nums text-text-primary">
                          {suggestion.code}
                          {suggestion.title ? (
                            <span className="text-body-regular text-text-secondary">
                              {" "}
                              {suggestion.title}
                            </span>
                          ) : null}
                        </span>
                        <span className="truncate text-caption-2-regular text-text-tertiary">
                          {suggestion.requirement}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="text-caption-1-regular text-text-error-primary" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </ProfileModal>
    </>
  );
}
