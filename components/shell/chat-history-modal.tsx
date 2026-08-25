/**
 * Search across every saved thread.
 *
 * The sidebar only holds five. This is how you get the sixth back: type a
 * word from the question that started it. Titles are first prompts, so the
 * search is the student's own words, not a model-generated label.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { RiSearchLine } from "@remixicon/react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/base/input/input";
import { ProfileModal } from "@/components/profile/profile-modal";
import {
  fetchConversationList,
  relativeAge,
  SEARCH_THREAD_LIMIT,
  threadHref,
  type ConversationSummary,
} from "@/lib/agent/history";
import { cx } from "@/utils/cx";

const DEBOUNCE_MS = 180;

export function ChatHistoryModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const latestQuery = useRef("");

  useEffect(() => {
    if (!isOpen) return;

    const handle = window.setTimeout(() => {
      const next = query.trim();
      latestQuery.current = next;
      setIsLoading(true);
          void fetchConversationList({ query: next, limit: SEARCH_THREAD_LIMIT }).then((rows) => {
        if (latestQuery.current !== next) return;
        setThreads(rows);
        setIsLoading(false);
      });
    }, query.trim() ? DEBOUNCE_MS : 0);

    return () => window.clearTimeout(handle);
  }, [isOpen, query]);

  useEffect(() => {
    if (isOpen) return;
    setQuery("");
    setThreads([]);
  }, [isOpen]);

  const openThread = (id: string) => {
    onClose();
    router.push(threadHref(id));
  };

  return (
    <ProfileModal
      isOpen={isOpen}
      onClose={onClose}
      title="Find a chat"
      description="Search by the question that started it. Older threads stay saved; they just leave the sidebar."
    >
      <Input
        value={query}
        onChange={setQuery}
        placeholder="Search chats"
        leadingIcon={RiSearchLine}
        autoFocus
      />

      <ul className="mt-3 flex flex-col gap-0.5">
        {threads.map((thread) => (
          <li key={thread.conversationId}>
            <button
              type="button"
              onClick={() => openThread(thread.conversationId)}
              className={cx(
                "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                "transition-colors duration-150 ease-out motion-reduce:transition-none",
                "hover:bg-background-secondary-hover",
                "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                "active:scale-[0.96]",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-body-medium text-text-secondary">
                {thread.title}
              </span>
              <span className="shrink-0 text-caption-1-medium tabular-nums text-text-tertiary">
                {relativeAge(thread.updatedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!isLoading && threads.length === 0 ? (
        <p className="mt-3 text-caption-1-regular text-text-tertiary">
          {query.trim() ? "No chats match that." : "No saved chats yet."}
        </p>
      ) : null}
    </ProfileModal>
  );
}
