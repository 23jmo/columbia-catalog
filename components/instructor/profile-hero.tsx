/**
 * The identity shell shared by the full profile page and the section hover card.
 *
 * Cover band, straddling avatar, name, optional subtitle and subject badges.
 * Callers supply actions (share, CULPA) and rating content as children.
 */

import type { ReactNode } from "react";

import { initialsOf } from "@/components/course/format";
import { CoursePageBackLink } from "@/components/course/course-page-back";
import { InstructorLink } from "@/components/instructor/instructor-link";
import {
  pageHeroBackLinkAnchorClass,
  pageHeroBodyClass,
  pageHeroCoverClass,
  pageHeroSectionClass,
} from "@/components/shell/page-hero-layout";
import { cx } from "@/utils/cx";

import { ProfileCover } from "./cover";

export interface InstructorProfileHeroProps {
  name: string;
  /** Department on the profile page; section context in the hover card. */
  subtitle?: string | null;
  subjectBadges?: string[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Popover: shorter cover inside the hover surface. Page: full 165px band. */
  variant?: "page" | "popover";
  backLink?: { href: string; label: string };
}

export function InstructorProfileHero({
  name,
  subtitle,
  subjectBadges = [],
  actions,
  children,
  className,
  variant = "page",
  backLink,
}: InstructorProfileHeroProps) {
  const isPopover = variant === "popover";

  return (
    <section
      className={cx(
        isPopover
          ? "relative w-full overflow-hidden rounded-t-2lg border-b border-border-ai-profile-card"
          : pageHeroSectionClass("card"),
        className,
      )}
    >
      <div
        className={cx(
          isPopover
            ? "absolute inset-x-0 top-0 h-20 overflow-hidden rounded-t-2lg bg-background-tertiary-default"
            : pageHeroCoverClass(),
        )}
      >
        <ProfileCover seed={name} className={isPopover ? undefined : "min-h-full min-w-full"} />
      </div>

      {backLink && !isPopover ? (
        <div className={pageHeroBackLinkAnchorClass()}>
          <CoursePageBackLink href={backLink.href}>{backLink.label}</CoursePageBackLink>
        </div>
      ) : null}

      <div
        className={cx(
          isPopover ? "relative flex w-full flex-col gap-2 px-3 pb-3 pt-12" : pageHeroBodyClass(),
        )}
      >
        <span
          className={cx(
            "flex items-center justify-center rounded-full bg-background-tertiary-default ring-4 ring-background-primary-default",
            isPopover ? "size-12 ring-2" : "size-20",
          )}
        >
          <span
            className={cx(
              "text-text-secondary",
              isPopover ? "text-title-3-medium" : "text-display-4-medium",
            )}
          >
            {initialsOf(name)}
          </span>
        </span>

        <div className="relative flex w-full items-start gap-[15px]">
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            {isPopover ? (
              <h2 className="truncate text-headline-semibold text-text-primary">
                <InstructorLink name={name} className="relative z-10" />
              </h2>
            ) : (
              <h1 className="truncate text-title-2-medium text-text-primary">{name}</h1>
            )}
            {(subtitle || subjectBadges.length > 0) && (
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                {subtitle ? (
                  <p className="truncate text-headline-medium text-text-secondary">{subtitle}</p>
                ) : null}
                {subjectBadges.map((subject) => (
                  <span
                    key={subject}
                    className="inline-flex shrink-0 items-center justify-center rounded-sm bg-badge-neutral-background px-1 py-px text-caption-1-semibold tracking-normal whitespace-nowrap text-text-secondary"
                  >
                    {subject}
                  </span>
                ))}
              </div>
            )}
          </div>

          {actions ? (
            <div
              className={cx(
                "absolute flex items-center justify-end gap-2.5",
                isPopover ? "top-0 right-0" : "-top-[34px] right-1",
              )}
            >
              {actions}
            </div>
          ) : null}
        </div>

        {children}
      </div>
    </section>
  );
}
