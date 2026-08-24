"use client";

import { useState } from "react";
import { RiGoogleFill, RiPlugLine, RiSparkling2Line } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { signIn } from "@/lib/db/auth";
import { isConfigured } from "@/lib/db/client";
import type { GuestOnboardingState } from "@/lib/onboarding/state";
import { interestTagsForPrograms } from "@/lib/profile/interest-tags";

/**
 * The last screen — the first feed, rendered for a GUEST, with the gate on it.
 *
 * ── The only card in the flow ───────────────────────────────────────────────
 *
 * Every screen before this one floats on the neutral ground with nothing under
 * it. This one is a card, and it is the only one, because it is the only screen
 * that is a summary rather than a question: it reads back everything the
 * student said and asks them to commit to it. The card is what marks the
 * change of mode, and it only carries that meaning because nothing else in the
 * flow uses one.
 *
 * ── The feed itself is another lane's, and this says so out loud ────────────
 *
 * `components/feed/**` does not exist yet. The honest thing at a lane boundary
 * is a designed stand-in that states the contract rather than a fake feed:
 * shipping plausible-looking cards here would make the missing dependency
 * invisible, and the first person to notice would be a student. When the feed
 * lands, this block is replaced by the component and nothing else on this
 * screen moves — the guest state it needs is already assembled.
 *
 * What IS real on this screen is the summary: the student's declared programs,
 * their confirmed coursework, and their interest tags, all read back to them.
 * That is not filler. It is the last chance to catch a wrong answer before it
 * becomes their profile, and it is data we actually hold.
 *
 * ── The gate: guest-allowed through here, gated after ───────────────────────
 *
 * Everything up to and including this screen is free. The SECOND action — a new
 * query, saving a section, adding to a plan, refreshing recommendations —
 * requires signing in. That boundary is deliberate and it is stated on the
 * screen rather than discovered: a student who has just spent four steps
 * telling us about themselves should not be surprised by a wall.
 *
 * Signing in returns to this same path (`signIn` carries the current location),
 * and the parent flow's migration effect then flushes the guest state into the
 * account in one transaction.
 */

export interface StepFeedProps {
  state: GuestOnboardingState;
  signedIn: boolean;
  /** Set while the guest→account flush is in flight, or after it landed. */
  migration: { status: "idle" | "running" | "done" | "failed"; message?: string };
  onFinish: () => void;
}

export function StepFeed({ state, signedIn, migration, onFinish }: StepFeedProps) {
  const [signInError, setSignInError] = useState<string | null>(null);
  const tags = interestTagsForPrograms(state.programIds).filter((tag) =>
    state.interestTags.includes(tag.id),
  );
  const liked = state.courses.filter((course) => course.liked === true);

  const startSignIn = async () => {
    setSignInError(null);
    const { error } = await signIn();
    if (error) setSignInError(error);
  };

  return (
    <div className="flex flex-col gap-6 rounded-[20px] border border-border-table bg-background-full p-5 shadow-card sm:p-6">
      {/*
        The lane placeholder. Deliberately shaped like the one in
        `components/course/panel.tsx` so it reads as a known, tracked gap rather
        than as a broken screen.
      */}
      <div className="flex items-start gap-3 rounded-2lg border border-dashed border-border-button-default bg-background-secondary-default p-4">
        <RiPlugLine className="mt-0.5 size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
        <div className="min-w-0">
          <p className="text-body-medium text-text-primary">
            Your feed is not wired up on this build yet.
          </p>
          <p className="mt-0.5 text-caption-1-regular text-text-secondary">
            Waiting on{" "}
            <code className="rounded-sm bg-background-tertiary-default px-1 py-px font-mono">
              components/feed
            </code>
            . Everything it needs is assembled and saved below.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Summary label="Degree">
          {state.school ?? "\u2014"}
          {state.classYear ? ` \u00b7 ${state.classYear}` : ""}
          <span className="mt-1 block text-caption-1-regular text-text-secondary">
            {state.programIds.length === 0
              ? "No programs declared"
              : `${state.programIds.length} program${state.programIds.length === 1 ? "" : "s"}`}
          </span>
        </Summary>
        <Summary label="Coursework">
          {state.courses.length}
          <span className="mt-1 block text-caption-1-regular text-text-secondary">
            {liked.length} marked as liked
          </span>
        </Summary>
        <Summary label="Interests">
          {tags.length}
          <span className="mt-1 block text-caption-1-regular text-text-secondary">
            {tags.length === 0 ? "None picked" : tags.map((tag) => tag.label).join(", ")}
          </span>
        </Summary>
      </dl>

      {/* \u2500\u2500 The gate \u2500\u2500 */}
      <section className="flex flex-col gap-3 border-t border-separator-border pt-5">
        <div className="flex items-start gap-3">
          <RiSparkling2Line className="mt-0.5 size-5 shrink-0 text-accent-500" aria-hidden />
          <div className="min-w-0">
            {signedIn ? (
              <>
                <p className="text-body-medium text-text-primary">
                  {migration.status === "done"
                    ? "Saved to your account."
                    : migration.status === "running"
                      ? "Saving this to your account\u2026"
                      : migration.status === "failed"
                        ? "We could not save this yet."
                        : "You're signed in."}
                </p>
                <p className="mt-0.5 text-caption-1-regular text-text-secondary">
                  {migration.message ??
                    "Your coursework and interests live on your profile now \u2014 you can edit any of it there."}
                </p>
              </>
            ) : (
              <>
                <p className="text-body-medium text-text-primary">
                  Everything so far is free. Saving it takes an account.
                </p>
                <p className="mt-0.5 text-caption-1-regular text-text-secondary">
                  Reading is always free. Signing in is what lets us keep your record, save
                  sections, and answer follow-up questions \u2014 and it moves everything you just
                  told us across in one go. Nothing is lost if you don&rsquo;t.
                </p>
              </>
            )}
          </div>
        </div>

        {!signedIn ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button leadingIcon={RiGoogleFill} onClick={startSignIn} disabled={!isConfigured()}>
              Continue with Columbia
            </Button>
            <Chip variant="caption" color="soft">
              columbia.edu \u00b7 barnard.edu
            </Chip>
          </div>
        ) : null}

        {signInError ? (
          <p className="text-caption-1-regular text-text-error-primary">{signInError}</p>
        ) : null}
        {!isConfigured() ? (
          <p className="text-caption-1-regular text-text-tertiary">
            Accounts are not configured on this deployment. The flow still works; nothing is saved.
          </p>
        ) : null}

        <div>
          <Button variant="secondary" onClick={onFinish}>
            Take me to the catalog
          </Button>
        </div>
      </section>
    </div>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2lg border border-border-table bg-background-secondary-default p-3">
      <dt className="text-caption-2-medium tracking-[0.08em] text-text-tertiary uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-headline-semibold -tracking-[0.01em] text-text-primary">
        {children}
      </dd>
    </div>
  );
}
