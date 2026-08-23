"use client";

import { useEffect, useRef, useState } from "react";
import {
  RiArrowRightUpLine,
  RiCheckLine,
  RiFileCopyLine,
  RiShieldCheckLine,
} from "@remixicon/react";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import { termLabel, vergilSectionUrl } from "@/lib/constants";
import type { Section } from "@/lib/types";
import { cx } from "@/utils/cx";

/**
 * The last mile.
 *
 * We are a PURE PLANNER. This component never registers, never adds to a cart,
 * and never issues any write to a columbia.edu host — it hands the student a
 * call number and a correct deep link and gets out of the way. Both affordances
 * are first-class because both are used: the link when they are already logged
 * into Vergil, the copyable call number when they are typing it into the SSOL
 * box on a phone at 7am.
 *
 * `vergilSectionUrl` is the only Columbia URL we ever send a student to for
 * registration, and it is a GET in a new tab.
 */

export interface RegistrationHandoffProps {
  section: Pick<Section, "sectionId" | "callNumber" | "sectionCode" | "termCode" | "instructors">;
  courseCode: string;
  courseTitle: string;
  /** Compact layout for the sections list; full layout for the handoff panel. */
  variant?: "full" | "inline";
  className?: string;
}

function useCopy(): [boolean, (value: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = (value: string) => {
    const finish = () => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(finish).catch(() => setCopied(false));
      return;
    }
    // Clipboard API is unavailable on insecure origins; select-and-copy still works.
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand("copy");
      finish();
    } finally {
      document.body.removeChild(field);
    }
  };

  return [copied, copy];
}

export function CallNumberCopy({
  callNumber,
  className,
}: {
  callNumber: string;
  className?: string;
}) {
  const [copied, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(callNumber)}
      aria-label={`Copy call number ${callNumber}`}
      className={cx(
        "group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5",
        "font-mono text-body-medium tabular-nums text-text-primary",
        "bg-background-secondary-default hover:bg-background-tertiary-default",
        "cursor-pointer transition-colors duration-150 ease",
        "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        className,
      )}
    >
      {callNumber}
      {copied ? (
        <RiCheckLine className="size-3.5 shrink-0 text-status-lime-text" aria-hidden />
      ) : (
        <RiFileCopyLine
          className="size-3.5 shrink-0 text-foreground-icon-tertiary group-hover:text-foreground-icon-secondary"
          aria-hidden
        />
      )}
      <span className="sr-only" role="status">
        {copied ? "Call number copied" : ""}
      </span>
    </button>
  );
}

export function RegistrationHandoff({
  section,
  courseCode,
  courseTitle,
  variant = "full",
  className,
}: RegistrationHandoffProps) {
  const [copied, copy] = useCopy();
  const href = vergilSectionUrl(section.termCode, section.callNumber);

  if (variant === "inline") {
    return (
      <div className={cx("flex flex-wrap items-center gap-2", className)}>
        <CallNumberCopy callNumber={section.callNumber} />
        <ButtonLink
          size="xs"
          variant="secondary"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          trailingIcon={RiArrowRightUpLine}
        >
          Vergil
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-4 rounded-2lg border border-border-table bg-background-secondary-default p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-caption-2-medium uppercase tracking-wide text-text-tertiary">
            Call number · {termLabel(section.termCode)} · Section {section.sectionCode}
          </p>
          <p className="mt-1 font-mono text-display-4-semibold tabular-nums leading-none text-text-primary">
            {section.callNumber}
          </p>
          <p className="mt-2 text-caption-1-regular text-text-secondary">
            {courseCode} — {courseTitle}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:w-48">
          <Button
            variant="secondary"
            leadingIcon={copied ? RiCheckLine : RiFileCopyLine}
            onClick={() => copy(section.callNumber)}
            aria-label={`Copy call number ${section.callNumber}`}
          >
            {copied ? "Copied" : "Copy call number"}
          </Button>
          <ButtonLink
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            trailingIcon={RiArrowRightUpLine}
          >
            Open in Vergil
          </ButtonLink>
        </div>
      </div>

      <div className="flex items-start gap-2.5 text-caption-1-regular text-text-secondary">
        <RiShieldCheckLine className="mt-px size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
        <p>
          Columbia Catalog is a planner. We never register, drop, or waitlist anyone — the
          link above opens Vergil in a new tab, where your UNI login and your own click do
          the actual work. Nothing here is sent to Columbia.
        </p>
      </div>
    </div>
  );
}
