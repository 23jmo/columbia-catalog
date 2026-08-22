// Small HTML helpers. Directory pages are regular enough for regex parsing.

export function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripTags(html: string): string {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "));
}

export function fieldValue(block: string, label: string): string | undefined {
  const pattern = new RegExp(
    `<dt>${label}:</dt>\\s*<dd>([\\s\\S]*?)</dd>`,
    "i",
  );
  const match = block.match(pattern);
  return match ? decodeHtml(match[1]) : undefined;
}

export function tableValue(html: string, label: string): string | undefined {
  const pattern = new RegExp(
    `<th>${label}</th>\\s*<td>([\\s\\S]*?)</td>`,
    "i",
  );
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : undefined;
}
