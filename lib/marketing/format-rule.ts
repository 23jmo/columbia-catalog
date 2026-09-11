import type { CourseSelector, RequirementRule } from "@/lib/requirements/types";

/**
 * Plain-English reading of one authored rule.
 *
 * The public program pages must not dump TypeScript. This is the same
 * rule object the audit uses, phrased so a student can check it against
 * the Bulletin. It does not invent courses or counts.
 */

const FLAG_LABEL: Record<string, string> = {
  globalCore: "Global Core",
  scienceRequirement: "Science Requirement",
  scienceWithLab: "science with a lab",
  scienceB: "Science Category B",
  scienceC: "Science Category C",
  artsAndHumanities: "Arts and Humanities",
  socialScience: "Social Science",
  language: "language",
  physicalEducation: "Physical Education",
};

function listCodes(codes: string[]): string {
  return codes.join(", ");
}

function describeSelector(select: CourseSelector): string {
  const parts: string[] = [];
  if (select.subjects && select.subjects.length > 0) {
    parts.push(`${select.subjects.join(" or ")} courses`);
  }
  if (select.numberRange) {
    const [low, high] = select.numberRange;
    parts.push(`numbered ${low} to ${high}`);
  }
  if (select.flag) {
    parts.push(`on the ${FLAG_LABEL[select.flag] ?? select.flag} list`);
  }
  if (select.include && select.include.length > 0) {
    parts.push(`including ${listCodes(select.include)}`);
  }
  if (select.exclude && select.exclude.length > 0) {
    parts.push(`excluding ${listCodes(select.exclude)}`);
  }
  if (select.excludeGroups && select.excludeGroups.length > 0) {
    parts.push("not counting courses already used for another group in this program");
  }
  if (parts.length === 0) return "courses matching the Bulletin's shape for this group";
  return parts.join(", ");
}

export function ruleKindLabel(kind: RequirementRule["kind"]): string {
  switch (kind) {
    case "all_of":
      return "All of these";
    case "n_of":
      return "Choose N";
    case "sequence_choice":
      return "One sequence";
    case "n_matching":
      return "N matching";
    case "points_matching":
      return "Points";
    case "attested":
      return "Attested";
  }
}

export function formatRule(rule: RequirementRule): string {
  switch (rule.kind) {
    case "all_of":
      return `All of these: ${listCodes(rule.courses)}.`;
    case "n_of":
      return `Choose ${rule.n} of: ${listCodes(rule.courses)}.`;
    case "sequence_choice":
      return `One sequence: ${rule.sequences
        .map((sequence) => `${sequence.label} (${listCodes(sequence.courses)})`)
        .join(", or ")}.`;
    case "n_matching":
      return `${rule.n} ${rule.n === 1 ? "course" : "courses"} matching ${describeSelector(rule.select)}.`;
    case "points_matching":
      return `${rule.points} points matching ${describeSelector(rule.select)}.`;
    case "attested":
      return `You confirm this yourself. ${rule.note}`;
  }
}
