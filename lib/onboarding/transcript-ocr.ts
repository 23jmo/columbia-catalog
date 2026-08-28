/**
 * Reading a transcript nobody can select text from.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `lib/profile/pdf-text.ts` reads a PDF's text layer, and says in its own
 * header which files have none: "Scans / print-to-PDF screenshots (the Vergil
 * unofficial record is this: JPEGs of the page, not a text layer)." That is the
 * most common file a Columbia student has to hand, so the honest error message
 * it produced was being read as "upload is broken" — which, for the file they
 * actually had, it was.
 *
 * OCR is the answer to exactly that case and nothing else. A PDF that HAS a
 * text layer must keep using it: the text layer is exact, OCR is a guess, and
 * running a guess over a document we can read perfectly would trade correctness
 * for nothing.
 *
 * ── Why WASM in the browser, and not a vision model ─────────────────────────
 *
 * Sending the page to a model would have been more accurate and needed no new
 * dependency — `ai` and `@ai-sdk/openai` are already installed. It was declined
 * because of what it would cost: `transcript-import.tsx` promises the file
 * never leaves the browser, and a transcript image carries a name, a student
 * id, grades and a GPA, when the only thing we want from it is a list of course
 * codes. `tesseract.js` keeps that promise literally true — the bytes go to a
 * web worker on the student's own machine and nowhere else.
 *
 * One thing that IS fetched: on first use the worker downloads its core WASM
 * and the English language data (~3 MB) from tesseract's CDN. That is traffic
 * OUT for the model, never traffic out for the transcript, so the promise
 * holds — but it does mean OCR needs a network on the first run, and it is why
 * a Content-Security-Policy added later has to allow that origin or this
 * silently becomes a feature that always fails. It fails safely if it does:
 * `transcript.ts` catches a dead worker and points the student at the grid.
 *
 * ── Everything here is imported lazily ──────────────────────────────────────
 *
 * `tesseract.js` pulls a worker and several megabytes of WASM and language
 * data. The people who need it are the few who upload a scan; everyone else
 * must not pay for it. Hence `await import(...)` inside the function rather
 * than a static import at the top of a module the onboarding bundle reaches.
 * Keep it that way.
 */

/** Progress for the UI. `ratio` is 0-1 across the whole job, not per page. */
export interface OcrProgress {
  /** Plain language, already suitable to print. */
  label: string;
  ratio: number;
}

/**
 * How many page images to read.
 *
 * A transcript is one to three pages; the cap is for the student who picks the
 * wrong PDF. OCR is seconds per page, so an unbounded loop over a fifty-page
 * document is a hung tab, and stopping is better than finishing eventually.
 */
const MAX_PAGES = 8;

/* ==========================================================================
 * Getting pictures out of a PDF
 * ========================================================================== */

/** `/Width 1700` → 1700. */
function dictNumber(dict: string, key: string): number | null {
  const found = new RegExp(`/${key}\\s+(\\d+)`).exec(dict);
  return found ? Number(found[1]) : null;
}

/**
 * The embedded page images of a PDF, in document order.
 *
 * Only the two encodings that a scanner or a print-to-PDF actually emits:
 *
 *   DCTDecode   JPEG, and `parsePdfObjects` hands back the raw bytes untouched
 *               because `inflate` fails on them and it falls through to the
 *               payload. So the stream IS a JPEG file and goes straight into a
 *               Blob — no decoding on our side at all.
 *   FlateDecode Raw samples, already inflated upstream. Turned into an image
 *               through a canvas, which is the only way to get from a byte
 *               array to something OCR will accept.
 *
 * JPXDecode (JPEG 2000) is skipped deliberately rather than attempted: no
 * browser decodes it natively, so there is nothing to hand a canvas.
 */
export async function pdfPageImages(bytes: Uint8Array): Promise<Blob[]> {
  const { parsePdfObjects } = await import("@/lib/profile/pdf-objects");
  const objects = await parsePdfObjects(bytes);
  const images: Blob[] = [];

  for (const object of objects) {
    if (images.length >= MAX_PAGES) break;
    if (!object.stream || !/\/Subtype\s*\/Image/.test(object.dict)) continue;

    if (/\/DCTDecode/.test(object.dict)) {
      images.push(new Blob([object.stream as BlobPart], { type: "image/jpeg" }));
      continue;
    }

    if (/\/FlateDecode/.test(object.dict)) {
      const bitmap = await samplesToBlob(object.stream, object.dict);
      if (bitmap) images.push(bitmap);
    }
  }

  return images;
}

/**
 * Raw PDF samples to a PNG blob, via a canvas.
 *
 * Handles the two colour spaces a scan is stored in — 8-bit RGB and 8-bit grey.
 * Anything else (CMYK, indexed palettes, 1-bit fax) returns null and the page
 * is skipped, because guessing at a decoding produces a picture of noise, and
 * OCR on noise returns confident nonsense rather than nothing.
 */
async function samplesToBlob(samples: Uint8Array, dict: string): Promise<Blob | null> {
  const width = dictNumber(dict, "Width");
  const height = dictNumber(dict, "Height");
  const bits = dictNumber(dict, "BitsPerComponent");
  if (!width || !height || bits !== 8) return null;
  if (typeof document === "undefined") return null;

  const isRgb = /\/DeviceRGB/.test(dict);
  const isGrey = /\/DeviceGray/.test(dict);
  if (!isRgb && !isGrey) return null;

  const channels = isRgb ? 3 : 1;
  if (samples.length < width * height * channels) return null;

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const from = pixel * channels;
    const to = pixel * 4;
    rgba[to] = samples[from]!;
    rgba[to + 1] = isRgb ? samples[from + 1]! : samples[from]!;
    rgba[to + 2] = isRgb ? samples[from + 2]! : samples[from]!;
    rgba[to + 3] = 255;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.putImageData(new ImageData(rgba, width, height), 0, 0);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/* ==========================================================================
 * Reading the pictures
 * ========================================================================== */

/**
 * OCR one or more page images into a single block of text.
 *
 * The pages are joined with blank lines and handed to the SAME
 * `parseTranscript` the text-layer path uses. That is the point of flattening
 * to text here rather than parsing rows out of OCR output: there is one parser,
 * one set of warnings, and one review screen, whatever the file was.
 *
 * The worker is terminated in a `finally`. It holds the WASM heap and the
 * language data, and a student who imports twice should not pay for two.
 */
export async function ocrImages(
  images: readonly Blob[],
  onProgress?: (progress: OcrProgress) => void,
): Promise<string> {
  if (images.length === 0) return "";

  onProgress?.({ label: "Starting the reader…", ratio: 0.02 });

  const { createWorker } = await import("tesseract.js");

  /*
   * Progress is reported per page and rescaled to the whole job, because
   * tesseract's own `progress` restarts at zero for every image — a bar that
   * resets three times reads as three failures.
   */
  let page = 0;
  const worker = await createWorker("eng", undefined, {
    logger: (message) => {
      if (message.status !== "recognizing text") return;
      const within = (page + message.progress) / images.length;
      onProgress?.({
        label:
          images.length > 1
            ? `Reading page ${page + 1} of ${images.length}…`
            : "Reading your transcript…",
        // Held inside 0.05-0.98: the setup before this took real time, and a
        // bar that hits 100% before the parse finishes reads as a hang.
        ratio: 0.05 + within * 0.93,
      });
    },
  });

  try {
    const pages: string[] = [];
    for (const image of images) {
      const result = await worker.recognize(image);
      pages.push(result.data.text);
      page++;
    }
    return pages.join("\n\n");
  } finally {
    await worker.terminate();
  }
}

/** Does this file look like something OCR should be pointed at? */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name);
}
