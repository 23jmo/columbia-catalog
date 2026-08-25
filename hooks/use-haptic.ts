"use client";

import { useCallback } from "react";

import { haptic, type HapticKind } from "@/lib/haptics";

/**
 * Stable haptic trigger for event handlers.
 *
 * Prefer this over importing `haptic` directly when the call site is a
 * `useCallback` dependency list — a module function is already stable, but
 * the hook keeps the call shape consistent with the other client hooks.
 */
export function useHaptic(): (kind?: HapticKind) => boolean {
  return useCallback((kind: HapticKind = "impact") => haptic(kind), []);
}
