"use client";

import { useState } from "react";

import { signIn } from "@/lib/db/auth";
import { isConfigured } from "@/lib/db/client";
import { clearOnboardingCompleteCookie } from "@/lib/onboarding/state";
import type { FeedCard } from "@/lib/recommend/feed";

import { FeedPreviewGate } from "./feed-preview-gate";
import type { FeedPreview } from "./use-feed-preview";

/**
 * The last onboarding screen — blurred recommendations with the profile
 * sign-in card floating on top.
 */

export interface StepFeedProps {
  preview: FeedPreview;
  signedIn: boolean;
  migration: { status: "idle" | "running" | "done" | "failed"; message?: string };
  onFinish: (cards: FeedCard[]) => void;
}

export function StepFeed({ preview, signedIn, migration, onFinish }: StepFeedProps) {
  const [signInError, setSignInError] = useState<string | null>(null);

  const startSignIn = async () => {
    setSignInError(null);
    // A prior completion (or a deleted account) may have left `cc_onboarded`.
    // Clear it before Google so a stranded return cannot treat this pass as
    // already finished and dump them on `/`.
    clearOnboardingCompleteCookie();
    const { error } = await signIn({ next: "/onboarding" });
    if (error) setSignInError(error);
  };

  return (
    <FeedPreviewGate
      preview={preview}
      signedIn={signedIn}
      migration={migration}
      onSignIn={startSignIn}
      onFinish={onFinish}
      signInDisabled={!isConfigured()}
      signInError={signInError}
    />
  );
}
