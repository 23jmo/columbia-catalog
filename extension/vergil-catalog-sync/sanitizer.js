(function installVergilSanitizer(root) {
  "use strict";

  const WEEKDAYS = new Map([
    ["su", "Su"],
    ["sun", "Su"],
    ["sunday", "Su"],
    ["mo", "Mo"],
    ["mon", "Mo"],
    ["monday", "Mo"],
    ["tu", "Tu"],
    ["tue", "Tu"],
    ["tues", "Tu"],
    ["tuesday", "Tu"],
    ["we", "We"],
    ["wed", "We"],
    ["wednesday", "We"],
    ["th", "Th"],
    ["thu", "Th"],
    ["thur", "Th"],
    ["thurs", "Th"],
    ["thursday", "Th"],
    ["fr", "Fr"],
    ["fri", "Fr"],
    ["friday", "Fr"],
    ["sa", "Sa"],
    ["sat", "Sa"],
    ["saturday", "Sa"],
  ]);

  // Columbia uses ampersands in a small set of real subject/course prefixes,
  // including A&H. Spaces and hyphens are stripped before this allowlist.
  const COURSE_ID = /^[A-Z&]{2,6}\d{1,5}[A-Z]{0,3}$/;
  const SECTION_CODE = /^[A-Z0-9]{1,5}$/;
  const TERM_CODE = /^\d{4,6}$/;
  const CALL_NUMBER = /^\d{1,10}$/;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function cleanString(value, maxLength) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const cleaned = String(value).replace(/\s+/g, " ").trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxLength);
  }

  function firstString(values, maxLength) {
    for (const value of values) {
      const cleaned = cleanString(value, maxLength);
      if (cleaned) return cleaned;
    }
    return null;
  }

  function normalizedIdentifier(value, pattern, maxLength) {
    const cleaned = cleanString(value, maxLength)?.replace(/[\s-]/g, "").toUpperCase() ?? null;
    return cleaned && pattern.test(cleaned) ? cleaned : null;
  }

  function parseMinutes(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value >= 0 && value <= 1440 && Number.isInteger(value)) return value;
      return null;
    }

    const text = cleanString(value, 32)?.toLowerCase();
    if (!text) return null;

    const twelveHour = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?m\.?$/.exec(text);
    if (twelveHour) {
      let hour = Number(twelveHour[1]);
      const minute = Number(twelveHour[2]);
      if (hour < 1 || hour > 12 || minute > 59) return null;
      if (hour === 12) hour = 0;
      if (twelveHour[3] === "p") hour += 12;
      return hour * 60 + minute;
    }

    const twentyFourHour = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
    if (twentyFourHour) {
      const hour = Number(twentyFourHour[1]);
      const minute = Number(twentyFourHour[2]);
      if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
      return hour * 60 + minute;
    }

    return null;
  }

  function parseWeekdays(value) {
    const inputs = Array.isArray(value) ? value : [value];
    const days = [];

    for (const input of inputs) {
      const text = cleanString(input, 80);
      if (!text) continue;
      const tokens = text.split(/[\s,;/|]+/).filter(Boolean);
      for (const token of tokens) {
        const day = WEEKDAYS.get(token.toLowerCase().replace(/\./g, ""));
        if (day && !days.includes(day)) days.push(day);
      }
    }

    return days;
  }

  function meetingPatternDetails(meeting) {
    if (!isObject(meeting)) return [];
    const pattern = isObject(meeting.meeting_pattern) ? meeting.meeting_pattern : {};
    const candidates = [
      pattern.meetingpatterndetail_set,
      pattern.meeting_pattern_detail_set,
      pattern.details,
      meeting.meetingpatterndetail_set,
      meeting.meeting_pattern_detail_set,
      meeting.details,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) return candidate;
    }

    return [meeting];
  }

  function locationOf(meeting, detail) {
    const room = isObject(meeting.room)
      ? meeting.room
      : isObject(detail.room)
        ? detail.room
        : {};
    const building = isObject(room.building) ? room.building : {};

    return {
      buildingName: firstString(
        [
          building.building_name,
          building.name,
          room.building_name,
          meeting.building_name,
          detail.building_name,
        ],
        160,
      ),
      room: firstString(
        [room.room_number, room.room_name, room.name, meeting.room_number, detail.room_number],
        80,
      ),
    };
  }

  function sanitizeMeetingDetail(meeting, detail) {
    if (!isObject(detail)) return [];
    const weekdays = parseWeekdays(
      detail.week_day ?? detail.weekday ?? detail.day ?? meeting.week_day ?? meeting.weekday,
    );
    const startMinute = parseMinutes(
      detail.from_time ?? detail.start_time ?? detail.startMinute ?? meeting.from_time,
    );
    const endMinute = parseMinutes(
      detail.to_time ?? detail.end_time ?? detail.endMinute ?? meeting.to_time,
    );

    if (weekdays.length === 0 || startMinute === null || endMinute === null) return [];
    if (endMinute <= startMinute || endMinute > 1440) return [];

    const location = locationOf(meeting, detail);
    return weekdays.map((weekday) => ({ weekday, startMinute, endMinute, ...location }));
  }

  function sanitizeMeetings(value) {
    if (!Array.isArray(value)) return [];
    const deduped = new Map();

    for (const meeting of value) {
      for (const detail of meetingPatternDetails(meeting)) {
        for (const normalized of sanitizeMeetingDetail(meeting, detail)) {
          const key = [
            normalized.weekday,
            normalized.startMinute,
            normalized.endMinute,
            normalized.buildingName ?? "",
            normalized.room ?? "",
          ].join(":");
          deduped.set(key, normalized);
        }
      }
    }

    return [...deduped.values()];
  }

  function termFromClass(section) {
    const courseTerm = isObject(section.course_term) ? section.course_term : {};
    const termCalendar = isObject(courseTerm.term_calendar) ? courseTerm.term_calendar : {};
    return normalizedIdentifier(
      section.term_calendar_code ??
        courseTerm.term_calendar_code ??
        termCalendar.term_calendar_code ??
        termCalendar.code,
      TERM_CODE,
      6,
    );
  }

  function courseIdFrom(course, section) {
    const courseTerm = isObject(section.course_term) ? section.course_term : {};
    return normalizedIdentifier(
      course.course_identifier2 ??
        course.course_identifier ??
        courseTerm.course_identifier2 ??
        courseTerm.course_identifier,
      COURSE_ID,
      16,
    );
  }

  function sectionCodeFrom(section, courseId) {
    const direct = normalizedIdentifier(section.section_code ?? section.class_suffix, SECTION_CODE, 5);
    if (direct) return direct;

    const classIdentifier = normalizedIdentifier(section.class_identifier, /^[A-Z0-9&]{3,24}$/, 24);
    if (classIdentifier && courseId && classIdentifier.startsWith(courseId)) {
      const suffix = classIdentifier.slice(courseId.length);
      return SECTION_CODE.test(suffix) ? suffix : null;
    }
    return null;
  }

  function sanitizeSection(course, section, observedAt) {
    if (!isObject(course) || !isObject(section)) return null;
    const courseId = courseIdFrom(course, section);
    const sectionCode = sectionCodeFrom(section, courseId);
    const termCode = termFromClass(section);
    const callNumber = normalizedIdentifier(section.class_number, CALL_NUMBER, 10);

    if (!courseId || !sectionCode || !termCode || !callNumber) return null;

    return {
      sectionKey: `${termCode}${courseId}${sectionCode}`,
      termCode,
      courseId,
      sectionCode,
      callNumber,
      meetings: sanitizeMeetings(section.meeting_details),
      observedAt,
      provenance: "Vergil course search",
    };
  }

  function sanitizeCourseSearchResponse(payload, capturedAt) {
    const observedAt = cleanString(capturedAt, 40);
    if (!observedAt || Number.isNaN(Date.parse(observedAt))) return [];
    if (!isObject(payload) || !isObject(payload.data) || !Array.isArray(payload.data.courses)) {
      return [];
    }

    const sections = new Map();
    for (const course of payload.data.courses) {
      if (!isObject(course) || !isObject(course.class_data)) continue;
      const classes = Array.isArray(course.class_data.classes) ? course.class_data.classes : [];
      for (const section of classes) {
        const sanitized = sanitizeSection(course, section, observedAt);
        if (!sanitized) continue;
        const existing = sections.get(sanitized.sectionKey);
        if (!existing || sanitized.meetings.length >= existing.meetings.length) {
          sections.set(sanitized.sectionKey, sanitized);
        }
      }
    }

    return [...sections.values()];
  }

  function isSanitizedSection(value) {
    if (!isObject(value)) return false;
    if (value.sectionKey !== `${value.termCode}${value.courseId}${value.sectionCode}`) return false;
    if (!TERM_CODE.test(value.termCode) || !COURSE_ID.test(value.courseId)) return false;
    if (!SECTION_CODE.test(value.sectionCode) || !CALL_NUMBER.test(value.callNumber)) return false;
    if (typeof value.observedAt !== "string" || Number.isNaN(Date.parse(value.observedAt))) return false;
    if (value.provenance !== "Vergil course search" || !Array.isArray(value.meetings)) return false;
    return value.meetings.every((meeting) => {
      if (!isObject(meeting) || !WEEKDAYS.has(String(meeting.weekday).toLowerCase())) return false;
      if (!Number.isInteger(meeting.startMinute) || !Number.isInteger(meeting.endMinute)) return false;
      if (meeting.startMinute < 0 || meeting.endMinute > 1440) return false;
      if (meeting.endMinute <= meeting.startMinute) return false;
      return (
        (meeting.buildingName === null || typeof meeting.buildingName === "string") &&
        (meeting.room === null || typeof meeting.room === "string")
      );
    });
  }

  root.ColumbiaCatalogVergilSanitizer = Object.freeze({
    isSanitizedSection,
    parseMinutes,
    parseWeekdays,
    sanitizeCourseSearchResponse,
    sanitizeMeetings,
  });
})(globalThis);
