"use client";

import { useEffect, useRef, useState } from "react";
import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

type CopyState = "idle" | "copied" | "failed";

export interface CopyPromptButtonProps {
  value: string;
  label: string;
  copiedLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "medium" | "small" | "xs";
  className?: string;
}

/** Copies text to the clipboard with visible feedback. */
export function CopyPromptButton({
  value,
  label,
  copiedLabel = "Copied",
  variant = "secondary",
  size = "small",
  className,
}: CopyPromptButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const copy = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    resetTimer.current = setTimeout(() => setCopyState("idle"), 2400);
  };

  const text =
    copyState === "copied" ? copiedLabel : copyState === "failed" ? "Copy blocked" : label;

  return (
    <Button
      variant={variant}
      size={size}
      leadingIcon={copyState === "copied" ? RiCheckLine : RiFileCopyLine}
      onClick={copy}
      className={className}
    >
      {text}
    </Button>
  );
}
