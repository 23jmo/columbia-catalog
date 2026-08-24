/**
 * Dependency-free PDF text extraction, for transcript import.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * Two constraints meet here and only one design satisfies both.
 *
 * `AGENTS.md` forbids adding dependencies, so there is no pdf.js and no
 * server-side PDF library. And `vergil_api_spec.md` §15 warns that centralized
 * ingestion of education records by a third party creates FERPA exposure — an
 * official transcript is the single most sensitive artifact a student could
 * hand us.
 *
 * Running the extraction **in the browser** answers both. The file is read with
 * `FileReader`, inflated with `DecompressionStream` — which every target
 * browser and Node 18+ ships natively — and only the extracted course *codes*
 * ever cross the network, after the student has reviewed them. The PDF itself
 * never leaves the device, so there is no education record on our server to
 * expose, subpoena, or leak. That is a strictly better privacy position than
 * server-side parsing, and it happens to be the only one available to us.
 *
 * ── What this can and cannot read ───────────────────────────────────────────
 *
 * PDF is a container, not a text format. This reads the common case and is
 * honest about the rest:
 *
 *   WORKS      Text-based PDFs whose fonts use a standard encoding. SSOL's
 *              generated transcripts and most registrar PDFs are this.
 *   PARTIAL    Subset-embedded fonts with a custom CMap. Glyph codes will not
 *              map back to ASCII and the output is mojibake. We detect this by
 *              yield and say so rather than showing garbage.
 *   FAILS      Scanned/photographed transcripts. There is no text layer at all;
 *              extraction needs OCR, which is out of scope.
 *
 * Because of PARTIAL and FAILS, the import flow NEVER commits what this
 * returns. It always renders the matches for the student to confirm, and the
 * course picker is always available as the path that cannot fail. This function
 * is an accelerator, not an authority.
 */

/** Text-showing operators carry their string in `(…)` or `<hex>`. */
const TEXT_OPERATOR = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>/g;

export interface PdfExtraction {
  text: string;
  /** How many content streams inflated successfully. */
  streamsRead: number;
  /** Streams found but not inflatable — usually images or an unsupported filter. */
  streamsSkipped: number;
  /**
   * What the caller should tell the student. `"ok"` means text came out;
   * `"no_text_layer"` means this is almost certainly a scan; `"unreadable"`
   * means streams inflated but produced no usable words.
   */
  outcome: "ok" | "no_text_layer" | "unreadable";
}

/**
 * Inflate one stream. PDF `FlateDecode` is zlib-wrapped, but enough producers
 * emit raw deflate that both have to be tried before giving up.
 */
async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const stream = new Blob([bytes as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream(format));
      const buffer = await new Response(stream).arrayBuffer();
      if (buffer.byteLength > 0) return new Uint8Array(buffer);
    } catch {
      // Wrong format, or a corrupt stream. Try the next one, then give up —
      // a single unreadable stream in a transcript is normal (fonts, images).
    }
  }
  return null;
}

/** Decode a PDF literal string, resolving the escapes the spec defines. */
function decodeLiteral(raw: string): string {
  return raw
    .slice(1, -1)
    .replace(/\\(\d{1,3})/g, (_, octal: string) =>
      String.fromCharCode(parseInt(octal, 8)),
    )
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\(.)/g, "$1");
}

/**
 * Decode a PDF hex string.
 *
 * Two-digit pairs are bytes. Four-digit groups would be UTF-16BE, but a
 * transcript's course codes are ASCII either way, so pairs are read as bytes
 * and anything above the printable range is dropped rather than guessed at.
 */
function decodeHex(raw: string): string {
  const hex = raw.slice(1, -1).replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(code)) continue;
    out += code >= 32 && code < 127 ? String.fromCharCode(code) : " ";
  }
  return out;
}

/**
 * Pull the visible strings out of one inflated content stream.
 *
 * `TJ` arrays interleave strings with kerning numbers — `[(COMS)-250(W3157)]` —
 * and the numbers are what put a space between words on the page. A large
 * negative kern is a word gap, so it becomes a space; without this, "COMS" and
 * "W3157" concatenate into "COMSW3157". That still parses (see `code.ts`'s
 * unspaced branch), but course TITLES would run together into one unsearchable
 * word, and the student's confirmation screen would be unreadable.
 */
function extractStrings(content: string): string {
  let out = "";
  let lastIndex = 0;

  for (const match of content.matchAll(TEXT_OPERATOR)) {
    const raw = match[0];
    const between = content.slice(lastIndex, match.index);
    lastIndex = match.index + raw.length;

    // A kern below -100 thousandths of an em is a word break in practice.
    if (/-\s*[1-9]\d{2,}/.test(between)) out += " ";
    // Any operator that moves to a new line ends the run.
    if (/\b(?:Td|TD|T\*|ET|'|")\b/.test(between)) out += "\n";

    out += raw.startsWith("<") ? decodeHex(raw) : decodeLiteral(raw);
  }

  return out;
}

/** Locate `stream … endstream` payloads without parsing the xref table. */
function* streamPayloads(bytes: Uint8Array): Generator<Uint8Array> {
  const STREAM = new TextEncoder().encode("stream");
  const ENDSTREAM = new TextEncoder().encode("endstream");

  const indexOf = (needle: Uint8Array, from: number): number => {
    outer: for (let i = from; i <= bytes.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (bytes[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  };

  let cursor = 0;
  while (cursor < bytes.length) {
    const start = indexOf(STREAM, cursor);
    if (start === -1) return;
    let payload = start + STREAM.length;
    // The keyword is followed by CRLF or LF, per the spec.
    if (bytes[payload] === 0x0d) payload++;
    if (bytes[payload] === 0x0a) payload++;

    const end = indexOf(ENDSTREAM, payload);
    if (end === -1) return;

    yield bytes.subarray(payload, end);
    cursor = end + ENDSTREAM.length;
  }
}

/** Heuristic: did we get words, or glyph soup from a subset font? */
function looksLikeText(text: string): boolean {
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 40) return false;
  // Real transcripts are full of 3+ letter runs. A custom CMap produces
  // scattered single characters, so the ratio separates them cleanly.
  const words = (text.match(/[A-Za-z]{3,}/g) ?? []).length;
  return words >= 10;
}

export async function extractPdfText(data: ArrayBuffer): Promise<PdfExtraction> {
  const bytes = new Uint8Array(data);
  let text = "";
  let streamsRead = 0;
  let streamsSkipped = 0;

  for (const payload of streamPayloads(bytes)) {
    // Content streams are small; a multi-megabyte one is an embedded image and
    // inflating it just to throw it away is the slowest thing this could do.
    if (payload.length > 4_000_000) {
      streamsSkipped++;
      continue;
    }

    const inflated = await inflate(payload);
    if (!inflated) {
      // Some producers leave content streams uncompressed. If the raw bytes
      // already contain text operators, use them directly.
      const raw = new TextDecoder("latin1").decode(payload);
      if (/\bTJ\b|\bTj\b/.test(raw)) {
        text += `${extractStrings(raw)}\n`;
        streamsRead++;
      } else {
        streamsSkipped++;
      }
      continue;
    }

    const content = new TextDecoder("latin1").decode(inflated);
    if (!/\bTJ\b|\bTj\b/.test(content)) {
      streamsSkipped++;
      continue;
    }
    text += `${extractStrings(content)}\n`;
    streamsRead++;
  }

  const cleaned = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  let outcome: PdfExtraction["outcome"] = "ok";
  if (streamsRead === 0) outcome = "no_text_layer";
  else if (!looksLikeText(cleaned)) outcome = "unreadable";

  return { text: cleaned, streamsRead, streamsSkipped, outcome };
}
