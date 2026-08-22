import { courseLevel } from "./constants";
import type { Section } from "./types";

export type CatalogFilters = {
  query: string;
  openOnly: boolean;
  level: "all" | "1000" | "2000" | "3000" | "4000";
  credits: "all" | "0" | "1-2" | "3" | "4";
};

export const EMPTY_FILTERS: CatalogFilters = {
  query: "",
  openOnly: false,
  level: "all",
  credits: "all",
};

function matchesQuery(section: Section, query: string): boolean {
  if (!query) return true;
  const hay = [
    section.title,
    section.courseIdentifier,
    section.courseNumber,
    section.callNumber,
    section.section,
    ...section.instructors,
    section.notes ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(query);
}

function matchesLevel(section: Section, level: CatalogFilters["level"]): boolean {
  if (level === "all") return true;
  const n = courseLevel(section.courseNumber);
  if (level === "4000") return n >= 4000;
  const base = Number(level);
  return n >= base && n < base + 1000;
}

function matchesCredits(section: Section, credits: CatalogFilters["credits"]): boolean {
  if (credits === "all") return true;
  const { min, max } = section.credits;
  if (credits === "0") return max === 0;
  if (credits === "1-2") return min >= 1 && max <= 2;
  if (credits === "3") return min <= 3 && max >= 3;
  return max >= 4;
}

export function filterSections(sections: Section[], filters: CatalogFilters): Section[] {
  const query = filters.query.trim().toLowerCase();
  return sections.filter((section) => {
    if (filters.openOnly && section.enrollment.status !== "open") return false;
    if (!matchesLevel(section, filters.level)) return false;
    if (!matchesCredits(section, filters.credits)) return false;
    return matchesQuery(section, query);
  });
}

export function groupByCourse(sections: Section[]): { key: string; sections: Section[] }[] {
  const groups = new Map<string, Section[]>();
  for (const section of sections) {
    const key = section.courseIdentifier;
    const list = groups.get(key) ?? [];
    list.push(section);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, rows]) => ({ key, sections: rows }));
}
