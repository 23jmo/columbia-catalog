import { BULLETIN_ORIGIN, DIRECTORY_ORIGIN, REVALIDATE_SECONDS } from "./constants";

const USER_AGENT = "LionCatalog/1.0 (unofficial student catalog; public HTML only)";

const ALLOWED_ORIGINS = new Set([DIRECTORY_ORIGIN, BULLETIN_ORIGIN]);

// Hard block: never call Columbia SAS/Vergil API hosts.
function assertPublicUrl(url: string): URL {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();

  if (host.endsWith("api.columbia.edu")) {
    throw new Error("Blocked Columbia API host");
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  if (!ALLOWED_ORIGINS.has(origin)) {
    throw new Error(`Blocked non-public catalog host: ${host}`);
  }

  return parsed;
}

// Fetch public HTML. Returns null on network/HTTP failure so builds never crash.
export async function fetchPublicHtml(
  url: string,
  revalidate = REVALIDATE_SECONDS,
): Promise<string | null> {
  try {
    assertPublicUrl(url);
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate },
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}
