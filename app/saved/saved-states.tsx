"use client";

import type { ReactNode } from "react";

import { RiBookmarkLine, RiSearchLine } from "@remixicon/react";

import { Button, ButtonLink } from "@/components/base/buttons/button";
import { signIn } from "@/lib/db/auth";
import { toast } from "@/lib/toast/store";
import { ALL_FOLDER, UNCATEGORIZED_FOLDER } from "@/lib/bookmarks/grouping";

/**
 * The two screens that are not a list of classes.
 *
 * Both say the same thing in different words: this page is empty because of
 * something you can fix, and here is the control that fixes it. An empty state
 * whose only content is "Nothing here" makes the reader work out what to do
 * next, and the answer is never obvious from a blank page.
 */

export function SavedSignedOut() {
  return (
    <Shell
      // The whole page, so its title is the page title. Both `/saved` and
      // `/saved/[folderId]` return this INSTEAD of their header, so without
      // this the document would have an h2 and no h1 at all.
      as="h1"
      title="Sign in to see your saved classes"
      body="LionPlan is free to search and browse courses. Sign in to save them for later, file them into folders and get seat alerts."
    >
      <Button
        size="small"
        onClick={() => {
          void signIn().then(({ error }) => {
            if (error) toast.error({ title: "Couldn't start sign-in", description: error });
          });
        }}
      >
        Sign in with Columbia
      </Button>
    </Shell>
  );
}

export function SavedEmpty({ scope }: { scope: string }) {
  if (scope === UNCATEGORIZED_FOLDER) {
    return (
      <Shell
        title="Nothing uncategorized"
        body="Every class you've saved is filed in at least one folder. Uncategorized is where a class lands when it isn't in any — it isn't a folder you can put things in."
      />
    );
  }

  if (scope !== ALL_FOLDER) {
    return (
      <Shell
        title="This folder is empty"
        body="Open a class, press the bookmark, and use “Add to folder” on the confirmation — or the ⋯ menu on any saved section."
      >
        <ButtonLink size="small" variant="secondary" href="/search" leadingIcon={RiSearchLine}>
          Find classes
        </ButtonLink>
      </Shell>
    );
  }

  return (
    <Shell
      title="Nothing saved yet"
      body="The bookmark on any section adds it here. It's a shortlist, not a schedule — save more than you'll take, and narrow it down later."
    >
      <ButtonLink size="small" href="/search" leadingIcon={RiSearchLine}>
        Find classes
      </ButtonLink>
    </Shell>
  );
}

function Shell({
  title,
  body,
  children,
  as: Heading = "h2",
}: {
  title: string;
  body: string;
  children?: ReactNode;
  /** `h1` when this state replaces the page header, `h2` when it sits under one. */
  as?: "h1" | "h2";
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-border-table bg-background-secondary-default/40 p-6">
      <span className="flex size-10 items-center justify-center rounded-full bg-background-tertiary-default">
        <RiBookmarkLine className="size-5 text-foreground-icon-secondary" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <Heading className="text-headline-semibold text-text-primary">{title}</Heading>
        <p className="max-w-prose text-body-regular text-text-secondary">{body}</p>
      </div>
      {children}
    </div>
  );
}
