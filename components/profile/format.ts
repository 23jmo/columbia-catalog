/**
 * Presentation helpers local to the profile screen.
 *
 * Shaping only. The rule that matters here is the one encoded in
 * `VERIFICATION_*`: a satisfied requirement never renders the same way at all
 * three verification tiers. An `exact` group going green means "the Bulletin
 * names these courses and you have them". An `attested` group going green means
 * "you told us". Those are different claims and the screen has to say so, or
 * the audit becomes the false-authority artifact `lib/requirements/types.ts`
 * exists to prevent.
 */

import type {
  GroupStatus,
  RequirementRule,
  Verification,
} from "@/lib/requirements/types";

/** "Ana Maria Ruiz" → "AR". Same rule the rest of the app uses for avatars. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function percentLabel(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

/** `3` → "3 courses"; `1` → "1 course". Points pluralise the same way. */
export function outstandingLabel(count: number, unit: "courses" | "points"): string {
  const rounded = Math.round(count * 10) / 10;
  const noun = unit === "points" ? "point" : "course";
  return `${rounded} ${rounded === 1 ? noun : `${noun}s`}`;
}

/**
 * "4 of 11 done" for course groups, "6 of 9 points" for credit groups.
 *
 * Points are printed with their unit because "6 of 9" beside a course count
 * reads as six courses, and a student planning a term would then under-enroll.
 */
export function progressLabel(
  completed: number,
  required: number,
  unit: "courses" | "points",
): string {
  const done = Math.round(completed * 10) / 10;
  const need = Math.round(required * 10) / 10;
  return unit === "points" ? `${done} of ${need} points` : `${done} of ${need}`;
}

// ---------------------------------------------------------------------------
// Verification tiers
// ---------------------------------------------------------------------------

/**
 * The short label on the chip beside a requirement's name.
 *
 * `flagged` covers two different mechanisms — a curriculum flag the registrar
 * stamps on a course record, and a shape the rule describes (subject, level,
 * points). The tier-level wording has to be true of both, because the surfaces
 * that only know the tier (`OutstandingCard`, `RecommendedCourses`) have no
 * rule to inspect. Where the rule IS available, `verificationLabelFor` says
 * which of the two it is.
 */
export const VERIFICATION_LABEL: Record<Verification, string> = {
  exact: "Named in the Bulletin",
  flagged: "Matched by rule, not by name",
  attested: "You certify this yourself",
};

/** The one-line explanation under a requirement, when the card has room. */
export const VERIFICATION_NOTE: Record<Verification, string> = {
  exact:
    "The Bulletin lists these exact courses, so this check is as good as our copy of the Bulletin.",
  flagged:
    "This one is matched on what a course is — its subject, its level, or a curriculum flag the registrar stamps on it — rather than on a list of course codes. Those lists and flags change between Bulletin editions, so a course that counted in an earlier year may not count now.",
  attested:
    "No public data source records this. It is green because you said so, and an adviser is the only one who can confirm it.",
};

/**
 * The tier label, refined by what the rule actually does.
 *
 * "Matched on a curriculum flag" is a specific, checkable claim, and printing
 * it over a rule that only looks at subject and course number would be a small
 * lie about how the green got there — the exact class of thing the tiers exist
 * to prevent.
 */
export function verificationLabelFor(rule: RequirementRule): string {
  if (rule.kind === "n_matching" || rule.kind === "points_matching") {
    return rule.select.flag ? "Matched on a curriculum flag" : "Matched by subject and level";
  }
  return VERIFICATION_LABEL[verificationTierOf(rule)];
}

export function verificationNoteFor(rule: RequirementRule): string {
  if (rule.kind === "n_matching" || rule.kind === "points_matching") {
    return rule.select.flag
      ? "The registrar stamps courses with this flag. Approved lists change between editions, so a course that counted in an earlier year may not count now."
      : "Anything on your record that fits the shape counts — we are reading subject codes and course numbers, not a list the Bulletin published. A department exception or an approved substitution will not show up here.";
  }
  return VERIFICATION_NOTE[verificationTierOf(rule)];
}

/** Local mirror of the engine's tier mapping, so this module stays presentational. */
function verificationTierOf(rule: RequirementRule): Verification {
  switch (rule.kind) {
    case "all_of":
    case "n_of":
    case "sequence_choice":
      return "exact";
    case "n_matching":
    case "points_matching":
      return "flagged";
    case "attested":
      return "attested";
  }
}

/**
 * Colour reinforces the tier, it never carries it (spec §18): every surface
 * that uses these also prints `VERIFICATION_LABEL` in words.
 */
export const VERIFICATION_CHIP_COLOR: Record<Verification, "lime" | "cyan" | "yellow"> = {
  exact: "lime",
  flagged: "cyan",
  attested: "yellow",
};

export const STATUS_LABEL: Record<GroupStatus, string> = {
  satisfied: "Done",
  in_progress: "In progress",
  unmet: "Not started",
};

/**
 * The ring/bar colour for a group.
 *
 * `satisfied` at the `attested` tier is deliberately NOT the same green as
 * `satisfied` at `exact`. A screen full of identical green ticks would tell a
 * student their degree is checked when half of it is self-reported.
 */
export function statusToneClass(status: GroupStatus, verification: Verification): string {
  if (status !== "satisfied") {
    return status === "in_progress" ? "text-status-cyan-text" : "text-text-tertiary";
  }
  return verification === "attested" ? "text-status-yellow-text" : "text-status-lime-text";
}

export function statusFillClass(status: GroupStatus, verification: Verification): string {
  if (status !== "satisfied") {
    return status === "in_progress" ? "bg-status-cyan-text" : "bg-background-tertiary-default";
  }
  return verification === "attested" ? "bg-status-yellow-text" : "bg-status-lime-text";
}

/**
 * A stable 32-bit FNV-1a, for the generated cover art.
 *
 * Must be deterministic across server and client: a mismatch hydrates into a
 * flash of a different colour.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
