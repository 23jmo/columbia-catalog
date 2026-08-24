"use client";

import { useMemo, useState, useTransition } from "react";
import { RiAddLine, RiSearchLine } from "@remixicon/react";

import { addCoursesAction } from "@/app/profile/actions";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { formatCourseId, parseBulletinCode } from "@/lib/requirements/code";
import { cx } from "@/utils/cx";
import { ProfileModal } from "./profile-modal";

/**
 * Add coursework by hand.
 *
 * ── Why this is a code box and not a catalog search ─────────────────────────
 *
 * The app's search index is a multi-megabyte artifact loaded into a worker for
 * the search screen. Pulling it in here to help someone type eight course codes
 * they already know would cost more than it returns, and a student entering
 * their own history is reading a transcript — they have the codes in front of
 * them.
 *
 * What the box does give them is resolution as they type: `MATH UN1201`,
 * `MATHUN1201` and `MATH1201UN` are the same course, and the field says which
 * one it landed on before anything is saved. That matters more than
 * autocomplete, because the two notations Columbia itself publishes are
 * genuinely different orderings of the same three parts — see
 * `lib/requirements/code.ts`.
 *
 * Above it sits the list that IS worth suggesting: courses named by the
 * student's own outstanding requirements. Short, relevant, and already
 * resolved.
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

  /** What the typed text resolves to, if anything. Shown before it is added. */
  const typed = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length < 4) return null;
    const parsed = parseBulletinCode(trimmed);
    if (!parsed) return null;
    return { courseId: parsed.courseId, code: formatCourseId(parsed.courseId) };
  }, [query]);

  const filteredSuggestions = useMemo(() => {
    const needle = query.trim().toUpperCase().replace(/\s+/g, "");
    return suggestions
      .filter((suggestion) => !taken.has(suggestion.courseId))
      .filter((suggestion) => !draftIds.has(suggestion.courseId))
      .filter((suggestion) => {
        if (needle.length === 0) return true;
        return (
          suggestion.courseId.includes(needle) ||
          suggestion.title?.toUpperCase().includes(query.trim().toUpperCase()) === true
        );
      })
      .slice(0, 12);
  }, [suggestions, query, taken, draftIds]);

  const addDraft = (draft: Draft) => {
    if (taken.has(draft.courseId) || draftIds.has(draft.courseId)) return;
    setDrafts((current) => [...current, draft]);
    setQuery("");
    setError(null);
  };

  const submit = () => {
    if (drafts.length === 0) {
      setIsOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addCoursesAction(
        drafts.map((draft) => ({ code: draft.courseId, source: "picker" })),
      );
      if (!result.ok) {
        setError(result.error ?? "Could not save those.");
        return;
      }
      setDrafts([]);
      setIsOpen(false);
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
        onClose={() => setIsOpen(false)}
        title="Add coursework"
        description="Type a course code the way your transcript prints it. We understand both of Columbia's notations."
        footer={
          <>
            <Button size="small" variant="secondary" onClick={() => setIsOpen(false)}>
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
          <Input
            label="Course code"
            placeholder="MATH UN1201"
            value={query}
            onChange={setQuery}
            leadingIcon={RiSearchLine}
            hint={
              typed
                ? `Reads as ${typed.code}`
                : query.trim().length >= 4
                  ? "Not a Columbia course code yet — it needs a subject and a four-digit number."
                  : "e.g. MATH UN1201, COMS W3134, ECON UN3211"
            }
          />

          {typed && !taken.has(typed.courseId) && !draftIds.has(typed.courseId) ? (
            <Button
              size="small"
              variant="secondary"
              leadingIcon={RiAddLine}
              onClick={() => addDraft({ courseId: typed.courseId, code: typed.code, title: null })}
              className="self-start"
            >
              Add {typed.code}
            </Button>
          ) : null}

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
                      className="rounded-md bg-background-secondary-default px-1.5 py-1 text-caption-1-medium tabular-nums text-text-secondary outline-none transition-colors duration-150 ease hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                    >
                      {draft.code} ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {filteredSuggestions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-caption-1-medium text-text-secondary">
                From your outstanding requirements
              </p>
              <ul className="flex flex-col gap-1">
                {filteredSuggestions.map((suggestion) => (
                  <li key={suggestion.courseId}>
                    <button
                      type="button"
                      onClick={() =>
                        addDraft({
                          courseId: suggestion.courseId,
                          code: suggestion.code,
                          title: suggestion.title,
                        })
                      }
                      className={cx(
                        "flex w-full items-center gap-2 rounded-2lg p-2 text-left outline-none transition-colors duration-150 ease",
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
