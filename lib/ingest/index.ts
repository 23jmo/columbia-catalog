/**
 * LionPlan — ingest lane public surface.
 *
 * The parsers are pure `(html) => data` functions with no I/O: the crawler
 * fetches, this module parses, `quarantine.ts` decides whether the result is
 * safe to commit. Clients are never trusted to parse — the server always runs
 * these against the raw HTML a worker posts back (spec §10).
 */

export {
  parseSubjectPage,
  parseSubjectPageNotes,
} from "./parsers/subject-page";

export {
  parseSectionDetail,
  type ParsedSectionDetailWithExtras,
  type SectionDetailExtras,
} from "./parsers/section-detail";

export {
  parseSubjectIndex,
  parseSubjectIndexAvailability,
  subjectIndexUrls,
} from "./parsers/subject-index";

export {
  parseBulletinCourseBlocks,
  parseBulletinDepartment,
  parseTermLabel,
  type BulletinParseOptions,
  type ParsedBulletinCourse,
  type ParsedBulletinRowWithTerm,
} from "./parsers/bulletin";

export {
  blankToNull,
  buildCourseId,
  buildSectionId,
  campusWallClockToIso,
  cleanText,
  decodeHtmlEntities,
  deriveStatus,
  extractPrerequisiteText,
  normalizeLabel,
  normalizeWhitespace,
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
  buildMeetings,
  type ParsedCourseNumber,
  type ParsedEnrollment,
  type ParsedLocation,
  type ParsedPoints,
  type TimeRange,
} from "./parsers/shared";

export {
  countSectionRecords,
  shouldQuarantine,
  DEFAULT_QUARANTINE_THRESHOLDS,
  type IngestCounts,
  type QuarantineDecision,
  type QuarantineThresholds,
} from "./quarantine";
