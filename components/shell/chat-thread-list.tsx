/**
 * Recent chats, nested under Home.
 *
 * The tree line is the whole point of the reference: without it these rows
 * look like a second nav, and Home stops being the parent they belong to.
 * Five is the cap. A sixth row, when it exists, is search — not another title.
 */

"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RiSearchLine } from "@remixicon/react";

import { Badge } from "@/components/base/badges/badge";
import { ChatHistoryModal } from "@/components/shell/chat-history-modal";
import { useSessionAccount } from "@/hooks/use-session-account";
import {
  fetchConversationList,
  HISTORY_CHANGED_EVENT,
  relativeAge,
  SIDEBAR_THREAD_CAP,
  threadHref,
  type ConversationSummary,
} from "@/lib/agent/history";
import { cx } from "@/utils/cx";

export function ChatThreadList({ onNavigate }: { onNavigate?: () => void }) {
  const { account, isLoading: sessionLoading } = useSessionAccount();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");

  const [threads, setThreads] = useState<ConversationSummary[]>([]);
  const [findOpen, setFindOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!account) {
      setThreads([]);
      return;
    }
    void fetchConversationList({ limit: SIDEBAR_THREAD_CAP + 1 }).then(setThreads);
  }, [account]);

  useEffect(() => {
    if (sessionLoading) return;
    refresh();
  }, [sessionLoading, refresh]);

  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener(HISTORY_CHANGED_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(HISTORY_CHANGED_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [refresh]);

  if (!account || threads.length === 0) return null;

  const visible = threads.slice(0, SIDEBAR_THREAD_CAP);
  const hasOlder = threads.length > SIDEBAR_THREAD_CAP;

  return (
    <>
      <nav aria-label="Recent chats" className="ml-4.5">
        <ul className="flex flex-col">
          {visible.map((thread, index) => (
            <TreeRow
              key={thread.conversationId}
              isLast={!hasOlder && index === visible.length - 1}
            >
              <Link
                href={threadHref(thread.conversationId)}
                onClick={onNavigate}
                aria-current={thread.conversationId === activeId ? "page" : undefined}
                className={cx(
                  "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1",
                  "transition-colors duration-150 ease-out motion-reduce:transition-none",
                  "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                  "active:scale-[0.96] motion-reduce:active:scale-100",
                  thread.conversationId === activeId
                    ? "bg-background-secondary-hover"
                    : "hover:bg-background-secondary-hover",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-secondary">
                  {thread.title}
                </span>
                <Badge color="neutral">{relativeAge(thread.updatedAt)}</Badge>
              </Link>
            </TreeRow>
          ))}

          {hasOlder ? (
            <TreeRow isLast>
              <button
                type="button"
                onClick={() => setFindOpen(true)}
                className={cx(
                  "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1",
                  "text-left transition-colors duration-150 ease-out motion-reduce:transition-none",
                  "outline-none hover:bg-background-secondary-hover",
                  "focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                )}
              >
                <RiSearchLine
                  aria-hidden
                  className="size-3.5 shrink-0 text-foreground-icon-quaternary"
                />
                <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-tertiary">
                  Find older chats
                </span>
              </button>
            </TreeRow>
          ) : null}
        </ul>
      </nav>

      <ChatHistoryModal isOpen={findOpen} onClose={() => setFindOpen(false)} />
    </>
  );
}

function TreeRow({ children, isLast }: { children: ReactNode; isLast: boolean }) {
  return (
    <li className="relative flex min-w-0 items-center pl-3">
      {/* Vertical spine. Stops at the last row so the tree ends, not a hanging line. */}
      <span
        aria-hidden
        className={cx(
          "absolute left-0 w-px bg-border-table",
          isLast ? "top-0 h-1/2" : "inset-y-0",
        )}
      />
      <span aria-hidden className="absolute top-1/2 left-0 h-px w-3 bg-border-table" />
      {children}
    </li>
  );
}
