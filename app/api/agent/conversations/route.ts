/**
 * GET /api/agent/conversations — the student's own threads, newest first.
 *
 * Optional `q` filters by title (the first prompt). Optional `limit` caps the
 * page; the sidebar asks for cap+1 so it can tell whether "Find older chats"
 * should appear without a separate count query.
 */

import { listConversations } from "@/lib/agent/history-store";
import { SEARCH_THREAD_LIMIT } from "@/lib/agent/history-format";
import { getSessionUser } from "@/lib/db/auth";
import { createServiceRoleClient } from "@/lib/db/client";

export const runtime = "nodejs";

const NO_STORE = {
  "cache-control": "no-store, private",
} as const;

export async function GET(request: Request): Promise<Response> {
  const account = await getSessionUser();
  if (!account) {
    return Response.json({ error: "Sign in to see your chats." }, { status: 401, headers: NO_STORE });
  }

  const db = createServiceRoleClient();
  if (!db) {
    return Response.json({ error: "The database is not configured." }, { status: 503, headers: NO_STORE });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const rawLimit = Number(url.searchParams.get("limit") ?? String(SEARCH_THREAD_LIMIT));
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50;

  const conversations = await listConversations(db, account.userId, { query, limit });
  return Response.json({ conversations }, { headers: NO_STORE });
}
