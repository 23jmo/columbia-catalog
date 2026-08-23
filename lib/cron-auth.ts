/**
 * Bearer check for the cron-triggered routes.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Two things here are
 * deliberate:
 *
 *   · The comparison is `timingSafeEqual`, not `===`. These endpoints are
 *     publicly routable and unauthenticated by any other means, so a byte-at-a-
 *     time early return is a real oracle, not a theoretical one.
 *
 *   · A missing or short secret fails closed. An unset `CRON_SECRET` must
 *     never mean "let everyone in" — the crawl route can be made to hammer
 *     Columbia and the alert route can be made to send mail, so the failure
 *     mode of a misconfigured deployment has to be silence.
 */

import { timingSafeEqual } from "node:crypto";

/** Shorter than this is treated as unset — a two-character secret is not one. */
const MIN_SECRET_LENGTH = 16;

export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < MIN_SECRET_LENGTH) return false;

  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  const provided = Buffer.from(header.slice(prefix.length));
  const secret = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so length is compared first —
  // and length alone is not the secret.
  if (provided.length !== secret.length) return false;
  return timingSafeEqual(provided, secret);
}
