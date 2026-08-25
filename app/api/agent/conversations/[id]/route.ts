/**
 * GET /api/agent/conversations/[id] — one thread, as UIMessages.
 *
 * Ownership is checked in the query, not by trusting the id. A guessed UUID
 * for someone else's thread comes back as 404, the same as a missing one.
 */

import { loadConversation } from "@/lib/agent/history-store";
import { isConversationId } from "@/lib/agent/history";
import { getSessionUser } from "@/lib/db/auth";
import { createServiceRoleClient } from "@/lib/db/client";

export const runtime = "nodejs";

const NO_STORE = {
  "cache-control": "no-store, private",
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const account = await getSessionUser();
  if (!account) {
    return Response.json({ error: "Sign in to open a chat." }, { status: 401, headers: NO_STORE });
  }

  const { id } = await context.params;
  if (!isConversationId(id)) {
    return Response.json({ error: "That chat does not exist." }, { status: 404, headers: NO_STORE });
  }

  const db = createServiceRoleClient();
  if (!db) {
    return Response.json({ error: "The database is not configured." }, { status: 503, headers: NO_STORE });
  }

  const conversation = await loadConversation(db, account.userId, id);
  if (!conversation) {
    return Response.json({ error: "That chat does not exist." }, { status: 404, headers: NO_STORE });
  }

  return Response.json(conversation, { headers: NO_STORE });
}
