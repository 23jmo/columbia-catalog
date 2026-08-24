/**
 * How a course id is spelled for a reader.
 *
 * Its own module, not part of `lib/progression/catalog.ts`, because that file
 * imports the generated catalog JSON. The planner needs to name courses in its
 * issue messages, and it should not have to pull the whole catalog in to do it.
 */

/**
 * "COMS4111W" → "COMS W4111", the form the bulletin and students both use.
 *
 * The qualifier is printed before the number, not after — Columbia writes
 * "COMS W4111" and "MATH UN1201", while the id keeps it last so ids sort by
 * subject and number. Anything that does not match is returned unchanged, so a
 * malformed id shows up as itself rather than as a silent blank.
 */
export function formatCourseId(courseId: string): string {
  const match = /^([A-Z]{2,5})(\d{4})([A-Z]{0,3})$/.exec(courseId);
  if (!match) return courseId;
  const [, subject, number, qualifier] = match;
  return `${subject} ${qualifier}${number}`;
}
