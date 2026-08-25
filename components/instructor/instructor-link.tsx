import { PrefetchLink } from "@/components/catalog/prefetch-link";

import { instructorSlug } from "@/lib/data/instructor-slug";
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
 *
 *   · **`relative` is load-bearing, not styling.** Search results and section
 *     rows are "stretched link" cards: one anchor grows `after:absolute
 *     after:inset-0` over the whole row so the row is one big click target with
 *     one accessible name. That pseudo-element is a POSITIONED box, and
 *     positioned boxes paint above non-positioned inline content — so a name
 *     rendered plainly inside such a row is covered by a transparent overlay
 *     and cannot be clicked, while still looking and reading like a link.
 *     Making the anchor positioned lifts it back into the same paint step as
 *     the overlay, where tree order puts it on top. This is the standard
 *     caveat of the pattern, and it belongs here rather than at each call site
 *     because every future row will have the same trap.
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
    <PrefetchLink
      href={`/instructor/${instructorSlug(name)}`}
      className={cx(
        // See the header: this is what keeps the name clickable inside a
        // stretched-link row, not decoration.
        "relative z-[1]",
        "rounded outline-none transition-colors duration-150",
        "hover:text-accent-600 hover:underline hover:decoration-dotted hover:underline-offset-2",
        "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        className,
      )}
    >
      {name}
    </PrefetchLink>
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
