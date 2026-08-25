/**
 * A small markdown subset for assistant prose.
 *
 * No parser dependency. AGENTS.md forbids adding packages, and a full CommonMark
 * library would also be a larger attack surface than this surface needs: the
 * model is asked for short answers, and the structure of a turn lives in the
 * cards underneath, not in nested documents.
 *
 * HTML is never interpreted. Links are restricted to http(s) and in-app paths
 * so a `javascript:` href cannot become a clickable target.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "p"; children: Inline[] }
  | { type: "h"; level: 1 | 2 | 3; children: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] }
  | { type: "blockquote"; children: Inline[] }
  | { type: "pre"; value: string }
  | { type: "hr" };

/** Only these schemes (and in-app paths) become links. Everything else is text. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  // In-app path. Protocol-relative `//evil` is rejected by the leading-slash
  // check that also demands no second slash.
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "pre", value: body.join("\n") });
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3;
      blocks.push({ type: "h", level, children: parseInline(heading[2]!) });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        quoted.push(lines[i]!.replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "blockquote", children: parseInline(quoted.join(" ")) });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(parseInline(lines[i]!.replace(/^\s*[-*]\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(parseInline(lines[i]!.replace(/^\s*\d+\.\s+/, "")));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !isBlockStart(lines[i]!)) {
      para.push(lines[i]!);
      i += 1;
    }
    blocks.push({ type: "p", children: parseInline(para.join(" ")) });
  }

  return blocks;
}

function isBlockStart(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^---+$/.test(line.trim()) ||
    /^#{1,3}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
  );
}

export function parseInline(source: string): Inline[] {
  const nodes: Inline[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const next = nextMark(source, cursor);
    if (!next) {
      pushText(nodes, source.slice(cursor));
      break;
    }
    if (next.index > cursor) pushText(nodes, source.slice(cursor, next.index));
    nodes.push(next.node);
    cursor = next.end;
  }

  return nodes;
}

function pushText(nodes: Inline[], value: string) {
  if (!value) return;
  const last = nodes[nodes.length - 1];
  if (last?.type === "text") last.value += value;
  else nodes.push({ type: "text", value });
}

function nextMark(
  source: string,
  from: number,
): { index: number; end: number; node: Inline } | null {
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === "`") {
      const end = source.indexOf("`", i + 1);
      if (end === -1) continue;
      return { index: i, end: end + 1, node: { type: "code", value: source.slice(i + 1, end) } };
    }
    if (source.startsWith("**", i) || source.startsWith("__", i)) {
      const mark = source.slice(i, i + 2);
      const end = source.indexOf(mark, i + 2);
      if (end === -1) continue;
      return {
        index: i,
        end: end + 2,
        node: { type: "strong", children: parseInline(source.slice(i + 2, end)) },
      };
    }
    if (source[i] === "*" || source[i] === "_") {
      const mark = source[i]!;
      const end = source.indexOf(mark, i + 1);
      if (end === -1) continue;
      return {
        index: i,
        end: end + 1,
        node: { type: "em", children: parseInline(source.slice(i + 1, end)) },
      };
    }
    if (source[i] === "[") {
      const close = source.indexOf("]", i + 1);
      if (close === -1 || source[close + 1] !== "(") continue;
      const endParen = source.indexOf(")", close + 2);
      if (endParen === -1) continue;
      const href = safeHref(source.slice(close + 2, endParen));
      if (!href) continue;
      return {
        index: i,
        end: endParen + 1,
        node: { type: "link", href, children: parseInline(source.slice(i + 1, close)) },
      };
    }
  }
  return null;
}
