/**
 * ToUnicode CMaps — how a CID-keyed PDF says "glyph 8 is the letter l".
 *
 * Student Planning's pdfmake export never puts ASCII in the content stream.
 * Every `TJ` operand is a row of 16-bit glyph ids (`<00080002>`), and the
 * mapping back to Unicode lives in a separate Flate-compressed CMap. Without
 * this, those hex strings decode as NULs and we report "no text layer" on a
 * file that is full of text.
 */

export type CMap = Map<number, string>;

/** UTF-16BE code units, which is how ToUnicode dests are written. */
function utf16(hex: string): string {
  const padded = hex.length % 4 === 0 ? hex : hex.padStart(4, "0");
  try {
    const bytes = new Uint8Array(padded.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder("utf-16be").decode(bytes).replace(/\u0000/g, "");
  } catch {
    return "";
  }
}

export function parseToUnicode(source: string): CMap {
  const map: CMap = new Map();

  for (const block of source.matchAll(/\d+\s+beginbfchar(.*?)endbfchar/gs)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(pair[1], 16), utf16(pair[2]));
    }
  }

  for (const block of source.matchAll(/\d+\s+beginbfrange(.*?)endbfrange/gs)) {
    const body = block[1];
    let usedArray = false;
    for (const range of body.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]+)\]/g,
    )) {
      usedArray = true;
      const dests = [...range[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
      const start = parseInt(range[1], 16);
      dests.forEach((dest, index) => {
        map.set(start + index, utf16(dest[1]));
      });
    }
    // `<srcLo> <srcHi> <dstLo>` increments the dest. Do not run this on the
    // array form — the first three hexes of `[<a> <b> <c>]` look identical.
    if (usedArray) continue;
    for (const range of body.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const start = parseInt(range[1], 16);
      const end = parseInt(range[2], 16);
      const destStart = parseInt(range[3], 16);
      for (let cid = start; cid <= end; cid++) {
        map.set(cid, utf16((destStart + (cid - start)).toString(16).padStart(4, "0")));
      }
    }
  }

  return map;
}

/**
 * Identity-H hex strings are 4 digits per glyph. Latin-1 fallback is 2.
 *
 * A ToUnicode map is authoritative; without one we keep the old "printable
 * ASCII bytes" behaviour so a WinAnsi transcript still reads.
 */
export function decodeHexGlyphs(hex: string, cmap: CMap | null): string {
  const clean = hex.replace(/\s+/g, "");
  if (cmap && cmap.size > 0 && clean.length % 4 === 0) {
    let out = "";
    for (let i = 0; i + 3 < clean.length; i += 4) {
      out += cmap.get(parseInt(clean.slice(i, i + 4), 16)) ?? "";
    }
    return out;
  }
  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (Number.isNaN(code)) continue;
    out += code >= 32 && code < 127 ? String.fromCharCode(code) : " ";
  }
  return out;
}
