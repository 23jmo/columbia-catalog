import Link from "next/link";

import { instructorSlug } from "@/lib/data/instructors";
import { cx } from "@/utils/cx";

/**
 * The one way an instructor's name becomes clickable.
 *
 * Every surface that prints a name routes through here — search results,
 * section rows, the course header, the compare table — so the affordance, the
 * hover treatment and the focus ring are identical everywhere and a new surface
 * cannot invent a fourth style.
 *
 * Two details that are easy to get wrong:
 *
 *   · **A name is not always a person.** The registrar prints placeholders
 *     ("Staff", "TBA", an empty string) in the same field as real names, and
 *     linking those produces a confident 404. `isLinkable` filters them and the
 *     component renders plain text instead — no dead link, no visual promise.
 *
 *   · **Underline on hover, not at rest.** These names appear in dense metadata
 *     rows, often several per line; a persistent underline turns the row into
 *     visual noise. The dotted underline on hover/focus is enough to say
 *     "clickable" at the moment the question is being asked.
 */

/** Registrar placeholders that occupy the instructor field but name nobody. */
const PLACEHOLDER = /^(staff|tba|tbd|to be announced|to be determined|instructor)$/i;

export function isLinkableInstructor(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (PLACEHOLDER.test(trimmed)) return false;
  // A slug of nothing cannot address a page.
  return instructorSlug(trimmed).length > 0;
}

export interface InstructorLinkProps {
  name: string;
  className?: string;
}

export function InstructorLink({ name, className }: InstructorLinkProps) {
  if (!isLinkableInstructor(name)) {
    return <span className={className}>{name}</span>;
  }
  return (
    <Link
      href={`/instructor/${instructorSlug(name)}`}
      className={cx(
        "rounded outline-none transition-colors duration-150 ease",
        "hover:text-accent-600 hover:underline hover:decoration-dotted hover:underline-offset-2",
        "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        className,
      )}
    >
      {name}
    </Link>
  );
}

/**
 * A comma-separated run of names, each linked, with an optional overflow tail.
 *
 * `max` truncates the way the surrounding metadata rows already do — the
 * remainder is counted, never silently dropped, because "+3" is the signal that
 * a section is co-taught.
 */
export function InstructorLinks({
  names,
  max,
  separator = ", ",
  className,
  fallback = "Instructor TBA",
}: {
  names: string[];
  max?: number;
  separator?: string;
  className?: string;
  fallback?: string;
}) {
  if (names.length === 0) return <span className={className}>{fallback}</span>;
  const shown = max != null ? names.slice(0, max) : names;
  const hidden = names.length - shown.length;

  return (
    <span className={className}>
      {shown.map((name, index) => (
        <span key={name}>
          {index > 0 ? separator : ""}
          <InstructorLink name={name} />
        </span>
      ))}
      {hidden > 0 ? ` +${hidden}` : ""}
    </span>
  );
}
