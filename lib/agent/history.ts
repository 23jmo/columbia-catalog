/**
 * Chat history, the client-safe half.
 *
 * Formatting lives in `history-format.ts` so tests and the sidebar share one
 * clock. This file adds the fetchers the rail and the search modal use.
 * The queries that hit the database live in `history-store.ts`.
 */

import type { UIMessage } from "ai";

import {
  isConversationId,
  notifyThreadsChanged,
  THREADS_CHANGED_EVENT,
  type ChatThread,
} from "@/lib/agent/history-format";

export {
  SIDEBAR_THREAD_CAP,
  SEARCH_THREAD_LIMIT,
  THREAD_QUERY_PARAM,
  THREADS_CHANGED_EVENT,
  isConversationId,
  threadHref,
  escapeIlike,
  relativeAge,
  notifyThreadsChanged,
  type ChatThread,
} from "@/lib/agent/history-format";

export const HISTORY_CHANGED_EVENT = THREADS_CHANGED_EVENT;
export const announceHistoryChanged = notifyThreadsChanged;

export type ConversationSummary = ChatThread;

export type LoadedConversation = {
  conversationId: string;
  title: string;
  messages: UIMessage[];
};

export async function fetchConversationList(options?: {
  query?: string;
  limit?: number;
}): Promise<ConversationSummary[]> {
  const params = new URLSearchParams();
  if (options?.query) params.set("q", options.query);
  if (options?.limit) params.set("limit", String(options.limit));
  const suffix = params.size > 0 ? `?${params}` : "";

  const response = await fetch(`/api/agent/conversations${suffix}`);
  if (!response.ok) return [];

  const body = (await response.json()) as { conversations?: ConversationSummary[] };
  return Array.isArray(body.conversations) ? body.conversations : [];
}

export async function fetchConversation(id: string): Promise<LoadedConversation | null> {
  if (!isConversationId(id)) return null;
  const response = await fetch(`/api/agent/conversations/${id}`);
  if (!response.ok) return null;
  return (await response.json()) as LoadedConversation;
}
