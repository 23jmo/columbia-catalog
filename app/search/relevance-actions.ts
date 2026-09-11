"use server";

/**
 * Client-facing wrapper around `catalogRelevanceAction`.
 *
 * The Catalog screen is a client island and the ranking implementation reads
 * the degree audit, the prerequisite graph and the LSA artifacts on disk. Same
 * arrangement as `app/feed-actions.ts`: the `"use server"` module is the door,
 * and none of that crosses it.
 */

import {
  catalogRelevanceAction,
  type CatalogRelevanceResult,
} from "@/lib/recommend/actions";

export async function getCatalogRelevanceAction(): Promise<CatalogRelevanceResult> {
  return catalogRelevanceAction();
}
