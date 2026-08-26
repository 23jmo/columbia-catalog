import { formatCourseId, toCourseId } from "@/lib/requirements/code";

/**
 * Display titles for cores the guess deck names even when our catalog has no
 * row — University Writing is not in the seed extract, and a course with no
 * section in the two live terms falls out of `getCoursesByIds`.
 *
 * Only used when the catalog did not supply a title. Catalog wins.
 */
export const KNOWN_COURSE_TITLES: Record<string, string> = {
  ENGL1010CC: "University Writing",
  HUMA1001CC: "Literature Humanities I",
  HUMA1002CC: "Literature Humanities II",
  COCI1101CC: "Contemporary Civilization I",
  COCI1102CC: "Contemporary Civilization II",
  SCNC1000CC: "Frontiers of Science",
  HUMA1121UN: "Masterpieces of Western Art",
  HUMA1123UN: "Masterpieces of Western Music",
  MATH1101UN: "Calculus I",
  MATH1102UN: "Calculus II",
  MATH1201UN: "Calculus III",
  ENGI1102E: "The Art of Engineering",
  ECON1105UN: "Principles of Economics",
  PHYS1401UN: "Introduction to Mechanics and Thermodynamics",
  PHYS1402UN: "Introduction to Electricity, Magnetism and Optics",
  PHYS1601UN: "Physics I: Mechanics and Relativity",
  PHYS1602UN: "Physics II: Thermodynamics, Electricity and Magnetism",
  CHEM1403UN: "General Chemistry I",
  APMA2000E: "Multivariable Calculus for Engineers and Applied Scientists",
  CSEE3827W: "Fundamentals of Computer Systems",
  ENGI1006E: "Introduction to Computing for Engineers and Applied Scientists",
  COMS1004W: "Introduction to Computer Science and Programming in Java",
  COMS1007W: "Honors Introduction to Computer Science",
  COMS1002W: "Computing in Context",
  CHEM1500UN: "General Chemistry Laboratory",
  CHEM1507UN: "Intensive General Chemistry Laboratory",
  CHEM1404UN: "General Chemistry II",
  ELEN1201E: "Introduction to Electrical Engineering",
};

/** Fill a catalog-fact hole so every chip can show a name above its code. */
export function titleForCourseId(courseIdOrCode: string): string | null {
  const direct = KNOWN_COURSE_TITLES[courseIdOrCode];
  if (direct) return direct;
  const courseId = toCourseId(courseIdOrCode);
  return courseId ? (KNOWN_COURSE_TITLES[courseId] ?? null) : null;
}

export function knownCatalogFact(
  courseId: string,
): { code: string; title: string; points: null } | null {
  const title = titleForCourseId(courseId);
  if (!title) return null;
  return { code: formatCourseId(courseId), title, points: null };
}
