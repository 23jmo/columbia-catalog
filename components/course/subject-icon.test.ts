import { describe, expect, it } from "vitest";
import {
  RiBook2Line,
  RiCodeLine,
  RiFlaskLine,
  RiRunLine,
} from "@remixicon/react";

import { resolveSubjectIcon } from "./subject-icon";

describe("resolveSubjectIcon", () => {
  it("maps known subject codes", () => {
    expect(resolveSubjectIcon("COMS")).toBe(RiCodeLine);
    expect(resolveSubjectIcon("CHEM")).toBe(RiFlaskLine);
    expect(resolveSubjectIcon("PHED")).toBe(RiRunLine);
  });

  it("matches prefixes for related codes", () => {
    expect(resolveSubjectIcon("SPAN1201")).toBe(resolveSubjectIcon("SPAN"));
  });

  it("falls back to a book icon", () => {
    expect(resolveSubjectIcon("ZZZZ")).toBe(RiBook2Line);
  });
});
