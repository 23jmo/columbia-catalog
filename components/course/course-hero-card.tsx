/**
 * Course page hero — cover band with a subject discipline icon.
 */

import type { ReactNode } from "react";

import { CoursePageBackLink } from "@/components/course/course-page-back";
import { CourseSubjectIcon } from "@/components/course/subject-icon";
import { ProfileCover } from "@/components/instructor/cover";
import {
  pageHeroBackLinkAnchorClass,
  pageHeroBodyClass,
  pageHeroCoverClass,
  pageHeroSectionClass,
} from "@/components/shell/page-hero-layout";
import { cx } from "@/utils/cx";

export interface CourseHeroCardProps {
  seed: string;
  subjectCode: string;
  backLink?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}

export function CourseHeroCard({
  seed,
  subjectCode,
  backLink,
  children,
  className,
}: CourseHeroCardProps) {
  return (
    <section className={cx(pageHeroSectionClass("attached"), className)}>
      <div className={pageHeroCoverClass()}>
        <ProfileCover seed={seed} className="min-h-full min-w-full" />
      </div>

      {backLink ? (
        <div className={pageHeroBackLinkAnchorClass()}>
          <CoursePageBackLink href={backLink.href}>{backLink.label}</CoursePageBackLink>
        </div>
      ) : null}

      <div className={pageHeroBodyClass()}>
        <CourseSubjectIcon subjectCode={subjectCode} variant="hero" />
        {children}
      </div>
    </section>
  );
}
