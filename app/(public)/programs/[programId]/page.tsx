import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RiArrowRightLine } from "@remixicon/react";

import { ButtonLink } from "@/components/base/buttons/button";
import { JsonLd } from "@/components/marketing/json-ld";
import { ProgramGroups } from "@/components/marketing/program-groups";
import { programWebPageJsonLd } from "@/lib/marketing/json-ld";
import {
  getPublicProgram,
  listPublicPrograms,
  programPageDescription,
  programPageTitle,
} from "@/lib/marketing/public-programs";
import { publicPageMetadata } from "@/lib/marketing/site";
import { SCHOOL_LABEL } from "@/lib/requirements/types";

export function generateStaticParams() {
  return listPublicPrograms().map((program) => ({ programId: program.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ programId: string }>;
}): Promise<Metadata> {
  const { programId } = await params;
  const program = getPublicProgram(programId);
  if (!program) return { title: "Program · LionPlan" };
  return publicPageMetadata({
    title: programPageTitle(program),
    description: programPageDescription(program),
    path: `/programs/${program.id}`,
  });
}

/**
 * One authored program, as a public page.
 *
 * The groups are the same objects the audit uses. The copy around them
 * is the product claim: unofficial, this school only, a card shows what
 * a class satisfies and what it unlocks.
 */
export default async function ProgramPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const program = getPublicProgram(programId);
  if (!program) notFound();

  const school = SCHOOL_LABEL[program.school];

  return (
    <>
      <JsonLd data={programWebPageJsonLd(program)} />
      <p className="text-caption-1-medium text-text-tertiary">
        <Link href="/programs" className="underline decoration-border-table underline-offset-2">
          Programs
        </Link>
        {` · ${school} · ${program.edition}`}
      </p>
      <header className="flex flex-col gap-4">
        <h1 className="text-display-4-semibold -tracking-[0.02em] text-balance text-text-primary">
          {programPageTitle(program)}
        </h1>
        <p className="text-headline-regular text-pretty text-text-secondary">
          LionPlan is an unofficial student project. It is a companion to
          Stellic and Vergil, not a replacement, and it does not replace CSA
          advising. This page is live for {school}.
        </p>
        <p className="text-headline-regular text-pretty text-text-secondary">
          Tell us your school, your major, and what you have taken. A course
          card then shows what a class satisfies
          (&ldquo;Satisfies Probability / Statistics&rdquo;) and what it
          unlocks (&ldquo;Opens up 7 more courses&rdquo;), plus the section
          time and instructor rating.
        </p>
        <p className="text-headline-regular text-pretty text-text-secondary">
          The groups below are the ones LionPlan actually checks for this
          program. They were transcribed from the {program.edition} Bulletin.
          Confirm them with your school before you register.
        </p>
      </header>

      <ProgramGroups program={program} />

      <ButtonLink href="/onboarding" trailingIcon={RiArrowRightLine}>
        Get started
      </ButtonLink>
    </>
  );
}
