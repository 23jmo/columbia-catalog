import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/base/buttons/button";
import { JsonLd } from "@/components/marketing/json-ld";
import { organizationWebsiteGraph } from "@/lib/marketing/json-ld";
import { listPublicPrograms, programHref } from "@/lib/marketing/public-programs";
import { publicPageMetadata } from "@/lib/marketing/site";
import { SCHOOL_LABEL, type Program, type School } from "@/lib/requirements/types";

export const metadata: Metadata = publicPageMetadata({
  title: "Columbia College, SEAS and Barnard programs LionPlan checks",
  description:
    "Authored bulletin maps for Columbia College, Columbia Engineering and Barnard majors and cores. What LionPlan checks when it recommends what to take next.",
  path: "/programs",
});

const SCHOOL_ORDER: School[] = ["CC", "SEAS", "BC"];

export default function ProgramsIndexPage() {
  const programs = listPublicPrograms();
  const bySchool = SCHOOL_ORDER.map((school) => ({
    school,
    cores: programs.filter((program) => program.school === school && program.kind === "core"),
    majors: programs.filter((program) => program.school === school && program.kind === "major"),
  }));

  return (
    <>
      <JsonLd data={organizationWebsiteGraph()} />
      <header className="flex flex-col gap-4">
        <h1 className="text-display-4-semibold -tracking-[0.02em] text-balance text-text-primary">
          What LionPlan checks for CC, SEAS and Barnard
        </h1>
        <p className="text-headline-regular text-pretty text-text-secondary">
          These pages are the authored bulletin maps for Columbia College,
          Columbia Engineering and Barnard College. They are what the planner
          reads when it says a class satisfies a requirement or unlocks another
          one. Barnard&rsquo;s were read from its own catalogue at
          catalog.barnard.edu, which is a separate publication from
          Columbia&rsquo;s Bulletin.
        </p>
        <p className="text-headline-regular text-pretty text-text-secondary">
          LionPlan is an unofficial student project. It is a companion to
          Stellic and Vergil, not a replacement, and it does not replace CSA
          advising. General Studies is coming soon.
        </p>
      </header>

      {bySchool.map(({ school, cores, majors }) => (
        <section key={school} className="flex flex-col gap-3">
          <h2 className="text-title-3-semibold text-text-primary">
            {SCHOOL_LABEL[school]}
          </h2>
          <ul className="flex flex-col gap-2">
            {[...cores, ...majors].map((program) => (
              <ProgramLink key={program.id} program={program} />
            ))}
          </ul>
        </section>
      ))}

      <ButtonLink href="/onboarding">Get started</ButtonLink>
    </>
  );
}

function ProgramLink({ program }: { program: Program }) {
  return (
    <li>
      <Link
        href={programHref(program)}
        className="text-headline-medium text-text-primary underline decoration-border-table underline-offset-2 hover:decoration-text-tertiary"
      >
        {program.name}
        {program.kind === "core" ? " (Core)" : ""}
      </Link>
    </li>
  );
}
