/**
 * Chat history, the query half.
 *
 * List and load go through the same ownership filter `resolveConversation`
 * uses: `user_id` is compared explicitly because the agent routes write with
 * the service-role client, where RLS is not the safety net.
 */

import type { UIMessage } from "ai";

import { messagesFromRows } from "@/lib/agent/conversation";
import type { ChatThread } from "@/lib/agent/history-format";
import { escapeIlike, SEARCH_THREAD_LIMIT } from "@/lib/agent/history-format";
import type { CatalogClient } from "@/lib/db/client";

const QUERY_MAX = 80;

export async function listConversations(
  db: CatalogClient,
  userId: string,
  options: { limit?: number; query?: string } = {},
): Promise<ChatThread[]> {
  const limit = Math.min(Math.max(options.limit ?? SEARCH_THREAD_LIMIT, 1), SEARCH_THREAD_LIMIT);
  const query = options.query?.trim().slice(0, QUERY_MAX) ?? "";

  let request = db
    .from("agent_conversations")
    .select("conversation_id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (query) {
    request = request.ilike("title", `%${escapeIlike(query)}%`);
  }

  const { data, error } = await request;
  if (error) {
    console.error("agent: could not list conversations:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    conversationId: row.conversation_id,
    title: row.title?.trim() || "New question",
    updatedAt: row.updated_at,
  }));
}

export async function loadConversation(
  db: CatalogClient,
  userId: string,
  conversationId: string,
): Promise<{ conversationId: string; title: string; messages: UIMessage[] } | null> {
  const { data: conversation } = await db
    .from("agent_conversations")
    .select("conversation_id, title")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!conversation) return null;

  const { data: rows, error } = await db
    .from("agent_messages")
    .select("message_id, role, content, parts")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("agent: could not load conversation:", error.message);
    return null;
  }

  return {
    conversationId: conversation.conversation_id,
    title: conversation.title?.trim() || "New question",
    messages: messagesFromRows(rows ?? []),
  };
}
