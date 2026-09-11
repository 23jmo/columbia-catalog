/**
 * Shared schedule — the server half.
 *
 * Reads the anonymous `get_shared_schedule` RPC (migration 0038) with a
 * cookie-free client: the reader is usually not signed in, and a share page
 * must render identically whether they are or not. The token is the only
 * credential; a bad or revoked token comes back as `null`, never as an error
 * the page has to interpret.
 */

import { getCoursesByIds, getSections } from "@/lib/data/catalog";
import type { Course, CustomBlock, Section, TermCode } from "@/lib/types";

import { createAnonServerClient } from "./client";

export interface SharedSchedule {
  planId: string;
  termCode: TermCode;
  name: string;
  ownerName: string | null;
  sectionIds: string[];
  customBlocks: CustomBlock[];
}

export interface ResolvedSharedSchedule extends SharedSchedule {
  sections: Section[];
  courses: Course[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readShared(value: unknown): SharedSchedule | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.planId !== "string" || typeof record.termCode !== "string") return null;
  return {
    planId: record.planId,
    termCode: record.termCode as TermCode,
    name: typeof record.name === "string" ? record.name : "My schedule",
    ownerName: typeof record.ownerName === "string" ? record.ownerName : null,
    sectionIds: Array.isArray(record.sectionIds)
      ? record.sectionIds.filter((id): id is string => typeof id === "string")
      : [],
    customBlocks: Array.isArray(record.customBlocks) ? (record.customBlocks as CustomBlock[]) : [],
  };
}

export async function loadSharedSchedule(token: string): Promise<ResolvedSharedSchedule | null> {
  if (!UUID.test(token)) return null;
  const client = createAnonServerClient();
  if (!client) return null;

  const { data, error } = await client.rpc("get_shared_schedule", { p_share_token: token });
  if (error) return null;
  const shared = readShared(data);
  if (!shared) return null;

  const sections = shared.sectionIds.length > 0 ? await getSections(shared.sectionIds) : [];
  const courseIds = [...new Set(sections.map((section) => section.courseId))];
  const courses = courseIds.length > 0 ? await getCoursesByIds(courseIds, shared.termCode) : [];

  return { ...shared, sections, courses };
}
