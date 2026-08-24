import {
  CourseworkCard,
  DataCard,
  OutstandingCard,
  ProfileHero,
  ProgramAuditCard,
  RecommendedCourses,
} from "@/components/profile";
import { AppShell } from "@/components/shell/app-shell";
import { auditProfile, overallProgress } from "@/lib/profile/audit";
import type { StudentProfile } from "@/lib/profile/types";
import { listPrograms } from "@/lib/requirements/programs";

export const dynamic = "force-dynamic";

const PROFILE: StudentProfile = {
  userId: "preview",
  displayName: "Ana Maria Ruiz",
  email: "amr2231@columbia.edu",
  school: "CC",
  programIds: ["cc-major-computer-science"],
  classYear: "2028",
  attestations: { "cc-core:swim-test": "2025-09-04T14:02:00.000Z" },
  updatedAt: "2026-08-20T10:00:00.000Z",
  courses: [
    { courseId: "HUMA1001CC", termCode: null, termLabel: "Fall 2024", points: 4, source: "transcript_pdf", addedAt: "" },
    { courseId: "HUMA1002CC", termCode: null, termLabel: "Spring 2025", points: 4, source: "transcript_pdf", addedAt: "" },
    { courseId: "ENGL1010UN", termCode: null, termLabel: "Fall 2024", points: 3, source: "transcript_pdf", addedAt: "" },
    { courseId: "MATH1201UN", termCode: null, termLabel: "Fall 2024", points: 3, source: "transcript_pdf", addedAt: "" },
    { courseId: "COMS1004UN", termCode: null, termLabel: "Fall 2024", points: 3, source: "transcript_pdf", addedAt: "" },
    { courseId: "COMS3134UN", termCode: null, termLabel: "Spring 2025", points: 3, source: "transcript_pdf", addedAt: "" },
    { courseId: "COMS3157UN", termCode: null, termLabel: "Fall 2025", points: 4, source: "picker", addedAt: "" },
    { courseId: "COMS3203UN", termCode: null, termLabel: "Fall 2025", points: 3, source: "picker", addedAt: "" },
    { courseId: "MATH2010UN", termCode: null, termLabel: "Spring 2025", points: 3, source: "plan", addedAt: "" },
  ],
};

export default function PreviewPage() {
  const audit = auditProfile({ profile: PROFILE, catalog: new Map() });
  const options = listPrograms().map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    school: p.school,
    origin: p.origin,
  }));

  return (
    <AppShell activeNav="profile">
      <div className="dark mx-auto flex w-full max-w-4xl flex-col items-center gap-4 bg-background-full">
        <ProfileHero
          profile={PROFILE}
          audit={audit}
          progress={overallProgress(audit)}
          programOptions={options}
        />
        <OutstandingCard remaining={audit.remaining} />
        <RecommendedCourses recommendations={[]} termLabel="Spring 2027" hasPrograms />
        {audit.programs.map((result) => (
          <ProgramAuditCard key={result.program.id} result={result} />
        ))}
        <CourseworkCard
          courses={PROFILE.courses}
          titles={{ COMS3134UN: "Data Structures in Java", MATH1201UN: "Calculus III" }}
          suggestions={[]}
          unmatchedCourseIds={audit.unmatchedCourseIds}
          crossCounted={audit.crossCounted}
        />
        <DataCard profile={PROFILE} />
      </div>
    </AppShell>
  );
}
