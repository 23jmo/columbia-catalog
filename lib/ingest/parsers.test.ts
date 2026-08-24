/**
 * Contract tests for the HTML parsing lane.
 *
 * These run against the REAL captured Columbia HTML in `__fixtures__/`, and
 * they exist for exactly one reason: to fail loudly the day Columbia changes
 * their markup. Spec §10 calls this the first of two parse-safety layers —
 * golden-fixture contract tests in CI catch known breakage before deploy, and
 * `shouldQuarantine` catches unknown breakage in production.
 *
 * So: assert concrete known-good values, not shapes. A test that only checks
 * `courses.length > 0` would have passed through every regression worth
 * catching.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseBulletinCourseBlocks,
  parseBulletinDepartment,
  parseTermLabel,
} from "./parsers/bulletin";
import { isSectionTombstone, parseSectionDetail } from "./parsers/section-detail";
import {
  calendarYearFor,
  parseAcademicCalendar,
  termCodeFromHeading,
} from "./parsers/academic-calendar";
import { parseSubjectIndex } from "./parsers/subject-index";
import { parseSubjectPage, parseSubjectPageNotes } from "./parsers/subject-page";
import {
  campusWallClockToIso,
  cleanText,
  decodeHtmlEntities,
  deriveStatus,
  extractPrerequisiteText,
  parseAsOfTimestamp,
  parseClockMinute,
  parseCourseNumber,
  parseEnrollment,
  parseLocation,
  parseMeetingPattern,
  parsePoints,
  parseTimeRange,
  parseWeekdayCodes,
  splitInstructorList,
} from "./parsers/shared";
import {
  countSectionRecords,
  DEFAULT_QUARANTINE_THRESHOLDS,
  shouldQuarantine,
} from "./quarantine";
import type { ParsedSection } from "../types";

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
}

const SUBJECT_HTML = fixture("doc-subject-COMS-Fall2026.html");
const SECTION_HTML = fixture("doc-section-COMS4113-001.html");
const BULLETIN_HTML = fixture("bulletin-cs.html");
const ROOT_HTML = fixture("doc-root.html");
const CALENDAR_HTML = fixture("bulletin-academic-calendar.html");

const FALL_2026 = "20263";

// ---------------------------------------------------------------------------
// Subject-term page
// ---------------------------------------------------------------------------

describe("parseSubjectPage — COMS Fall 2026", () => {
  const page = parseSubjectPage(SUBJECT_HTML, "COMS", FALL_2026);
  const sections = page.courses.flatMap((course) => course.sections);

  it("recovers every course header and every section row", () => {
    // Ground truth counted directly out of the fixture:
    //   grep -o '<th colspan=2>'          -> 54 course header rows
    //   querySelectorAll('div.course-details') -> 155 section rows
    // (The task brief quoted 43/112 and AGENTS.md quoted 138; both are stale
    // against this capture. These numbers are what the bytes on disk say.)
    expect(page.courses).toHaveLength(54);
    expect(sections).toHaveLength(155);
    expect(page.subjectCode).toBe("COMS");
    expect(page.termCode).toBe(FALL_2026);
  });

  it("parses COMS W1002 section 001 exactly", () => {
    const course = page.courses.find((candidate) => candidate.courseId === "COMS1002W");
    expect(course).toBeDefined();
    expect(course?.number).toBe(1002);
    expect(course?.qualifier).toBe("W");
    expect(course?.title).toBe("COMPUTING IN CONTEXT");

    const section = course?.sections.find((candidate) => candidate.sectionCode === "001");
    expect(section).toMatchObject({
      sectionId: "20263COMS1002W001",
      courseId: "COMS1002W",
      termCode: FALL_2026,
      callNumber: "13508",
      sectionCode: "001",
      // The section-level <h1> differs from the course title and wins.
      title: "COMPUTING IN ECONOMICS",
      pointsMin: 4,
      pointsMax: 4,
      instructors: ["Adam H Cannon"],
      enrollmentCount: 115,
      enrollmentCap: 200,
      status: "open",
      detailUrl: "https://doc.sis.columbia.edu/subj/COMS/W1002-20263-001/",
    });
    // Provenance travels with every seat number. Spec §10, non-negotiable.
    expect(section?.sourceAsOf).toBe("2026-08-22T00:00:00-04:00");
    // Day/time/room is Vergil-only now; this page carries none.
    expect(section?.meetings).toEqual([]);
  });

  it("joins plural instructor lists on 'and'", () => {
    const section = page.courses
      .find((course) => course.courseId === "COMS1002W")
      ?.sections.find((candidate) => candidate.sectionCode === "002");
    expect(section?.instructors).toEqual(["Adam H Cannon", "Mark Santolucito"]);
  });

  it("reads the '/ Full' marker as a full status", () => {
    const full = sections.filter((section) => section.status === "full");
    expect(full).toHaveLength(24);
    // Columbia marks Full both at and above cap.
    expect(full.every((section) => (section.enrollmentCount ?? 0) >= 0)).toBe(true);

    const overCap = sections.find((section) => section.callNumber === "13665");
    expect(overCap).toMatchObject({ enrollmentCount: 268, enrollmentCap: 266, status: "full" });
  });

  it("carries a call number, a cap and an 'as of' stamp on every single section", () => {
    // These three are the fields the product refuses to render without.
    expect(sections.filter((section) => !section.callNumber)).toHaveLength(0);
    expect(sections.filter((section) => section.enrollmentCount === null)).toHaveLength(0);
    expect(sections.filter((section) => section.enrollmentCap === null)).toHaveLength(0);
    expect(sections.filter((section) => section.sourceAsOf === null)).toHaveLength(0);
  });

  it("handles Barnard 'BC' qualifiers and point ranges", () => {
    const barnard = page.courses.find((course) => course.courseId === "COMS1014BC");
    expect(barnard?.qualifier).toBe("BC");
    expect(barnard?.number).toBe(1014);

    const ranged = sections.find((section) => section.sectionId === "20263COMS3895BC001");
    expect(ranged?.pointsMin).toBe(1);
    expect(ranged?.pointsMax).toBe(4);
  });

  it("leaves instructors empty rather than inventing a name", () => {
    const noInstructor = sections.filter((section) => section.instructors.length === 0);
    expect(noInstructor).toHaveLength(15);
    const recitation = sections.find((section) => section.callNumber === "13514");
    expect(recitation?.instructors).toEqual([]);
    expect(recitation?.pointsMin).toBe(0);
  });

  it("produces unique section ids", () => {
    const ids = new Set(sections.map((section) => section.sectionId));
    expect(ids.size).toBe(sections.length);
  });

  it("returns an empty page rather than throwing on unrelated HTML", () => {
    const empty = parseSubjectPage("<html><body><p>nope</p></body></html>", "COMS", FALL_2026);
    expect(empty.courses).toEqual([]);
  });
});

describe("parseSubjectPageNotes", () => {
  const notes = parseSubjectPageNotes(SUBJECT_HTML, "COMS", FALL_2026);

  it("collects the Notes: values the ParsedSection shape has no field for", () => {
    expect(notes.size).toBe(28);
  });

  it("exposes the meeting pattern a few sections smuggle into Notes", () => {
    const note = notes.get("20263COMS4701W003");
    expect(note).toBe("TR 7:10P - 8:25P");
    // Which is decodable, even though the listing page itself has no times.
    expect(parseMeetingPattern(note ?? "")).toEqual([
      { weekday: "Tu", startMinute: 1150, endMinute: 1225, buildingName: null, room: null },
      { weekday: "Th", startMinute: 1150, endMinute: 1225, buildingName: null, room: null },
    ]);
  });
});

describe("parseMeetingPattern — sections that meet more than once", () => {
  /*
   * A section with two Day/Time entries has them joined with "; " by
   * readDefinitionList. Read as one value, parseTimeRange took the start of
   * the first and the end of the last and produced an inverted range, which
   * the `end_minute >= start_minute` check rejected — taking the whole subject
   * page down with it. PHYS 6020 in Spring 2025 is the real case.
   */
  it("keeps each entry a separate meeting instead of splicing them", () => {
    expect(
      parseMeetingPattern("Mo 7:40pm-8:55pm; Mo 2:40pm-3:55pm", "ONLINE ONLY; ONLINE ONLY"),
    ).toEqual([
      { weekday: "Mo", startMinute: 1180, endMinute: 1255, buildingName: "ONLINE ONLY", room: null },
      { weekday: "Mo", startMinute: 880, endMinute: 955, buildingName: "ONLINE ONLY", room: null },
    ]);
  });

  it("pairs each pattern with its own location, positionally", () => {
    const meetings = parseMeetingPattern(
      "We 6:10pm-8:00pm; We 8:10pm-9:00pm",
      "LL013 Barnard Hall; 110 Barnard Hall",
    );
    // "LL013" keeps its whole string as the building name: parseLocation only
    // splits a room off when the leading token is numeric, and a Barnard
    // lower-level code is not. The pairing is what this test is about, and the
    // second entry shows it did not borrow the first entry's room.
    expect(meetings.map((meeting) => [meeting.room, meeting.buildingName])).toEqual([
      [null, "LL013 Barnard Hall"],
      ["110", "Barnard Hall"],
    ]);
  });

  it("reuses a lone location across every pattern, but never a borrowed one", () => {
    const shared = parseMeetingPattern("Mo 9:00am-9:50am; We 1:10pm-2:00pm", "301 Pupin Hall");
    expect(shared.every((meeting) => meeting.room === "301")).toBe(true);

    // Three patterns, two locations: the third gets nothing rather than a guess.
    const uneven = parseMeetingPattern(
      "Mo 9:00am-9:50am; We 1:10pm-2:00pm; Fr 3:10pm-4:00pm",
      "301 Pupin Hall; 428 Pupin Hall",
    );
    expect(uneven.map((meeting) => meeting.room)).toEqual(["301", "428", null]);
  });
});

// ---------------------------------------------------------------------------
// Section detail page
// ---------------------------------------------------------------------------

describe("parseSectionDetail — COMS W4113 section 001", () => {
  const detail = parseSectionDetail(SECTION_HTML);

  it("identifies itself from the page's own Section key", () => {
    expect(detail.sectionId).toBe("20263COMS4113W001");
    expect(detail.courseId).toBe("COMS4113W");
    expect(detail.termCode).toBe(FALL_2026);
    expect(detail.sectionCode).toBe("001");
    expect(detail.extras.sectionKey).toBe("20263COMS4113W001");
    expect(detail.detailUrl).toBe("https://doc.sis.columbia.edu/subj/COMS/W4113-20263-001/");
  });

  it("extracts the full <th>/<td> field set", () => {
    expect(detail).toMatchObject({
      callNumber: "19581",
      title: "FUND-LARGE-SCALE DIST SYSTEMS",
      pointsMin: 3,
      pointsMax: 3,
      gradingMode: "Standard",
      instructors: ["Hubertus Franke"],
      component: "LECTURE",
      methodOfInstruction: "In-Person",
      department: "Computer Science",
      enrollmentCount: 22,
      enrollmentCap: 110,
      status: "open",
      openTo:
        "Barnard College, Columbia College, Engineering:Undergraduate, " +
        "Engineering:Graduate, GSAS, General Studies",
    });
    expect(detail.extras.division).toBe("Interfaculty");
    expect(detail.extras.subjectName).toBe("Computer Science");
  });

  it("normalizes 'Approvals Required: None' to null", () => {
    expect(detail.approvalsRequired).toBeNull();
  });

  it("parses the timestamped 'as of' reading down to the minute", () => {
    // "22 students (110 max) as of  5:05PM Saturday, August 22, 2026"
    expect(detail.sourceAsOf).toBe("2026-08-22T17:05:00-04:00");
  });

  it("splits the prerequisite clause off the description", () => {
    expect(detail.prerequisiteText).toBe(
      "(COMS W3134 or COMS W3136 or COMS W3137) and " +
        "(COMS W3157 or COMS W4118 or CSEE W4119)",
    );
    expect(detail.description).toContain("Design and implementation of large-scale");
    // The description's own parentheticals must not be mistaken for prereqs.
    expect(detail.prerequisiteText).not.toContain("clock synchronization");
  });

  it("carries no meetings — the row is a Vergil link, not data", () => {
    expect(detail.meetings).toEqual([]);
  });

  it("throws rather than guessing when the page has no identity", () => {
    expect(() => parseSectionDetail("<html><body></body></html>")).toThrow(
      /no recoverable section identity/,
    );
  });

  /*
   * A withdrawn section is served as HTTP 200 with a 474-byte "Section
   * Removed" page. To `parseSectionDetail` that is indistinguishable from a
   * page it could not understand, so the crawler recorded a parse error and
   * retried forever a page whose answer will never change. These pin the
   * predicate that tells the two apart — including, importantly, that it does
   * NOT fire on a real section page.
   */
  describe("withdrawn sections", () => {
    const tombstone = fixture("doc-section-removed.html");

    it("recognises the tombstone Columbia actually serves", () => {
      expect(isSectionTombstone(tombstone)).toBe(true);
    });

    it("still cannot be parsed as a section — the predicate is the only guard", () => {
      expect(() => parseSectionDetail(tombstone)).toThrow(
        /no recoverable section identity/,
      );
    });

    it("does not fire on a real section page", () => {
      expect(isSectionTombstone(SECTION_HTML)).toBe(false);
    });

    it("does not fire on an empty or truncated response", () => {
      expect(isSectionTombstone("")).toBe(false);
      expect(isSectionTombstone("<html><body></body></html>")).toBe(false);
    });

    /*
     * Title and heading are two renderings of one fact. Either alone must be
     * enough, so a template tweak to one cannot turn a definitive answer back
     * into an infinite retry.
     */
    it("matches on the title alone and on the heading alone", () => {
      expect(isSectionTombstone("<title>Section Removed</title>")).toBe(true);
      expect(
        isSectionTombstone("<h1>Section removed from the Directory of Classes</h1>"),
      ).toBe(true);
    });
  });

  /*
   * The key's qualifier is the single school letter; the course's qualifier is
   * a two-letter code. They are not the same string and not the same length.
   * Measuring the subject by subtracting the tail therefore ate a letter off
   * the subject — `20263THTR3147V001` gave `THT3147UN`, an id matching no row,
   * so `ingest_section_detail` updated nothing and lost the description it had
   * just parsed, without failing.
   */
  it("reads the subject off the front of the key, whatever the qualifiers are", () => {
    const page = (key: string, number: string, section: string) => `
      <html><body><table>
        <tr><th>Number</th><td>${number}</td></tr>
        <tr><th>Section</th><td>${section}</td></tr>
        <tr><th>Course Description</th><td><p>Prose.</p></td></tr>
        <tr><th>Section key</th><td>${key}</td></tr>
      </table></body></html>`;

    /*
     * The case that broke: the key's qualifier is `V` and the course-level one
     * on the live page is `UN`. This fixture carries only what the key and the
     * number field say, so the qualifier here resolves to `V` — the assertion
     * that matters is the SUBJECT, which the old arithmetic clipped to `THT`.
     */
    const thtr = parseSectionDetail(page("20263THTR3147V001", "V3147", "001"));
    expect(thtr.courseId.startsWith("THTR3147")).toBe(true);
    expect(thtr.sectionId).toBe("20263THTR3147V001");

    // Same subject length, qualifier lengths that happen to agree.
    const arch = parseSectionDetail(page("20263ARCH4441A001", "A4441", "001"));
    expect(arch.courseId).toBe("ARCH4441A");

    // A different subject length, so the old arithmetic would have been off by
    // a different amount again.
    const eeeb = parseSectionDetail(page("20263EEEB2001W001", "W2001", "001"));
    expect(eeeb.courseId.startsWith("EEEB2001")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Subject index
// ---------------------------------------------------------------------------

describe("parseSubjectIndex", () => {
  it("returns nothing for doc-root.html, which carries no subject list", () => {
    // doc-root.html is the directory HOME page: an A-Z nav strip and a search
    // form, no subject rows at all. The real subject list lives at
    // /sel/subjects.html and /sel/subj-{A..Z}.html.
    expect(parseSubjectIndex(ROOT_HTML)).toEqual([]);
  });

  // Markup verified against the live https://doc.sis.columbia.edu/sel/subjects.html
  const INDEX_HTML = `
    <table class="index">
      <tr><th>Subject Name</th><th>Terms</th></tr>
      <tr><td>Cardiology</td>
          <td><a href="../subj/CR__/_Fall2026.html">Fall2026</a></td></tr>
      <tr><td>Chemistry (Barnard)</td>
          <td><a href="../subj/CHMP/_Summer2026.html">Summer2026</a></td></tr>
      <tr><td>Computer Science</td>
          <td><a href="../subj/COMS/_Summer2026.html">Summer2026</a>,
              <a href="../subj/COMS/_Fall2026.html">Fall2026</a></td></tr>
      <tr><td>African Studies: Theatre</td><td>&nbsp;</td></tr>
    </table>`;

  it("reads code, name and school off an index table", () => {
    expect(parseSubjectIndex(INDEX_HTML)).toEqual([
      { subjectCode: "CR__", subjectName: "Cardiology", school: null },
      { subjectCode: "CHMP", subjectName: "Chemistry (Barnard)", school: "Barnard College" },
      { subjectCode: "COMS", subjectName: "Computer Science", school: null },
    ]);
  });

  it("keeps Columbia's underscore-padded subject codes verbatim", () => {
    // subjectTermUrl() needs the padded form to build a working URL.
    const cardiology = parseSubjectIndex(INDEX_HTML)[0];
    expect(cardiology.subjectCode).toBe("CR__");
  });
});

// ---------------------------------------------------------------------------
// Bulletin — the only public source of meeting times
// ---------------------------------------------------------------------------

describe("parseBulletinDepartment — Computer Science", () => {
  const rows = parseBulletinDepartment(BULLETIN_HTML);

  it("finds every schedule row across the department page", () => {
    expect(rows).toHaveLength(167);
  });

  it("yields well over 100 meeting patterns", () => {
    const meetings = rows.flatMap((row) => row.meetings);
    expect(meetings.length).toBeGreaterThan(100);
    expect(meetings).toHaveLength(227);
    // Every one is a usable time window on a real weekday.
    expect(
      meetings.every(
        (meeting) => meeting.endMinute > meeting.startMinute && meeting.startMinute >= 0,
      ),
    ).toBe(true);
  });

  it("parses COMS 4113 / 001 exactly, times and room included", () => {
    const row = rows.find((candidate) => candidate.callNumber === "19581");
    expect(row).toEqual({
      courseCode: "COMS4113W",
      sectionCode: "001",
      callNumber: "19581",
      instructor: "Hubertus Franke",
      points: 3,
      enrollmentCount: 8,
      enrollmentCap: 110,
      termCode: FALL_2026,
      meetings: [
        {
          weekday: "Mo",
          // 7:00pm - 9:30pm
          startMinute: 19 * 60,
          endMinute: 21 * 60 + 30,
          buildingName: "Uris Hall",
          room: "142",
        },
      ],
    });
  });

  it("expands a multi-day pattern into one meeting per weekday", () => {
    const row = rows.find((candidate) => candidate.meetings.length === 2);
    expect(row).toBeDefined();
    const [first, second] = row?.meetings ?? [];
    expect(first.weekday).not.toBe(second.weekday);
    expect(first.startMinute).toBe(second.startMinute);
    expect(first.buildingName).toBe(second.buildingName);

    const twiceWeekly = rows.find((candidate) => candidate.callNumber === "13512");
    expect(twiceWeekly?.meetings.map((meeting) => meeting.weekday)).toEqual(["Mo", "We"]);
  });

  it("returns no meetings for rows with no scheduled time", () => {
    const unscheduled = rows.filter((row) => row.meetings.length === 0);
    expect(unscheduled).toHaveLength(20);
    // Still a real row: identity and enrollment survive.
    expect(unscheduled[0].courseCode).toMatch(/^[A-Z]{4}\d+/);
  });

  it("takes the qualifier from the table header, not the row cell", () => {
    // The row cell prints "COMS 4115" for both COMS W4115 and COMS E4115, which
    // are different courses. Only the header disambiguates them.
    const qualifiers = new Set(
      rows
        .filter((row) => row.courseCode.startsWith("COMS4776"))
        .map((row) => row.courseCode),
    );
    expect(qualifiers.has("COMS4776W")).toBe(true);
    expect(qualifiers.has("COMS4776E")).toBe(true);
  });

  it("mixes terms on one page, so callers must filter", () => {
    const terms = new Set(rows.map((row) => row.termCode));
    expect(terms).toEqual(new Set(["20263", "20261"]));

    const fallOnly = parseBulletinDepartment(BULLETIN_HTML, { termCode: FALL_2026 });
    expect(fallOnly).toHaveLength(41);
    expect(fallOnly.every((row) => row.termCode === FALL_2026)).toBe(true);
  });

  it("carries cross-listed subjects, not just the department's own", () => {
    const subjects = new Set(rows.map((row) => row.courseCode.slice(0, 4)));
    expect(subjects).toEqual(new Set(["COMS", "CSEE", "CBMF"]));
  });

  /*
   * The precondition `ingest_bulletin` now relies on (migration 0020).
   *
   * The SQL files each row under the term in the row itself. A row that
   * carries meetings but no term is unfilable, and the previous SQL's answer
   * to that — take whichever term sorts highest — is what wrote Spring
   * listings onto Fall sections. If the bulletin ever changes its schedule
   * header format, `termCode` goes null across the board and this test fails
   * loudly, rather than the meetings quietly stopping.
   */
  it("tags every row that carries meetings with the term it came from", () => {
    const withMeetings = rows.filter((row) => row.meetings.length > 0);
    expect(withMeetings.length).toBeGreaterThan(100);
    expect(withMeetings.every((row) => row.termCode !== null)).toBe(true);
  });

  it("spans more than one term in a single department page", () => {
    // The reason a job-level term filter is the wrong tool: one fetch carries
    // several terms, and each is worth keeping.
    const terms = new Set(rows.map((row) => row.termCode));
    expect(terms.size).toBeGreaterThan(1);
  });

  it("maps bulletin term labels to term codes", () => {
    expect(parseTermLabel("Fall 2026")).toBe("20263");
    expect(parseTermLabel("Spring 2027")).toBe("20271");
    expect(parseTermLabel("Summer 2026")).toBe("20262");
    expect(parseTermLabel("not a term")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

describe("shared: day codes", () => {
  it("handles space-separated bulletin codes", () => {
    expect(parseWeekdayCodes("M W")).toEqual(["Mo", "We"]);
    expect(parseWeekdayCodes("T Th")).toEqual(["Tu", "Th"]);
    expect(parseWeekdayCodes("F")).toEqual(["Fr"]);
  });

  it("handles concatenated codes in both letter systems", () => {
    expect(parseWeekdayCodes("MW")).toEqual(["Mo", "We"]);
    expect(parseWeekdayCodes("TR")).toEqual(["Tu", "Th"]);
    expect(parseWeekdayCodes("TTh")).toEqual(["Tu", "Th"]);
    expect(parseWeekdayCodes("MWF")).toEqual(["Mo", "We", "Fr"]);
    expect(parseWeekdayCodes("MoWeFr")).toEqual(["Mo", "We", "Fr"]);
    expect(parseWeekdayCodes("TuTh")).toEqual(["Tu", "Th"]);
  });

  it("handles full day names and dedupes", () => {
    expect(parseWeekdayCodes("Monday")).toEqual(["Mo"]);
    expect(parseWeekdayCodes("Tuesday, Thursday")).toEqual(["Tu", "Th"]);
    expect(parseWeekdayCodes("M M W")).toEqual(["Mo", "We"]);
    expect(parseWeekdayCodes("")).toEqual([]);
  });
});

describe("shared: times", () => {
  it("converts clock times to minutes from midnight", () => {
    expect(parseClockMinute("7:00pm")).toBe(19 * 60);
    expect(parseClockMinute("10:10am")).toBe(610);
    expect(parseClockMinute("12:00pm")).toBe(720);
    expect(parseClockMinute("12:30am")).toBe(30);
    expect(parseClockMinute("7:10P")).toBe(19 * 60 + 10);
    expect(parseClockMinute("1010")).toBe(610);
    expect(parseClockMinute("banana")).toBeNull();
  });

  it("parses ranges in every spelling the pages use", () => {
    expect(parseTimeRange("7:00pm - 9:30pm")).toEqual({ startMinute: 1140, endMinute: 1290 });
    expect(parseTimeRange("10:10am-11:25am")).toEqual({ startMinute: 610, endMinute: 685 });
    expect(parseTimeRange("1010 1240")).toEqual({ startMinute: 610, endMinute: 760 });
    expect(parseTimeRange("nope")).toBeNull();
  });

  it("splits building from room", () => {
    expect(parseLocation("142 Uris Hall")).toEqual({ room: "142", buildingName: "Uris Hall" });
    expect(parseLocation("963 Ext Schermerhorn Hall")).toEqual({
      room: "963",
      buildingName: "Ext Schermerhorn Hall",
    });
    expect(parseLocation("Room TBA")).toEqual({ room: null, buildingName: null });
    expect(parseLocation("None None")).toEqual({ room: null, buildingName: null });
    expect(parseLocation("")).toEqual({ room: null, buildingName: null });
  });
});

describe("shared: values", () => {
  it("parses points, ranges and fractions", () => {
    expect(parsePoints("3")).toEqual({ pointsMin: 3, pointsMax: 3 });
    expect(parsePoints("3.00")).toEqual({ pointsMin: 3, pointsMax: 3 });
    expect(parsePoints("1-4")).toEqual({ pointsMin: 1, pointsMax: 4 });
    expect(parsePoints("1.50")).toEqual({ pointsMin: 1.5, pointsMax: 1.5 });
    expect(parsePoints("0")).toEqual({ pointsMin: 0, pointsMax: 0 });
    expect(parsePoints("Variable")).toEqual({ pointsMin: null, pointsMax: null });
  });

  it("splits instructor lists on 'and' and commas", () => {
    expect(splitInstructorList("Adam H Cannon")).toEqual(["Adam H Cannon"]);
    expect(splitInstructorList("Adam H Cannon and Mark Santolucito")).toEqual([
      "Adam H Cannon",
      "Mark Santolucito",
    ]);
    expect(splitInstructorList("Gabriel Chuang, Augustin Chaintreau")).toEqual([
      "Gabriel Chuang",
      "Augustin Chaintreau",
    ]);
    expect(splitInstructorList("A One, B Two and C Three")).toEqual([
      "A One",
      "B Two",
      "C Three",
    ]);
    expect(splitInstructorList("John Smith, Jr.")).toEqual(["John Smith, Jr."]);
    expect(splitInstructorList("TBA")).toEqual([]);
  });

  it("parses enrollment strings including the singular and the Full marker", () => {
    expect(parseEnrollment("115 students (200 max) as of August 22, 2026")).toEqual({
      enrollmentCount: 115,
      enrollmentCap: 200,
      sourceAsOf: "2026-08-22T00:00:00-04:00",
      isFull: false,
    });
    expect(parseEnrollment("1 student (23 max) as of August 22, 2026").enrollmentCount).toBe(1);
    expect(
      parseEnrollment("45 students (45 max) as of August 22, 2026 / Full").isFull,
    ).toBe(true);
    expect(parseEnrollment("").enrollmentCount).toBeNull();
  });

  it("parses both 'as of' spellings into ISO 8601 with the campus offset", () => {
    expect(parseAsOfTimestamp("as of August 22, 2026")).toBe("2026-08-22T00:00:00-04:00");
    expect(parseAsOfTimestamp("as of  5:05PM Saturday, August 22, 2026")).toBe(
      "2026-08-22T17:05:00-04:00",
    );
    // Standard time gets -05:00, not a hard-coded -04:00.
    expect(parseAsOfTimestamp("as of January 15, 2026")).toBe("2026-01-15T00:00:00-05:00");
    expect(parseAsOfTimestamp("who knows")).toBeNull();
  });

  it("renders campus wall clock independently of the host timezone", () => {
    expect(campusWallClockToIso(2026, 7, 4, 13, 30)).toBe("2026-07-04T13:30:00-04:00");
    expect(campusWallClockToIso(2026, 12, 25)).toBe("2026-12-25T00:00:00-05:00");
  });

  it("parses course numbers with leading or trailing qualifiers", () => {
    expect(parseCourseNumber("W1002")).toEqual({ number: 1002, qualifier: "W" });
    expect(parseCourseNumber("1002W")).toEqual({ number: 1002, qualifier: "W" });
    expect(parseCourseNumber("BC1014")).toEqual({ number: 1014, qualifier: "BC" });
    expect(parseCourseNumber("4113")).toEqual({ number: 4113, qualifier: null });
    expect(parseCourseNumber("not-a-course")).toBeNull();
  });

  it("derives status conservatively", () => {
    expect(deriveStatus(10, 20, false)).toBe("open");
    expect(deriveStatus(20, 20, false)).toBe("full");
    expect(deriveStatus(1, 200, true)).toBe("full");
    expect(deriveStatus(null, null, false)).toBe("unknown");
    expect(deriveStatus(1, 2, false, "Waitlist")).toBe("waitlist");
  });

  it("decodes entities and normalizes whitespace", () => {
    expect(decodeHtmlEntities("A &amp; B &mdash; C &#8212; D")).toBe("A & B — C — D");
    expect(cleanText("  Computing   in\n Context&nbsp;  ")).toBe("Computing in Context");
  });

  it("falls back to a sentence cut for prose prerequisites", () => {
    expect(extractPrerequisiteText("Prerequisites: General Chemistry I. This course covers…")).toBe(
      "General Chemistry I.",
    );
    expect(extractPrerequisiteText("No prerequisite header here.")).toBeNull();
    expect(extractPrerequisiteText(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Write protection — spec §10
// ---------------------------------------------------------------------------

describe("shouldQuarantine", () => {
  it("allows a first run, since there is nothing to overwrite", () => {
    expect(shouldQuarantine(null, { recordCount: 155, nonEmptyCount: 155 })).toEqual({
      quarantine: false,
    });
    expect(shouldQuarantine(null, { recordCount: 0, nonEmptyCount: 0 }).quarantine).toBe(false);
  });

  it("allows growth and flat runs", () => {
    const previous = { recordCount: 155, nonEmptyCount: 155 };
    expect(shouldQuarantine(previous, { recordCount: 155, nonEmptyCount: 155 }).quarantine).toBe(
      false,
    );
    expect(shouldQuarantine(previous, { recordCount: 180, nonEmptyCount: 180 }).quarantine).toBe(
      false,
    );
  });

  it("allows legitimate shrinkage below the threshold", () => {
    // A term winding down: a handful of sections genuinely cancelled.
    const decision = shouldQuarantine(
      { recordCount: 155, nonEmptyCount: 155 },
      { recordCount: 120, nonEmptyCount: 120 },
    );
    expect(decision.quarantine).toBe(false);
  });

  it("quarantines a cliff in record count", () => {
    const decision = shouldQuarantine(
      { recordCount: 155, nonEmptyCount: 155 },
      { recordCount: 40, nonEmptyCount: 40 },
    );
    expect(decision.quarantine).toBe(true);
    expect(decision.reason).toMatch(/record count fell 74% \(155 → 40\)/);
  });

  it("quarantines a run that returns nothing at all", () => {
    const decision = shouldQuarantine(
      { recordCount: 155, nonEmptyCount: 155 },
      { recordCount: 0, nonEmptyCount: 0 },
    );
    expect(decision.quarantine).toBe(true);
    expect(decision.reason).toMatch(/produced 0 records/);
  });

  it("quarantines rows that survived but lost their values", () => {
    // The exact silent-breakage case: the <dd> moved, so every row parses but
    // every enrollment reading is null.
    const decision = shouldQuarantine(
      { recordCount: 155, nonEmptyCount: 155 },
      { recordCount: 155, nonEmptyCount: 10 },
    );
    expect(decision.quarantine).toBe(true);
    expect(decision.reason).toMatch(/non-empty readings fell 94%/);
  });

  it("respects the boundary of each default threshold", () => {
    expect(DEFAULT_QUARANTINE_THRESHOLDS.maxRecordDropRatio).toBe(0.3);
    expect(DEFAULT_QUARANTINE_THRESHOLDS.maxNonEmptyDropRatio).toBe(0.5);

    // Exactly 30% down is allowed; a hair more is not.
    expect(
      shouldQuarantine({ recordCount: 100, nonEmptyCount: 100 }, { recordCount: 70, nonEmptyCount: 70 })
        .quarantine,
    ).toBe(false);
    expect(
      shouldQuarantine({ recordCount: 100, nonEmptyCount: 100 }, { recordCount: 69, nonEmptyCount: 69 })
        .quarantine,
    ).toBe(true);

    // Non-empty tolerates twice as much before tripping.
    expect(
      shouldQuarantine({ recordCount: 100, nonEmptyCount: 100 }, { recordCount: 100, nonEmptyCount: 50 })
        .quarantine,
    ).toBe(false);
    expect(
      shouldQuarantine({ recordCount: 100, nonEmptyCount: 100 }, { recordCount: 100, nonEmptyCount: 49 })
        .quarantine,
    ).toBe(true);
  });

  it("honours a caller-supplied threshold", () => {
    const strict = shouldQuarantine(
      { recordCount: 100, nonEmptyCount: 100 },
      { recordCount: 95, nonEmptyCount: 95 },
      { maxRecordDropRatio: 0.01 },
    );
    expect(strict.quarantine).toBe(true);
  });

  it("does not punish tiny samples for ordinary churn", () => {
    // A 2-section subject dropping to 1 is a 50% fall but not evidence of
    // breakage, so only a drop to zero is refused.
    expect(shouldQuarantine({ recordCount: 2, nonEmptyCount: 2 }, { recordCount: 1, nonEmptyCount: 1 })
      .quarantine).toBe(false);
    expect(shouldQuarantine({ recordCount: 2, nonEmptyCount: 2 }, { recordCount: 0, nonEmptyCount: 0 })
      .quarantine).toBe(true);
    expect(shouldQuarantine({ recordCount: 3, nonEmptyCount: 3 }, { recordCount: 3, nonEmptyCount: 0 })
      .quarantine).toBe(true);
  });

  it("refuses incoherent counts instead of throwing", () => {
    const decision = shouldQuarantine(null, { recordCount: 5, nonEmptyCount: 9 });
    expect(decision.quarantine).toBe(true);
    expect(decision.reason).toMatch(/incoherent/);
    expect(shouldQuarantine(null, { recordCount: -1, nonEmptyCount: 0 }).quarantine).toBe(true);
  });

  it("counts a real parsed page the way the pipeline will", () => {
    const sections = parseSubjectPage(SUBJECT_HTML, "COMS", FALL_2026).courses.flatMap(
      (course) => course.sections,
    );
    expect(countSectionRecords(sections)).toEqual({ recordCount: 155, nonEmptyCount: 155 });

    // And the guard lets today's good parse overwrite yesterday's good parse.
    const emptied: ParsedSection[] = sections.map((section) => ({
      ...section,
      enrollmentCount: null,
    }));
    expect(
      shouldQuarantine(countSectionRecords(sections), countSectionRecords(sections)).quarantine,
    ).toBe(false);
    expect(
      shouldQuarantine(countSectionRecords(sections), countSectionRecords(emptied)).quarantine,
    ).toBe(true);
  });
});

describe("parseBulletinCourseBlocks — the prose the directory never publishes", () => {
  const courses = parseBulletinCourseBlocks(BULLETIN_HTML);
  const byId = new Map(courses.map((course) => [course.courseCode, course]));

  it("reads a block wrapped in div.courseblock", () => {
    const course = byId.get("COMS3998W");
    expect(course).toBeDefined();
    expect(course?.pointsMin).toBe(1);
    expect(course?.pointsMax).toBe(3);
    expect(course?.description).toMatch(/^Independent project involving laboratory work/);
    expect(course?.prerequisiteText).toMatch(/^Prerequisites: Approval by a faculty member/);
  });

  /*
   * The same page uses a second layout a few hundred bytes away: a bare
   * `<p class="courseblocktitle">` whose description paragraphs are flat
   * siblings rather than children. A parser that only walked `div.courseblock`
   * would return this course with a title and nothing else — and would look
   * like it had worked.
   */
  it("reads a bare title whose description follows as siblings", () => {
    const course = byId.get("COMS4901W");
    expect(course?.description).toMatch(/^A second-level independent project/);
    expect(course?.prerequisiteText).toMatch(/^Prerequisites: Approval by a faculty member/);
  });

  it("keeps the prerequisite sentence out of the description", () => {
    for (const course of courses) {
      if (!course.description || !course.prerequisiteText) continue;
      expect(course.description).not.toContain(course.prerequisiteText);
    }
  });

  it("emits course ids in the same canonical form as the directory", () => {
    // "COMS W4113" and "COMS E4115" are different courses; the qualifier is
    // part of the identity, not decoration.
    const codes = courses.map((course) => course.courseCode);
    expect(codes).toContain("COMS4111W");
    expect(codes.every((code) => /^[A-Z]{2,5}\d{1,4}[A-Z]?$/.test(code))).toBe(true);
  });

  it("reports unknown credits as null rather than zero", () => {
    // parsePoints returns null for "Variable"; a course with no readable point
    // value must not claim to be worth 0 credits.
    for (const course of courses) {
      if (course.pointsMin === null) continue;
      expect(course.pointsMax).not.toBeNull();
      expect(course.pointsMax!).toBeGreaterThanOrEqual(course.pointsMin);
    }
  });

  it("covers most of the department", () => {
    expect(courses.length).toBeGreaterThan(100);
    expect(courses.filter((course) => course.description).length).toBeGreaterThan(90);
  });
});

// ---------------------------------------------------------------------------
// Academic calendar — Columbia College bulletin
// ---------------------------------------------------------------------------

describe("parseAcademicCalendar — Columbia College bulletin, 2026-2027", () => {
  const CALENDAR_URL = "https://bulletin.columbia.edu/columbia-college/academic-calendar/";
  const fall = parseAcademicCalendar(CALENDAR_HTML, { termCode: "20263", url: CALENDAR_URL });
  const spring = parseAcademicCalendar(CALENDAR_HTML, { termCode: "20271", url: CALENDAR_URL });

  const occursOn = (result: typeof fall, date: string) =>
    result.milestones.filter((m) => m.occursAt.startsWith(date));

  it("reads the month from the row above when the row leaves it blank", () => {
    // The bulletin prints "August" once and leaves the cell empty for the rest
    // of the month. Only the first row of August carries it, so every window
    // below depends on the month carrying down.
    const window = occursOn(fall, "2026-08-10");
    expect(window).toHaveLength(1);
    expect(window[0].kind).toBe("appointment_window");
    expect(window[0].endsAt?.startsWith("2026-08-14")).toBe(true);
  });

  it("dates spring registration to the calendar year it actually happens in", () => {
    // Registration for Spring 2027 runs in November and December 2026 and then
    // again in January 2027. A single term-derived year puts one of those two
    // groups a full year away from the truth.
    expect(occursOn(spring, "2026-11-16")).toHaveLength(1);
    expect(occursOn(spring, "2027-01-04")).toHaveLength(1);
    expect(occursOn(spring, "2027-01-04")[0].endsAt?.startsWith("2027-01-15")).toBe(true);
  });

  it("keeps a deadline in its own term when the text mentions another one", () => {
    // "End of Change of Program period ... Last day to uncover letter grade for
    // Fall 2026 course taken Pass/D/Fail" is a SPRING deadline that names Fall.
    const springDeadline = occursOn(spring, "2027-01-29").filter(
      (m) => m.kind === "add_drop_deadline",
    );
    expect(springDeadline).toHaveLength(1);
    expect(occursOn(fall, "2027-01-29")).toHaveLength(0);

    // Its Fall counterpart names "Spring or Summer 2026" and must stay in Fall.
    expect(occursOn(fall, "2026-09-18").some((m) => m.kind === "add_drop_deadline")).toBe(true);
  });

  it("files registration under the term being registered for, not the section it sits in", () => {
    // April 2027 opens Fall 2027 registration but is printed in the Spring 2027
    // section. Neither term in scope should claim it.
    expect(occursOn(spring, "2027-04-12")).toHaveLength(0);
    expect(occursOn(fall, "2027-04-12")).toHaveLength(0);
    expect(parseAcademicCalendar(CALENDAR_HTML, { termCode: "20273" }).milestones).toHaveLength(1);
  });

  it("records the first day of classes for both terms", () => {
    expect(occursOn(fall, "2026-09-08").some((m) => m.kind === "term_start")).toBe(true);
    expect(occursOn(spring, "2027-01-19").some((m) => m.kind === "term_start")).toBe(true);
  });

  it("reports the first and last day of instruction for the .ics recurrence", () => {
    // The per-season fallback in lib/schedule/term-dates.ts opens Fall on
    // September 2 and Spring on January 20. Both are wrong here, in opposite
    // directions: a phantom first week for Fall, a missing first Tuesday for
    // Spring.
    expect(fall.termStartsOn).toBe("2026-09-08");
    expect(fall.termEndsOn).toBe("2026-12-14");
    expect(spring.termStartsOn).toBe("2027-01-19");
    expect(spring.termEndsOn).toBe("2027-05-03");
  });

  it("withholds term bounds from a whole-page parse", () => {
    // Without a term filter the page covers an academic year, and pairing one
    // term's first day with another's last would bound a recurrence across two
    // semesters.
    const wholePage = parseAcademicCalendar(CALENDAR_HTML, { url: CALENDAR_URL });
    expect(wholePage.termStartsOn).toBeUndefined();
    expect(wholePage.termEndsOn).toBeUndefined();
  });

  it("stamps every milestone with the page it came from", () => {
    expect(fall.milestones.length).toBeGreaterThan(0);
    expect(fall.milestones.every((m) => m.sourceUrl === CALENDAR_URL)).toBe(true);
  });
});

describe("termCodeFromHeading", () => {
  it("prefers a season adjacent to a year over the first season in the heading", () => {
    // The bulletin's August table is titled "Late Summer Dates and Deadlines
    // related to the Fall 2026 term". Scanning for the first season and the
    // first year independently reads that as Summer 2026.
    expect(termCodeFromHeading("Late Summer Dates and Deadlines related to the Fall 2026 term")).toBe(
      "20263",
    );
    expect(termCodeFromHeading("Fall Term 2026")).toBe("20263");
    expect(termCodeFromHeading("Spring Term 2027")).toBe("20271");
    expect(termCodeFromHeading("2026 Fall")).toBe("20263");
    expect(termCodeFromHeading("Academic Calendar")).toBeNull();
  });
});

describe("calendarYearFor", () => {
  it("splits an academic year at August for fall and spring terms", () => {
    expect(calendarYearFor("20263", 8)).toBe(2026);
    expect(calendarYearFor("20263", 1)).toBe(2027);
    expect(calendarYearFor("20271", 11)).toBe(2026);
    expect(calendarYearFor("20271", 1)).toBe(2027);
  });

  it("leaves summer inside its own calendar year", () => {
    // Summer 2027 runs May-August 2027; the academic-year split would push its
    // own months into 2028.
    expect(calendarYearFor("20262", 5)).toBe(2026);
    expect(calendarYearFor("20262", 8)).toBe(2026);
  });
});
