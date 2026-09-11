import type { Metadata } from "next";
import { RiArrowRightLine } from "@remixicon/react";

import { ButtonLink } from "@/components/base/buttons/button";
import { JsonLd } from "@/components/marketing/json-ld";
import { PublicSection } from "@/components/marketing/public-doc";
import {
  organizationWebsiteGraph,
  softwareApplicationJsonLd,
} from "@/lib/marketing/json-ld";
import { publicPageMetadata } from "@/lib/marketing/site";

export const metadata: Metadata = publicPageMetadata({
  title: "LionPlan, a course planner for CC, SEAS and Barnard",
  description:
    "A course planner for Columbia College, Columbia Engineering and Barnard College. Tell us your school, major, and what you have taken, and we work out what you should take next. A companion to Stellic and Vergil, not a replacement.",
  path: "/about",
});

/**
 * The public product page.
 *
 * Unsigned visitors used to hit / and land on a school picker. This page
 * is what a journalist, a Reddit thread, or a parent can actually read.
 * It has to stay honest about coverage: Columbia College, Columbia
 * Engineering and Barnard College complete onboarding today. General
 * Studies shows as unavailable in the picker, so it is coming soon
 * here, not a live school.
 *
 * Barnard went live on 2026-08-30. What made it live was not a flag
 * but `lib/requirements/programs/index.ts` gaining Foundations and
 * eleven majors: the picker is derived from that registry, so a school
 * with nothing authored has nothing to pick. Do not restore the
 * "coming soon" line for a school that has programs.
 *
 * Copy rules that are easy to violate and wrong if we do: no user
 * counts, no waitlist, no Columbia marks, no other-product names, no
 * claim that this is an official tool.
 */
export default function AboutPage() {
  return (
    <>
      <JsonLd data={organizationWebsiteGraph()} />
      <JsonLd data={softwareApplicationJsonLd()} />
      <header className="flex flex-col gap-4">
        <h1 className="text-display-4-semibold -tracking-[0.02em] text-balance text-text-primary">
          A course planner for Columbia and Barnard
        </h1>
        <p className="text-headline-regular max-w-[46ch] text-pretty text-text-secondary">
          Tell us your school, your major, and what you have taken. We work
          out what you should take next.
        </p>
      </header>

      <PublicSection title="Who it is for right now">
        <p>
          LionPlan is live for Columbia College, Columbia Engineering, and
          Barnard College. General Studies is coming soon. It appears on the
          school list, but it is not available yet.
        </p>
      </PublicSection>

      <PublicSection title="What it does">
        <p>
          You walk through a short setup. School, then graduation year
          (2026 to 2030), then major. We ask the requirement questions the
          bulletin cannot answer for you: Literature Humanities versus
          Contemporary Civilization, Art Hum versus Music Hum, which physics
          sequence you are on, and the same kind of fork in other
          departments.
        </p>
        <p>
          Then we show a first transcript guess, including courses students
          with your record usually have too, and an Import transcript button
          if you want to correct it from a file. You mark classes you liked
          and pick interest tiles. You see a first recommendation card, then
          sign in with your Columbia or Barnard Google account to keep the
          plan.
        </p>
        <p>
          A course card shows both what it satisfies
          (&ldquo;Satisfies Probability / Statistics&rdquo;) and what it
          unlocks (&ldquo;Opens up 7 more courses&rdquo;), plus the section
          time and the instructor rating.
        </p>
      </PublicSection>

      <PublicSection title="What it is not">
        <p>
          This is an unofficial student project. It is not affiliated with
          Columbia University or Barnard College. It is not a substitute for
          Stellic, Vergil, or CSA and Barnard advising. Confirm requirements
          with your school before you register.
        </p>
        <p>
          A different student project is also called LionPlan. That one is
          an eight-semester visual planner. This site maps bulletin
          requirements and recommends the next course.
        </p>
      </PublicSection>

      <div>
        <ButtonLink href="/onboarding" trailingIcon={RiArrowRightLine}>
          Get started
        </ButtonLink>
      </div>
    </>
  );
}
