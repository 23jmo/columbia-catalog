/**
 * Catalog URLs for /sitemap.xml — every course and instructor page in the
 * current term.
 *
 * These are the long-tail pages a student actually searches for
 * ("COMS 4118 Columbia", a professor's name). Each path matches the
 * canonical its page's `generateMetadata` emits, so the sitemap never lists
 * a URL Google would then be told is a duplicate.
 */

/** A single-section course is canonical at its section URL. */
export function courseSitemapPath(courseId: string, loneSectionCode: string | null): string {
  const base = `/course/${encodeURIComponent(courseId)}`;
  return loneSectionCode ? `${base}?section=${encodeURIComponent(loneSectionCode)}` : base;
}

export function catalogSitemapPaths(
  courses: { courseId: string; sections: { termCode: string; sectionCode: string }[] }[],
  instructors: { slug: string }[],
  termCode: string,
): string[] {
  const coursePaths = courses.flatMap((course) => {
    const sections = course.sections.filter((section) => section.termCode === termCode);
    if (sections.length === 0) return [];
    return [courseSitemapPath(course.courseId, sections.length === 1 ? sections[0].sectionCode : null)];
  });
  const instructorPaths = instructors.map((instructor) => `/instructor/${instructor.slug}`);
  return [...new Set([...coursePaths, ...instructorPaths])];
}
