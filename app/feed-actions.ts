"use server";

/**
 * Client-facing wrapper around `getFeedAction`.
 *
 * The feed's live island has to call this from the browser. Other client
 * islands in this app import their actions from app route files for the same
 * reason: a "use server" module is the door, and the ranking implementation
 * (which reads LSA artifacts from disk) stays behind it.
 */

import {
  getFeedAction,
  type FeedActionInput,
} from "@/lib/recommend/actions";
import type { FeedResult } from "@/lib/recommend/feed";

export async function refreshFeedAction(
  input: FeedActionInput = {},
): Promise<FeedResult> {
  return getFeedAction(input);
}
