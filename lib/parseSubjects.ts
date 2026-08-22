import { DEFAULT_TERM_LABEL } from "./constants";
import { decodeHtml } from "./html";
import type { SubjectOption } from "./types";

// Subject index rows look like:
//   <td>Computer Science</td>
//   <td><a href="../subj/COMS/_Fall2026.html">Fall2026</a></td>
const ROW_RE = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi;
const LINK_RE = /subj\/([A-Z0-9_]+)\/_Fall2026\.html/i;

export function parseSubjectsIndex(html: string): SubjectOption[] {
  const seen = new Map<string, string>();

  for (const match of html.matchAll(ROW_RE)) {
    const name = decodeHtml(match[1]);
    const links = match[2];
    const codeMatch = links.match(LINK_RE);
    if (!codeMatch || !name) continue;

    const code = codeMatch[1];
    // Keep the first readable name for a code. Skip empty term rows.
    if (!links.includes(DEFAULT_TERM_LABEL)) continue;
    if (!seen.has(code)) {
      seen.set(code, name);
    }
  }

  return [...seen.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
