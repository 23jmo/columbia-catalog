"use client";

import { useState } from "react";

import { signIn } from "@/lib/db/auth";
import { isConfigured } from "@/lib/db/client";
import type { GuestOnboardingState } from "@/lib/onboarding/state";
import type { FeedCard } from "@/lib/recommend/feed";

import { FeedPreviewGate } from "./feed-preview-gate";

/**
 * The last onboarding screen — blurred recommendations with the profile
 * sign-in card floating on top.
 */

export interface StepFeedProps {
  state: GuestOnboardingState;
  signedIn: boolean;
  migration: { status: "idle" | "running" | "done" | "failed"; message?: string };
  onFinish: (cards: FeedCard[]) => void;
}

export function StepFeed({ state, signedIn, migration, onFinish }: StepFeedProps) {
  const [signInError, setSignInError] = useState<string | null>(null);

  const startSignIn = async () => {
    setSignInError(null);
    const { error } = await signIn({ next: "/onboarding" });
    if (error) setSignInError(error);
  };

  return (
    <FeedPreviewGate
      state={state}
      signedIn={signedIn}
      migration={migration}
      onSignIn={startSignIn}
      onFinish={onFinish}
      signInDisabled={!isConfigured()}
      signInError={signInError}
    />
  );
}
