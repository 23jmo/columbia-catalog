/** Client-safe CULPA link helpers. No parser or server dependency belongs here. */

export const CULPA_HOME_URL = "https://culpa.info";

const PROFESSOR_PATH = /^\/professor\/\d+\/?$/;

/**
 * Only CULPA's canonical numeric professor route may leave our redirector.
 * Stored review URLs are third-party data, so origin and path are both checked.
 */
export function canonicalCulpaProfessorUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== CULPA_HOME_URL || !PROFESSOR_PATH.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Every instructor-facing CULPA button uses this one app-owned resolver. */
export function culpaInstructorHref(instructorName: string): string {
  return `/api/culpa/instructor?name=${encodeURIComponent(instructorName)}`;
}

