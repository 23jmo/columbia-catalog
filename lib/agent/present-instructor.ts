/**
 * Compact instructor card for the chat thread.
 *
 * The full instructor page is a column of charts. Chat gets the identity
 * shell and the rating block — the same two pieces the hover card uses —
 * plus a short course list. RateMyProfessor is NOT in this payload: it is
 * fetched live in the browser by `InstructorRating`, never stored.
 */

import { CURRENT_TERM } from "@/lib/constants";
import type { InstructorPageData } from "@/lib/data/instructors";
import type { ReputationSummary, TermCode, Weekday } from "@/lib/types";

/** Registrar placeholders that occupy the instructor field but name nobody. */
const PLACEHOLDER = /^(staff|tba|tbd|to be announced|to be determined|instructor)$/i;

const COURSE_CAP = 8;

export interface InstructorCourseChip {
  courseId: string;
  code: string;
  title: string;
}

export interface InstructorArtifact {
  kind: "instructor_card";
  found: boolean;
  name: string;
  slug: string | null;
  subtitle: string | null;
  subjects: string[];
  termLabel: string | null;
  courseCount: number;
  sectionCount: number;
  courses: InstructorCourseChip[];
  teachingDays: Weekday[];
  buildings: string[];
  reputation: ReputationSummary | null;
  error?: string;
}

export type InstructorLoaders = {
  loadProfile: (slugOrName: string, termCode: TermCode) => Promise<InstructorPageData | null>;
  loadReputation: (name: string) => Promise<ReputationSummary | null>;
};

export async function buildInstructorArtifact(
  loaders: InstructorLoaders,
  input: { name: string; termCode?: string },
): Promise<InstructorArtifact> {
  const asked = input.name.trim();
  if (!asked || PLACEHOLDER.test(asked)) {
    return missing(asked || "Unknown", "That is a placeholder, not a person.");
  }

  const profile = await loaders.loadProfile(asked, input.termCode ?? CURRENT_TERM);
  if (!profile) {
    return missing(asked, "No one by that name is teaching this term.");
  }

  const reputation = await loaders.loadReputation(profile.name);

  return {
    kind: "instructor_card",
    found: true,
    name: profile.name,
    slug: profile.slug,
    subtitle: profile.departments[0] ?? null,
    subjects: profile.subjects,
    termLabel: profile.termLabel,
    courseCount: profile.courseCount,
    sectionCount: profile.sectionCount,
    courses: profile.courses.slice(0, COURSE_CAP).map((course) => ({
      courseId: course.courseId,
      code: course.code,
      title: course.title,
    })),
    teachingDays: profile.teachingDays,
    buildings: profile.buildings.slice(0, 4),
    reputation,
  };
}

function missing(name: string, error: string): InstructorArtifact {
  return {
    kind: "instructor_card",
    found: false,
    name,
    slug: null,
    subtitle: null,
    subjects: [],
    termLabel: null,
    courseCount: 0,
    sectionCount: 0,
    courses: [],
    teachingDays: [],
    buildings: [],
    reputation: null,
    error,
  };
}
