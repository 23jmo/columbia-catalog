import { z } from "zod";

export const VERGIL_SOURCE =
  "Vergil course search via LionPlan Chrome extension" as const;

const TimestampSchema = z.string().datetime({ offset: true });

const MeetingSchema = z
  .object({
    weekday: z.enum(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
    buildingName: z.string().max(160).nullable(),
    room: z.string().max(80).nullable(),
  })
  .strict()
  .refine((meeting) => meeting.endMinute > meeting.startMinute, {
    message: "Meeting end time must be after its start time.",
  });

export const VergilSectionSchema = z
  .object({
    sectionKey: z.string().min(1).max(80),
    termCode: z.string().regex(/^\d{4}[123]$/),
    courseId: z.string().regex(/^[A-Z&]{2,6}\d{1,5}[A-Z]{0,3}$/),
    sectionCode: z.string().regex(/^[A-Z0-9]{1,5}$/),
    callNumber: z.string().regex(/^\d{1,10}$/),
    meetings: z.array(MeetingSchema).max(28),
    observedAt: TimestampSchema,
    provenance: z.literal("Vergil course search"),
  })
  .strict()
  .superRefine((section, context) => {
    if (section.sectionKey !== `${section.termCode}${section.courseId}${section.sectionCode}`) {
      context.addIssue({
        code: "custom",
        path: ["sectionKey"],
        message: "Section identity does not match its term, course, and section code.",
      });
    }

    const meetingKeys = new Set<string>();
    section.meetings.forEach((meeting, index) => {
      const key = [
        meeting.weekday,
        meeting.startMinute,
        meeting.endMinute,
        meeting.room ?? "",
      ].join(":");
      if (meetingKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["meetings", index],
          message: "Duplicate meeting block.",
        });
      }
      meetingKeys.add(key);
    });
  });

const StartRequestSchema = z
  .object({
    action: z.literal("start"),
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
    schemaVersion: z.literal(1),
    source: z.literal(VERGIL_SOURCE),
    exportedAt: TimestampSchema,
    termCode: z.string().regex(/^\d{4}[123]$/),
    sections: z.number().int().min(1).max(20_000),
    meetings: z.number().int().min(0).max(300_000),
    locations: z.number().int().min(0).max(300_000),
    observedFrom: TimestampSchema,
    observedTo: TimestampSchema,
    scan: z
      .object({
        status: z.literal("complete"),
        termCode: z.string().regex(/^\d{4}[123]$/),
        page: z.number().int().positive(),
        pages: z.number().int().positive(),
        scannedCourses: z.number().int().positive(),
        totalCourses: z.number().int().positive(),
        startedAt: TimestampSchema,
        completedAt: TimestampSchema,
        error: z.null(),
        baselineSectionCount: z.number().int().min(0),
        sectionsCaptured: z.number().int().min(1).max(20_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.locations > request.meetings) {
      context.addIssue({ code: "custom", path: ["locations"], message: "Too many locations." });
    }
    if (
      request.scan.termCode !== request.termCode ||
      request.scan.page !== request.scan.pages ||
      request.scan.scannedCourses !== request.scan.totalCourses ||
      request.scan.sectionsCaptured !== request.sections
    ) {
      context.addIssue({
        code: "custom",
        path: ["scan"],
        message: "Scan completion counts do not agree.",
      });
    }
  });

const ChunkRequestSchema = z
  .object({
    action: z.literal("chunk"),
    contributionId: z.string().uuid(),
    sections: z.array(VergilSectionSchema).min(1).max(250),
  })
  .strict();

const FinalizeRequestSchema = z
  .object({
    action: z.literal("finalize"),
    contributionId: z.string().uuid(),
  })
  .strict();

export const VergilContributionRequestSchema = z.discriminatedUnion("action", [
  StartRequestSchema,
  ChunkRequestSchema,
  FinalizeRequestSchema,
]);

export type VergilSectionInput = z.infer<typeof VergilSectionSchema>;

