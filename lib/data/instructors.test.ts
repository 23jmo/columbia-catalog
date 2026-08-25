import { describe, expect, it } from "vitest";

import { CURRENT_TERM } from "@/lib/constants";
import { loadInstructorProfile } from "@/lib/data/instructors";
import { instructorSlug } from "@/lib/data/instructor-slug";

describe("loadInstructorProfile", () => {
  it("resolves a seeded COMS instructor without loading the whole catalog", async () => {
    const data = await loadInstructorProfile("adam-h-cannon", CURRENT_TERM);
    expect(data).not.toBeNull();
    expect(data?.name).toBe("Adam H Cannon");
    expect(data?.slug).toBe(instructorSlug("Adam H Cannon"));
    expect(data?.courses.length).toBeGreaterThan(0);
    expect(data?.sectionCount).toBeGreaterThan(0);
  });

  it("returns null for an unknown slug", async () => {
    await expect(loadInstructorProfile("nobody-named-this", CURRENT_TERM)).resolves.toBeNull();
  });
});
