"use client";

import Link from "next/link";
import { RiArrowRightUpLine, RiDeleteBinLine, RiMapPin2Line, RiTimeLine, RiUserLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { WEEKDAY_LABEL, minutesToLabel } from "@/lib/constants";
import { isDistinctSectionTitle } from "@/lib/catalog-list-types";
import type { Course, CustomBlock, Section } from "@/lib/types";

import { Sheet } from "./sheet";

/**
 * What a tap on the week opens: the class behind the rectangle, every time
 * it meets, and the one thing you can do to it here — take it off.
 *
 * Everything else about a class (reviews, seats, prerequisites) is a page,
 * and the sheet links to it rather than reproducing a corner of it.
 */

export type BlockSelection =
  | { kind: "section"; section: Section; course: Course | null }
  | { kind: "block"; block: CustomBlock };

export interface BlockSheetProps {
  selection: BlockSelection | null;
  onClose: () => void;
  onRemoveSection: (sectionId: string) => void;
  onRemoveBlock: (blockId: string) => void;
}

export function BlockSheet({ selection, onClose, onRemoveSection, onRemoveBlock }: BlockSheetProps) {
  const title =
    selection?.kind === "section"
      ? `${selection.section.courseId} · ${selection.section.sectionCode}`
      : selection?.kind === "block"
        ? selection.block.label
        : "";

  return (
    <Sheet isOpen={selection !== null} onOpenChange={(open) => !open && onClose()} title={title}>
      {(close) =>
        selection?.kind === "section" ? (
          <SectionBody
            section={selection.section}
            course={selection.course}
            onRemove={() => {
              onRemoveSection(selection.section.sectionId);
              close();
            }}
          />
        ) : selection?.kind === "block" ? (
          <CustomBlockBody
            block={selection.block}
            onRemove={() => {
              onRemoveBlock(selection.block.blockId);
              close();
            }}
          />
        ) : null
      }
    </Sheet>
  );
}

function SectionBody({
  section,
  course,
  onRemove,
}: {
  section: Section;
  course: Course | null;
  onRemove: () => void;
}) {
  const sectionTitle = isDistinctSectionTitle(section.title, course?.title) ? section.title : null;
  return (
    <div className="flex flex-col gap-4 px-5 pb-4 pt-1 sm:pb-5">
      <div className="flex flex-col gap-0.5">
        <p className="text-body-medium text-text-primary">{course?.title ?? section.title ?? section.courseId}</p>
        {sectionTitle ? <p className="text-caption-1-regular text-text-secondary">{sectionTitle}</p> : null}
      </div>

      <ul className="flex flex-col gap-2">
        {section.meetings.length === 0 ? (
          <Row icon={RiTimeLine}>Meeting time not published yet.</Row>
        ) : (
          section.meetings.map((meeting, index) => (
            <Row key={`${meeting.weekday}-${meeting.startMinute}-${index}`} icon={RiTimeLine}>
              <span className="tabular-nums">
                {WEEKDAY_LABEL[meeting.weekday]} · {minutesToLabel(meeting.startMinute)}–
                {minutesToLabel(meeting.endMinute)}
              </span>
              {meeting.buildingName || meeting.room ? (
                <span className="flex items-center gap-1 text-text-tertiary">
                  <RiMapPin2Line className="size-3.5" aria-hidden />
                  {[meeting.buildingName, meeting.room].filter(Boolean).join(" ")}
                </span>
              ) : null}
            </Row>
          ))
        )}
        {section.instructors.length > 0 ? (
          <Row icon={RiUserLine}>{section.instructors.join(", ")}</Row>
        ) : null}
      </ul>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" leadingIcon={RiDeleteBinLine} onClick={onRemove} className="text-text-error-primary">
          Remove from schedule
        </Button>
        <Link
          href={`/course/${section.courseId}`}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg px-3 text-body-medium text-text-primary outline-none hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Course page
          <RiArrowRightUpLine className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function CustomBlockBody({ block, onRemove }: { block: CustomBlock; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-4 px-5 pb-4 pt-1 sm:pb-5">
      <ul>
        <Row icon={RiTimeLine}>
          <span className="tabular-nums">
            {WEEKDAY_LABEL[block.weekday]} · {minutesToLabel(block.startMinute)}–{minutesToLabel(block.endMinute)}
          </span>
        </Row>
      </ul>
      <p className="text-caption-1-regular text-text-tertiary">
        A busy block you added. It counts against overlaps like a class does.
      </p>
      <Button variant="secondary" leadingIcon={RiDeleteBinLine} onClick={onRemove} className="self-start text-text-error-primary">
        Remove
      </Button>
    </div>
  );
}

function Row({
  icon: Icon,
  children,
}: {
  icon: typeof RiTimeLine;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-caption-1-regular text-text-secondary">
      <Icon className="mt-0.5 size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />
      <span className="flex min-w-0 flex-col gap-0.5">{children}</span>
    </li>
  );
}
