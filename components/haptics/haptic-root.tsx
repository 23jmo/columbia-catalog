"use client";

import { useEffect } from "react";

import { installWebHaptics } from "@/lib/haptics";

/**
 * Installs iOS switch overlays for the current tree.
 *
 * The haptic module also self-installs on import. This mount is the
 * belt: App Router code-splitting can delay that import past first paint,
 * and a press before overlays exist is a silent press on iOS 26.5+.
 */
export function HapticRoot() {
  useEffect(() => installWebHaptics(), []);
  return null;
}
