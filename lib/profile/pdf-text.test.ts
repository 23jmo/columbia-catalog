import { describe, expect, it } from "vitest";

import { extractPdfText } from "./pdf-text";

/**
 * A tiny Identity-H PDF: one page, one font, one ToUnicode range, one TJ.
 * Uncompressed so a regression in Flate handling still exercises CMap + Tm.
 */
function identityPdf(): ArrayBuffer {
  const cmap = `%PDF-placeholder
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
1 begincodespacerange
<0000><ffff>
endcodespacerange
1 beginbfrange
<0001> <0008> [<0043> <004f> <004d> <0053> <0020> <0057> <0033> <0031>]
endbfrange
endcmap
end
end
`.trim();

  const content = `BT
1 0 0 1 40 700 Tm
/F1 10 Tf
[<00010002000300040005000600070008> 0] TJ
ET
`;

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${content.length} >> stream\n${content}endstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type0 /Encoding /Identity-H /ToUnicode 6 0 R >> endobj",
    `6 0 obj << /Length ${cmap.length} >> stream\n${cmap}endstream endobj`,
  ];

  const body = `%PDF-1.3\n${objects.join("\n")}\ntrailer << /Root 1 0 R >>\n%%EOF\n`;
  return new TextEncoder().encode(body).buffer;
}

describe("extractPdfText", () => {
  it("decodes Identity-H TJ operators through a ToUnicode CMap", async () => {
    const extraction = await extractPdfText(identityPdf());
    expect(extraction.streamsRead).toBeGreaterThan(0);
    expect(extraction.text).toContain("COMS W31");
  });
});
