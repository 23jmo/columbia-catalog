import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

import { beforeAll, describe, expect, it } from "vitest";

interface CapturedMeeting {
  weekday: "Su" | "Mo" | "Tu" | "We" | "Th" | "Fr" | "Sa";
  startMinute: number;
  endMinute: number;
  buildingName: string | null;
  room: string | null;
}

interface CapturedSection {
  sectionKey: string;
  termCode: string;
  courseId: string;
  sectionCode: string;
  callNumber: string;
  meetings: CapturedMeeting[];
  observedAt: string;
  provenance: "Vergil course search";
}

interface Sanitizer {
  isSanitizedSection(value: unknown): boolean;
  sanitizeCourseSearchResponse(payload: unknown, capturedAt: string): CapturedSection[];
  sanitizeMeetings(value: unknown): CapturedMeeting[];
}

let sanitizer: Sanitizer;
let captureSchema: { normalizeSection(value: unknown): CapturedSection | null };

beforeAll(async () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  for (const file of ["sanitizer.js", "capture-schema.js"]) {
    const source = await readFile(path.resolve(testDirectory, `../${file}`), "utf8");
    runInThisContext(source, { filename: file });
  }
  sanitizer = (
    globalThis as typeof globalThis & { ColumbiaCatalogVergilSanitizer: Sanitizer }
  ).ColumbiaCatalogVergilSanitizer;
  captureSchema = (
    globalThis as typeof globalThis & {
      ColumbiaCatalogCaptureSchema: typeof captureSchema;
    }
  ).ColumbiaCatalogCaptureSchema;
});

function responseWith(sectionOverrides: Record<string, unknown> = {}): unknown {
  return {
    data: {
      total_count: 1,
      courses: [
        {
          course_identifier2: "COMS4113W",
          class_data: {
            classes: [
              {
                class_identifier: "COMS4113W001",
                class_number: "19581",
                section_code: "001",
                term_calendar_code: "20263",
                meeting_details: [
                  {
                    room: {
                      room_number: "142",
                      building: { building_name: "Uris Hall" },
                    },
                    meeting_pattern: {
                      meetingpatterndetail_set: [
                        { week_day: "Mo", from_time: "19:00:00", to_time: "21:30:00" },
                      ],
                    },
                  },
                ],
                ...sectionOverrides,
              },
            ],
          },
        },
      ],
    },
  };
}

describe("Vergil response sanitizer", () => {
  it("normalizes a representative course-search section", () => {
    const [section] = sanitizer.sanitizeCourseSearchResponse(
      responseWith(),
      "2026-08-24T01:02:03.000Z",
    );

    expect(section).toEqual({
      sectionKey: "20263COMS4113W001",
      termCode: "20263",
      courseId: "COMS4113W",
      sectionCode: "001",
      callNumber: "19581",
      meetings: [
        {
          weekday: "Mo",
          startMinute: 1140,
          endMinute: 1290,
          buildingName: "Uris Hall",
          room: "142",
        },
      ],
      observedAt: "2026-08-24T01:02:03.000Z",
      provenance: "Vergil course search",
    });
    expect(sanitizer.isSanitizedSection(section)).toBe(true);
  });

  it("supports 12-hour time strings and expands multiple weekdays", () => {
    expect(
      sanitizer.sanitizeMeetings([
        {
          building_name: "Northwest Corner Building",
          room_number: "501",
          meeting_pattern: {
            meetingpatterndetail_set: [
              { week_day: "Tu, Th", from_time: "1:10pm", to_time: "2:25pm" },
            ],
          },
        },
      ]),
    ).toEqual([
      {
        weekday: "Tu",
        startMinute: 790,
        endMinute: 865,
        buildingName: "Northwest Corner Building",
        room: "501",
      },
      {
        weekday: "Th",
        startMinute: 790,
        endMinute: 865,
        buildingName: "Northwest Corner Building",
        room: "501",
      },
    ]);
  });

  it("keeps valid TBA sections but rejects malformed identities", () => {
    const [tba] = sanitizer.sanitizeCourseSearchResponse(
      responseWith({ meeting_details: [] }),
      "2026-08-24T01:02:03.000Z",
    );
    expect(tba.meetings).toEqual([]);

    expect(
      sanitizer.sanitizeCourseSearchResponse(
        responseWith({ class_number: "not-a-call-number" }),
        "2026-08-24T01:02:03.000Z",
      ),
    ).toEqual([]);
  });

  it("accepts Columbia's ampersand-bearing course identifiers", () => {
    const payload = responseWith() as {
      data: {
        courses: Array<{
          course_identifier2: string;
          class_data: { classes: Array<Record<string, unknown>> };
        }>;
      };
    };
    payload.data.courses[0].course_identifier2 = "A&HA4061Y";
    payload.data.courses[0].class_data.classes[0].class_identifier = "A&HA4061Y001";

    const [section] = sanitizer.sanitizeCourseSearchResponse(
      payload,
      "2026-08-24T01:02:03.000Z",
    );
    expect(section.courseId).toBe("A&HA4061Y");
    expect(section.sectionKey).toBe("20263A&HA4061Y001");
    expect(captureSchema.normalizeSection(section)).toEqual(section);
  });

  it("does not copy unrelated or personal fields", () => {
    const payload = responseWith({
      student_name: "Private Student",
      gpa: 4,
      holds: ["private"],
      meeting_details: [],
    }) as { data: { private_account?: unknown } };
    payload.data.private_account = { balance: 100 };

    const [section] = sanitizer.sanitizeCourseSearchResponse(
      payload,
      "2026-08-24T01:02:03.000Z",
    );
    const serialized = JSON.stringify(section);
    expect(serialized).not.toContain("Private Student");
    expect(serialized).not.toContain("private_account");
    expect(Object.keys(section)).toEqual([
      "sectionKey",
      "termCode",
      "courseId",
      "sectionCode",
      "callNumber",
      "meetings",
      "observedAt",
      "provenance",
    ]);
  });

  it("reconstructs bridged records so spoofed extra fields cannot pass through", () => {
    const [section] = sanitizer.sanitizeCourseSearchResponse(
      responseWith({ meeting_details: [] }),
      "2026-08-24T01:02:03.000Z",
    );
    const normalized = captureSchema.normalizeSection({
      ...section,
      studentName: "Should never cross the bridge",
      meetings: section.meetings.map((meeting) => ({ ...meeting, hidden: "nope" })),
    });

    expect(normalized).toEqual(section);
    expect(normalized).not.toHaveProperty("studentName");
  });
});
