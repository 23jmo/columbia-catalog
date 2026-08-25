import { describe, expect, it } from "vitest";

import { decodeHexGlyphs, parseToUnicode } from "./pdf-cmap";

describe("parseToUnicode", () => {
  it("maps a bfrange array the way pdfmake writes one", () => {
    const cmap = parseToUnicode(`
1 beginbfrange
<0001> <0004> [<0043> <004f> <004d> <0053>]
endbfrange
`);
    expect(decodeHexGlyphs("0001000200030004", cmap)).toBe("COMS");
  });

  it("does not treat the array dests as a sequential range", () => {
    const cmap = parseToUnicode(`
1 beginbfrange
<0000> <0002> [<004e> <0061> <006d>]
endbfrange
`);
    expect(cmap.get(0)).toBe("N");
    expect(cmap.get(1)).toBe("a");
    expect(cmap.get(2)).toBe("m");
  });

  it("falls back to Latin-1 bytes when there is no CMap", () => {
    expect(decodeHexGlyphs("4849", null)).toBe("HI");
  });
});
