// Fall 2026 is the default first view. One subject per request.
export const DEFAULT_SUBJECT = "COMS";
export const DEFAULT_TERM_LABEL = "Fall2026";
export const DEFAULT_TERM_NAME = "Fall 2026";
export const DEFAULT_TERM_CODE = "20263";

// Cache public directory HTML for 10 minutes. Conservative pacing.
export const REVALIDATE_SECONDS = 600;

export const DIRECTORY_ORIGIN = "https://doc.sis.columbia.edu";
export const BULLETIN_ORIGIN = "https://bulletin.columbia.edu";

export const SUBJECT_CODE_RE = /^[A-Z0-9_]{2,6}$/;

export function subjectPageUrl(subject: string, termLabel = DEFAULT_TERM_LABEL): string {
  return `${DIRECTORY_ORIGIN}/subj/${subject}/_${termLabel}.html`;
}

export function sectionPageUrl(subject: string, classIdentifier: string): string {
  return `${DIRECTORY_ORIGIN}/subj/${subject}/${classIdentifier}/`;
}

export function subjectsIndexUrl(): string {
  return `${DIRECTORY_ORIGIN}/sel/subjects.html`;
}

export function normalizeSubject(raw: string | undefined): string {
  const code = (raw ?? DEFAULT_SUBJECT).trim().toUpperCase();
  return SUBJECT_CODE_RE.test(code) ? code : DEFAULT_SUBJECT;
}

// Numeric course level from W4113 / BC1014 / E6113.
export function courseLevel(courseNumber: string): number {
  const match = courseNumber.match(/(\d{4})/);
  return match ? Number(match[1]) : 0;
}
