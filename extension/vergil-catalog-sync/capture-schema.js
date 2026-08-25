(function installCaptureSchema(root) {
  "use strict";

  const WEEKDAYS = new Set(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeNullableString(value, maxLength) {
    if (value === null) return null;
    if (typeof value !== "string" || value.length > maxLength) return undefined;
    return value;
  }

  function normalizeMeeting(value) {
    if (!isObject(value) || !WEEKDAYS.has(value.weekday)) return null;
    if (!Number.isInteger(value.startMinute) || !Number.isInteger(value.endMinute)) return null;
    if (value.startMinute < 0 || value.endMinute > 1440 || value.endMinute <= value.startMinute) {
      return null;
    }

    const buildingName = normalizeNullableString(value.buildingName, 160);
    const room = normalizeNullableString(value.room, 80);
    if (buildingName === undefined || room === undefined) return null;

    return {
      weekday: value.weekday,
      startMinute: value.startMinute,
      endMinute: value.endMinute,
      buildingName,
      room,
    };
  }

  function normalizeSection(value) {
    if (!isObject(value)) return null;
    if (!/^\d{4,6}$/.test(value.termCode)) return null;
    if (!/^[A-Z&]{2,6}\d{1,5}[A-Z]{0,3}$/.test(value.courseId)) return null;
    if (!/^[A-Z0-9]{1,5}$/.test(value.sectionCode)) return null;
    if (!/^\d{1,10}$/.test(value.callNumber)) return null;
    if (value.sectionKey !== `${value.termCode}${value.courseId}${value.sectionCode}`) return null;
    if (value.provenance !== "Vergil course search") return null;
    if (typeof value.observedAt !== "string" || Number.isNaN(Date.parse(value.observedAt))) return null;
    if (!Array.isArray(value.meetings) || value.meetings.length > 28) return null;

    const meetings = value.meetings.map(normalizeMeeting);
    if (meetings.some((meeting) => meeting === null)) return null;

    // Reconstruct the object so a spoofed page event cannot smuggle unrelated
    // fields through a record that otherwise has a valid catalog identity.
    return {
      sectionKey: value.sectionKey,
      termCode: value.termCode,
      courseId: value.courseId,
      sectionCode: value.sectionCode,
      callNumber: value.callNumber,
      meetings,
      observedAt: value.observedAt,
      provenance: value.provenance,
    };
  }

  function normalizeSections(value, maxBatchSize = 500) {
    if (!Array.isArray(value) || value.length === 0 || value.length > maxBatchSize) return null;
    const sections = value.map(normalizeSection);
    if (sections.some((section) => section === null)) return null;
    return sections;
  }

  root.LionPlanCaptureSchema = Object.freeze({ normalizeSection, normalizeSections });
})(globalThis);
