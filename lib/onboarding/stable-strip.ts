/**
 * Keep the maybe-strip still under a finger.
 *
 * Re-ranking the guess deck after a tap used to replace the whole row, so
 * the second course a student was aiming at vanished. This keeps whatever
 * is currently on screen, in that order, and only appends new ids at the
 * end to fill empty slots.
 */

export function stabilizeStrip<T extends { courseId: string }>(
  pinnedIds: readonly string[],
  pool: readonly T[],
  limit: number,
): T[] {
  const byId = new Map(pool.map((item) => [item.courseId, item]));

  const kept: T[] = [];
  for (const id of pinnedIds) {
    const item = byId.get(id);
    if (item) kept.push(item);
  }

  const keptIds = new Set(kept.map((item) => item.courseId));
  const additions = pool.filter((item) => !keptIds.has(item.courseId));
  return [...kept, ...additions].slice(0, limit);
}

/** True when two id lists are the same sequence. Avoids a needless setState. */
export function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}
