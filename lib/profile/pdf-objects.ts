/**
 * Walk a PDF far enough to reach content streams and ToUnicode CMaps.
 *
 * Not a spec parser. Student Planning (pdfmake) and most registrar exports are
 * a pile of `N 0 obj … endobj` with Flate streams. That is enough. We never
 * follow the xref table, and we skip anything that does not look like a dict.
 */

export interface PdfObject {
  num: number;
  dict: string;
  stream: Uint8Array | null;
}

export async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  const trimmed = trimStream(bytes);
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const stream = new Blob([trimmed as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream(format));
      const buffer = await new Response(stream).arrayBuffer();
      if (buffer.byteLength > 0) return new Uint8Array(buffer);
    } catch {
      /* Wrong wrapper, or not compressed. Try the next format. */
    }
  }
  return null;
}

/** Producers put a newline after the zlib payload; leaving it in breaks inflate. */
function trimStream(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end--;
  return end === bytes.length ? bytes : bytes.subarray(0, end);
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const OBJ = new TextEncoder().encode(" 0 obj");
const ENDOBJ = new TextEncoder().encode("endobj");
const STREAM = new TextEncoder().encode("stream");
const ENDSTREAM = new TextEncoder().encode("endstream");

function digitsBefore(bytes: Uint8Array, at: number): number | null {
  let i = at - 1;
  while (i >= 0 && bytes[i] >= 0x30 && bytes[i] <= 0x39) i--;
  if (i + 1 === at) return null;
  const n = Number(new TextDecoder("latin1").decode(bytes.subarray(i + 1, at)));
  return Number.isFinite(n) ? n : null;
}

function payloadAfterStream(bytes: Uint8Array, streamAt: number, length: number | null): Uint8Array {
  let payload = streamAt + STREAM.length;
  if (bytes[payload] === 0x0d) payload++;
  if (bytes[payload] === 0x0a) payload++;
  if (length != null && payload + length <= bytes.length) {
    return bytes.subarray(payload, payload + length);
  }
  const end = indexOf(bytes, ENDSTREAM, payload);
  if (end === -1) return bytes.subarray(payload, payload);
  return bytes.subarray(payload, end);
}

export async function parsePdfObjects(bytes: Uint8Array): Promise<PdfObject[]> {
  const objects: PdfObject[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const mark = indexOf(bytes, OBJ, cursor);
    if (mark === -1) break;
    const num = digitsBefore(bytes, mark);
    cursor = mark + OBJ.length;
    if (num == null) continue;

    const streamAt = indexOf(bytes, STREAM, cursor);
    const endobj = indexOf(bytes, ENDOBJ, cursor);
    if (endobj === -1 && streamAt === -1) break;

    const hasStream = streamAt !== -1 && (endobj === -1 || streamAt < endobj);
    const dictBytes = bytes.subarray(cursor, hasStream ? streamAt : endobj);
    const dict = new TextDecoder("latin1").decode(dictBytes);
    if (!dict.includes("<<") && !hasStream) {
      cursor = (endobj === -1 ? cursor + 1 : endobj + ENDOBJ.length);
      continue;
    }

    let stream: Uint8Array | null = null;
    if (hasStream) {
      const lengthMatch = /\/Length\s+(\d+)/.exec(dict);
      const length = lengthMatch ? Number(lengthMatch[1]) : null;
      const raw = payloadAfterStream(bytes, streamAt, length);
      stream = (await inflate(raw)) ?? (raw.length > 0 ? raw : null);
      // Jump past endstream so a coincidental `endobj` inside the payload
      // cannot steal the cursor.
      let after = streamAt + STREAM.length;
      if (bytes[after] === 0x0d) after++;
      if (bytes[after] === 0x0a) after++;
      after += raw.length;
      const endstream = indexOf(bytes, ENDSTREAM, after - 8 > 0 ? after - 8 : after);
      cursor = endstream === -1 ? after : endstream + ENDSTREAM.length;
      const realEnd = indexOf(bytes, ENDOBJ, cursor);
      cursor = realEnd === -1 ? cursor : realEnd + ENDOBJ.length;
    } else {
      cursor = endobj + ENDOBJ.length;
    }

    objects.push({ num, dict, stream });
  }
  return objects;
}

export function dictRef(dict: string, key: string): number | null {
  const match = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(dict);
  return match ? Number(match[1]) : null;
}

export function fontResourceNames(dict: string): Map<string, number> {
  const named = new Map<string, number>();
  const fontBlock = /\/Font\s+<<([^>]*)>>/.exec(dict);
  if (!fontBlock) return named;
  for (const entry of fontBlock[1].matchAll(/\/([A-Za-z][^/\s]*)\s+(\d+)\s+0\s+R/g)) {
    named.set(entry[1], Number(entry[2]));
  }
  return named;
}
