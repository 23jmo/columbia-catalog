import {
  DEFAULT_SUBJECT,
  DEFAULT_TERM_NAME,
  normalizeSubject,
  sectionPageUrl,
  subjectPageUrl,
  subjectsIndexUrl,
} from "./constants";
import { bulletinUrlFor } from "./bulletinMap";
import { fetchPublicHtml } from "./fetchPublic";
import { joinBulletinMeetings, parseBulletinMeetings } from "./parseBulletin";
import { parseSectionDetail } from "./parseSectionDetail";
import { parseSubjectPage } from "./parseDirectory";
import { parseSubjectsIndex } from "./parseSubjects";
import type { CatalogResult, Section, SectionDetail, SubjectOption } from "./types";

export async function loadSubjects(): Promise<SubjectOption[]> {
  try {
    const html = await fetchPublicHtml(subjectsIndexUrl());
    if (!html) {
      return [{ code: DEFAULT_SUBJECT, name: "Computer Science" }];
    }
    const parsed = parseSubjectsIndex(html);
    return parsed.length > 0
      ? parsed
      : [{ code: DEFAULT_SUBJECT, name: "Computer Science" }];
  } catch {
    return [{ code: DEFAULT_SUBJECT, name: "Computer Science" }];
  }
}

export async function loadCatalog(rawSubject?: string): Promise<CatalogResult> {
  const subject = normalizeSubject(rawSubject);
  const fetchedAt = new Date().toISOString();

  let html: string | null = null;
  try {
    html = await fetchPublicHtml(subjectPageUrl(subject));
  } catch {
    html = null;
  }

  if (!html) {
    return {
      ok: false,
      subject,
      term: DEFAULT_TERM_NAME,
      sections: [],
      fetchedAt,
      bulletinJoined: false,
      error:
        "Could not load the public Directory of Classes. Check the network and try again.",
    };
  }

  try {
    const sections = parseSubjectPage(html, fetchedAt);
    let bulletinJoined = false;

    // Optional: join meeting times from one bulletin page. Never required.
    const bulletinUrl = bulletinUrlFor(subject);
    if (bulletinUrl) {
      const bulletinHtml = await fetchPublicHtml(bulletinUrl);
      if (bulletinHtml) {
        joinBulletinMeetings(sections, parseBulletinMeetings(bulletinHtml));
        bulletinJoined = sections.some((row) => row.source === "directory+bulletin");
      }
    }

    const title = html.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
    const subjectName = title.replace(/^Fall \d{4} Subject:\s*/i, "").trim() || undefined;

    return {
      ok: sections.length > 0,
      subject,
      subjectName,
      term: sections[0]?.term ?? DEFAULT_TERM_NAME,
      sections,
      fetchedAt,
      bulletinJoined,
      error:
        sections.length === 0
          ? `No Fall 2026 sections parsed for ${subject}.`
          : undefined,
    };
  } catch {
    return {
      ok: false,
      subject,
      term: DEFAULT_TERM_NAME,
      sections: [],
      fetchedAt,
      bulletinJoined: false,
      error: "The public directory HTML could not be parsed.",
    };
  }
}

export async function loadSectionDetail(
  subject: string,
  classIdentifier: string,
  listSection?: Section,
): Promise<SectionDetail | null> {
  const fetchedAt = new Date().toISOString();
  try {
    const html = await fetchPublicHtml(sectionPageUrl(subject, classIdentifier));
    if (!html) {
      return listSection ? { ...listSection, fetchedAt } : null;
    }
    return parseSectionDetail(html, listSection, fetchedAt);
  } catch {
    return listSection ? { ...listSection, fetchedAt } : null;
  }
}
