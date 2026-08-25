/**
 * Dependency-free PDF text extraction, for transcript import.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * `AGENTS.md` forbids adding pdf.js, and we must not upload a transcript.
 * Extraction therefore runs in this tab with `DecompressionStream`.
 *
 * ── What this can and cannot read ───────────────────────────────────────────
 *
 *   WORKS      WinAnsi text streams, and CID-keyed exports (Student Planning)
 *              that ship a ToUnicode CMap.
 *   PARTIAL    Subset fonts with no CMap — glyph soup, reported as unreadable.
 *   FAILS      Scans / print-to-PDF screenshots (the Vergil unofficial record
 *              is this: JPEGs of the page, not a text layer).
 */

import { decodeHexGlyphs, parseToUnicode, type CMap } from "./pdf-cmap";
import {
  dictRef,
  fontResourceNames,
  parsePdfObjects,
  type PdfObject,
} from "./pdf-objects";

export interface PdfExtraction {
  text: string;
  streamsRead: number;
  streamsSkipped: number;
  outcome: "ok" | "no_text_layer" | "unreadable";
}

const TEXT_OPERATOR = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>/g;

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

function looksLikeText(text: string): boolean {
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 40) return false;
  const words = (text.match(/[A-Za-z]{3,}/g) ?? []).length;
  return words >= 10;
}

function byNum(objects: PdfObject[]): Map<number, PdfObject> {
  return new Map(objects.map((object) => [object.num, object]));
}

function cmapForFont(font: PdfObject | undefined, objects: Map<number, PdfObject>): CMap | null {
  if (!font) return null;
  const toUnicode = dictRef(font.dict, "ToUnicode");
  if (toUnicode == null) return null;
  const cmapObj = objects.get(toUnicode);
  if (!cmapObj?.stream) return null;
  const parsed = parseToUnicode(new TextDecoder("latin1").decode(cmapObj.stream));
  return parsed.size > 0 ? parsed : null;
}

interface TextRun {
  x: number;
  y: number;
  text: string;
}

/**
 * One content stream → reading-order text.
 *
 * pdfmake (Student Planning) emits one `BT … Tm … Tf … TJ … ET` per fragment
 * and never uses `Td`. Sorting by y then x, with a y-gap as a line break, is
 * what turns those fragments back into transcript rows. Pages must be laid
 * out separately — two pages share a y-range, and merging them first weaves
 * Fall 2024 into the transfer-credit table.
 */
function layoutContent(content: string, fonts: Map<string, CMap | null>): string {
  const runs: TextRun[] = [];
  let font: string | null = fonts.keys().next().value ?? null;

  for (const block of content.matchAll(/BT([\s\S]*?)ET/g)) {
    const body = block[1];
    const tf = /\/([A-Za-z][^\s/]*)\s+[\d.]+\s+Tf/.exec(body);
    if (tf) font = tf[1];
    const cmap = (font && fonts.get(font)) || null;
    const tm = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm/.exec(
      body,
    );
    const x = tm ? Number(tm[5]) : 0;
    const y = tm ? Number(tm[6]) : 0;

    let text = "";
    let lastIndex = 0;
    for (const token of body.matchAll(TEXT_OPERATOR)) {
      const raw = token[0];
      const between = body.slice(lastIndex, token.index);
      lastIndex = (token.index ?? 0) + raw.length;
      if (/-\s*[1-9]\d{2,}/.test(between)) text += " ";
      text += raw.startsWith("<") ? decodeHexGlyphs(raw.slice(1, -1), cmap) : decodeLiteral(raw);
    }
    if (text.trim()) runs.push({ x, y, text });
  }

  if (runs.length === 0) return "";

  runs.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x));
  const lines: string[] = [];
  let currentY = runs[0].y;
  let line = runs[0].text;
  for (let i = 1; i < runs.length; i++) {
    const run = runs[i];
    if (Math.abs(run.y - currentY) > 2) {
      lines.push(line);
      line = run.text;
      currentY = run.y;
    } else {
      line += ` ${run.text}`;
    }
  }
  lines.push(line);
  return lines.join("\n");
}

function pageOrder(objects: PdfObject[]): number[] {
  const catalog = objects.find((object) => /\/Type\s*\/Catalog/.test(object.dict));
  if (!catalog) return [];
  const pagesRef = dictRef(catalog.dict, "Pages");
  const lookup = byNum(objects);
  const pages = pagesRef != null ? lookup.get(pagesRef) : undefined;
  if (!pages) return [];
  const kids = [...pages.dict.matchAll(/(\d+)\s+0\s+R/g)]
    .map((match) => Number(match[1]))
    .filter((num) => num !== pagesRef);
  return kids
    .map((num) => lookup.get(num))
    .filter((page): page is PdfObject => !!page && /\/Type\s*\/Page/.test(page.dict))
    .map((page) => dictRef(page.dict, "Contents"))
    .filter((num): num is number => num != null);
}

export async function extractPdfText(data: ArrayBuffer): Promise<PdfExtraction> {
  const bytes = new Uint8Array(data);
  const objects = await parsePdfObjects(bytes);
  const lookup = byNum(objects);

  const fonts = new Map<string, CMap | null>();
  for (const object of objects) {
    for (const [name, ref] of fontResourceNames(object.dict)) {
      if (fonts.has(name)) continue;
      fonts.set(name, cmapForFont(lookup.get(ref), lookup));
    }
  }

  const pages: string[] = [];
  let streamsRead = 0;
  let streamsSkipped = 0;

  const contents = pageOrder(objects);
  const contentNums = contents.length > 0
    ? contents
    : objects.filter((object) => object.stream && /BT/.test(new TextDecoder("latin1").decode(object.stream))).map((object) => object.num);

  const seen = new Set<number>();
  for (const num of contentNums) {
    if (seen.has(num)) continue;
    seen.add(num);
    const object = lookup.get(num);
    if (!object?.stream) {
      streamsSkipped++;
      continue;
    }
    const content = new TextDecoder("latin1").decode(object.stream);
    if (!/\bTJ\b|\bTj\b/.test(content)) {
      streamsSkipped++;
      continue;
    }
    pages.push(layoutContent(content, fonts));
    streamsRead++;
  }

  const cleaned = pages
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let outcome: PdfExtraction["outcome"] = "ok";
  if (streamsRead === 0) outcome = "no_text_layer";
  else if (!looksLikeText(cleaned) || !/[A-Z]{2,6}\s*[A-Z]{0,3}\s*\d{4}/.test(cleaned)) {
    // Glyph soup can pass the letter/word heuristic and still contain no
    // course codes — the unofficial-record PDF is a screenshot with a
    // custom CMap on the chrome. Call that unreadable, not a successful read.
    outcome = "unreadable";
  }

  return { text: cleaned, streamsRead, streamsSkipped, outcome };
}
