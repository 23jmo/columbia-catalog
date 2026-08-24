/**
 * Conversation persistence.
 *
 * ── Why history is stored as parts, not prose ──────────────────────────────
 *
 * `agent_messages.parts` holds the AI SDK's `UIMessage` parts — tool calls,
 * tool results, the sections a turn resolved to. Storing only `content` would
 * be smaller and would make a reloaded thread render as *prose about cards*
 * instead of cards: the student scrolls up and the six courses they were
 * comparing have become a paragraph. Follow-ups suffer the same way, since
 * "what about the second one" needs the second one to still exist.
 *
 * ── Titles are not model-generated ─────────────────────────────────────────
 *
 * The title is the first prompt, truncated. Naming a thread with an LLM call
 * would spend one of the student's twenty prompts on a label, which is a bad
 * trade at any quality of label.
 */

import type { UIMessage } from "ai";

import type { CatalogClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/schema";

const TITLE_MAX = 120;

function toTitle(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  return cleaned.length <= TITLE_MAX ? cleaned : `${cleaned.slice(0, TITLE_MAX - 1)}…`;
}

/**
 * Find or create the thread this turn belongs to.
 *
 * A caller-supplied id is verified against `user_id` before it is used. Without
 * that check a student could post into someone else's thread by guessing a
 * UUID — RLS would stop the read, but this writes with the service-role client
 * (the route has already authenticated the student itself), and a service-role
 * client is exactly the context where an ownership check has to be explicit.
 */
export async function resolveConversation(
  db: CatalogClient,
  userId: string,
  conversationId: string | null,
  firstPrompt: string,
): Promise<string | null> {
  if (conversationId) {
    const { data } = await db
      .from("agent_conversations")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return data.conversation_id;
    // Fall through and open a new thread rather than erroring: an id that does
    // not resolve is far more likely to be a stale tab than an attack, and
    // losing the student's question to a 404 helps nobody.
  }

  const { data, error } = await db
    .from("agent_conversations")
    .insert({ user_id: userId, title: toTitle(firstPrompt) })
    .select("conversation_id")
    .single();

  if (error) {
    console.error("agent: could not open a conversation:", error.message);
    return null;
  }
  return data.conversation_id;
}

/**
 * Append one message.
 *
 * Failures are logged and swallowed. Persistence is what makes follow-ups work;
 * it is not what makes the current answer correct, and a student who just got a
 * good answer should not be shown an error because we could not write it down.
 */
export async function appendMessage(
  db: CatalogClient,
  userId: string,
  conversationId: string,
  message: { role: "user" | "assistant"; content: string; parts?: unknown },
): Promise<void> {
  const { error } = await db.from("agent_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: message.role,
    content: message.content,
    parts: (message.parts ?? []) as Json,
  });
  if (error) console.error("agent: could not persist a message:", error.message);
}

/** Flatten a UIMessage's text parts, for the `content` column. */
export function textOf(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}
