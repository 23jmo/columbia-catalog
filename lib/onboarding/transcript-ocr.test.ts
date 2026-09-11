/**
 * The scan path.
 *
 * The bug this covers is not subtle: `pdf-text.ts` says in its own header that
 * the Vergil unofficial record is "JPEGs of the page, not a text layer", and
 * that is the file most students have. It produced an accurate error message
 * and no import, which reads as the upload being broken.
 *
 * `tesseract.js` is stubbed throughout. The worker is several megabytes of WASM
 * and would make this suite minutes long, and what is worth pinning here is the
 * ROUTING — which files reach OCR, which must not, and what happens when it
 * fails — not tesseract's own accuracy.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const recognize = vi.fn();
const terminate = vi.fn(async () => ({}) as never);
const createWorker = vi.fn(async () => ({ recognize, terminate }));

vi.mock("tesseract.js", () => ({ createWorker: (...args: unknown[]) => createWorker(...(args as [])) }));

import { readTranscriptFile } from "./transcript";
import { ocrImages, pdfPageImages, isImageFile } from "./transcript-ocr";

/** What a scan's OCR output actually looks like: no columns, ragged spacing. */
const SCANNED_TEXT = `
Columbia University in the City of New York
Unofficial Record

Fall 2024
COMS W3134 DATA STRUCTURES IN JAVA 3.00 A
MATH UN1201 CALCULUS III 3.00 B+
`;

beforeEach(() => {
  /*
   * `mockReset`, not `clearAllMocks`: several tests queue a one-shot with
   * `mockRejectedValueOnce`/`mockImplementationOnce`, and clearing only records
   * the calls — an unconsumed one-shot survives into the next test and fails
   * it for a reason that has nothing to do with what it is checking. Resetting
   * drops the queue too, so each test starts from the defaults below.
   */
  createWorker.mockReset();
  recognize.mockReset();
  terminate.mockReset();
  createWorker.mockImplementation(async () => ({ recognize, terminate }));
  recognize.mockResolvedValue({ data: { text: SCANNED_TEXT } });
  terminate.mockResolvedValue({} as never);
});

function file(name: string, type: string, bytes: ArrayBuffer | Uint8Array | string): File {
  const body = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return new File([body as BlobPart], name, { type });
}

/* ==========================================================================
 * Which files go to OCR
 * ========================================================================== */

describe("isImageFile", () => {
  it("recognises a photo by type and a screenshot by extension", () => {
    expect(isImageFile(file("t.png", "image/png", "x"))).toBe(true);
    expect(isImageFile(file("scan.JPG", "", "x"))).toBe(true);
    expect(isImageFile(file("t.pdf", "application/pdf", "x"))).toBe(false);
    expect(isImageFile(file("t.txt", "text/plain", "x"))).toBe(false);
  });
});

describe("readTranscriptFile routing", () => {
  it("reads a photographed transcript instead of decoding it as text", async () => {
    /*
     * The regression. This file used to fall through to `file.text()`, which
     * decodes JPEG bytes as UTF-8 and finds no course codes in the result —
     * reported as "we could not find any course codes", which sounds like a
     * parser problem rather than "we cannot read pictures".
     */
    const result = await readTranscriptFile(file("transcript.jpg", "image/jpeg", "\xff\xd8\xff"));

    expect(recognize).toHaveBeenCalledTimes(1);
    expect(result.problem).toBeNull();
    expect(result.candidates.map((c) => c.code)).toContain("COMS W3134");
  });

  it("never calls OCR on a PDF that has a readable text layer", async () => {
    /*
     * The text layer is exact and OCR is a guess, so a readable PDF must not
     * reach the fallback. This is the assertion that stops a later "just always
     * OCR, it is simpler" from silently making every import less accurate.
     */
    const result = await readTranscriptFile(file("t.pdf", "application/pdf", textLayerPdf()));

    expect(createWorker).not.toHaveBeenCalled();
    expect(result.candidates.map((c) => c.code)).toContain("COMS W3134");
  });

  it("falls back to the page images when a PDF has no text layer", async () => {
    const result = await readTranscriptFile(file("t.pdf", "application/pdf", scannedPdf()));

    expect(recognize).toHaveBeenCalledTimes(1);
    expect(result.problem).toBeNull();
    expect(result.candidates.map((c) => c.code)).toContain("MATH UN1201");
  });

  it("says so plainly when a PDF has neither text nor images", async () => {
    const result = await readTranscriptFile(file("t.pdf", "application/pdf", emptyPdf()));

    expect(createWorker).not.toHaveBeenCalled();
    expect(result.candidates).toEqual([]);
    expect(result.problem).toMatch(/could not find any text or any page images/i);
  });

  it("returns a failure rather than throwing when the worker dies", async () => {
    /*
     * This runs behind a file picker in the middle of onboarding. A blocked
     * WASM compile or an out-of-memory worker on an old phone has the same
     * remedy as an unreadable scan — the grid — so it must not surface as an
     * unhandled rejection.
     */
    createWorker.mockRejectedValueOnce(new Error("WebAssembly blocked"));
    const result = await readTranscriptFile(file("t.png", "image/png", "x"));

    expect(result.candidates).toEqual([]);
    expect(result.problem).toMatch(/could not read that file/i);
  });
});

/* ==========================================================================
 * Getting the pictures out
 * ========================================================================== */

describe("pdfPageImages", () => {
  it("hands back an embedded JPEG untouched", async () => {
    const images = await pdfPageImages(new Uint8Array(scannedPdf()));
    expect(images).toHaveLength(1);
    expect(images[0]!.type).toBe("image/jpeg");
  });

  it("skips JPEG 2000, which no browser can decode", async () => {
    // Attempting it would hand a canvas bytes it cannot read; the page is
    // dropped instead, because OCR on noise returns confident nonsense.
    expect(await pdfPageImages(new Uint8Array(imagePdf("/JPXDecode")))).toHaveLength(0);
  });

  it("ignores non-image streams", async () => {
    expect(await pdfPageImages(new Uint8Array(textLayerPdf()))).toHaveLength(0);
  });
});

describe("ocrImages", () => {
  it("reports progress inside 0-1 and terminates the worker", async () => {
    const seen: number[] = [];
    let log: ((m: { status: string; progress: number }) => void) | undefined;
    createWorker.mockImplementationOnce(async (...args: unknown[]) => {
      log = (args[2] as { logger?: typeof log })?.logger;
      return { recognize, terminate };
    });
    recognize.mockImplementation(async () => {
      log?.({ status: "recognizing text", progress: 0.5 });
      return { data: { text: SCANNED_TEXT } };
    });

    await ocrImages([new Blob(["a"]), new Blob(["b"])], (p) => seen.push(p.ratio));

    expect(seen.length).toBeGreaterThan(0);
    for (const ratio of seen) {
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    }
    // Monotonic: a bar that resets per page reads as a failure per page.
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates the worker even when a page throws", async () => {
    recognize.mockRejectedValueOnce(new Error("bad image"));
    await expect(ocrImages([new Blob(["a"])])).rejects.toThrow();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("does no work at all for an empty page list", async () => {
    expect(await ocrImages([])).toBe("");
    expect(createWorker).not.toHaveBeenCalled();
  });
});

/* ==========================================================================
 * Fixtures
 * ========================================================================== */

function pdf(objects: string[]): ArrayBuffer {
  const body = `%PDF-1.3\n${objects.join("\n")}\ntrailer << /Root 1 0 R >>\n%%EOF\n`;
  return new TextEncoder().encode(body).buffer as ArrayBuffer;
}

/**
 * A PDF whose content stream really does carry the course codes.
 *
 * One `BT … Tm … Tj … ET` block per row, each at its own y, because that is
 * both what pdfmake emits and what `layoutContent` needs: it takes one run per
 * block and only breaks a line when y moves. Four rows sharing a single `Tm`
 * — the obvious way to write this fixture — come back as one run-on line, and
 * the transcript parser reads line by line, so it would find nothing.
 */
function textLayerPdf(): ArrayBuffer {
  const rows = [
    "Fall 2024",
    "COMS W3134 DATA STRUCTURES IN JAVA 3.00 A",
    "MATH UN1201 CALCULUS III 3.00 B+",
    "Columbia University unofficial academic record for the student",
  ];
  const content = rows
    .map((row, index) => `BT\n1 0 0 1 40 ${700 - index * 14} Tm\n/F1 10 Tf\n(${row}) Tj\nET\n`)
    .join("");
  return pdf([
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${content.length} >> stream\n${content}endstream endobj`,
  ]);
}

/** One page, one embedded image, no text — the Vergil unofficial record. */
function imagePdf(filter: string): ArrayBuffer {
  const jpeg = "\xff\xd8\xff\xe0JFIF-ish-bytes";
  return pdf([
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
    `4 0 obj << /Length 20 >> stream\n/Im0 Do              endstream endobj`,
    `5 0 obj << /Type /XObject /Subtype /Image /Width 1700 /Height 2200 /Filter ${filter} /Length ${jpeg.length} >> stream\n${jpeg}endstream endobj`,
  ]);
}

function scannedPdf(): ArrayBuffer {
  return imagePdf("/DCTDecode");
}

function emptyPdf(): ArrayBuffer {
  return pdf([
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 0 /Kids [] >> endobj",
  ]);
}
