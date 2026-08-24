"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RiDeleteBinLine } from "@remixicon/react";
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from "react-aria-components";

import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { deleteFolder } from "@/lib/bookmarks/store";
import { toast } from "@/lib/toast/store";
import { cx } from "@/utils/cx";

/**
 * Deleting a folder.
 *
 * ── Bookmarks survive by default ──────────────────────────────────────────
 *
 * Deleting a folder deletes an *arrangement*, not the classes in it. Everything
 * inside stays saved and reappears under Uncategorized. That is the reversible
 * reading of an ambiguous verb, and the ambiguity is real: "delete Systems
 * track" plausibly means either thing, so the default has to be the one you can
 * recover from.
 *
 * The checkbox is there because the other reading is also legitimate — a
 * shortlist you have finished with is a folder *and* twelve classes you no
 * longer want in your saved list, and making somebody delete those one at a
 * time afterwards is busywork. It is opt-in, unchecked, and it says the count
 * out loud, because that is the number that decides whether you want it.
 *
 * ── Why a modal and not a menu confirm ────────────────────────────────────
 *
 * This is the only destructive action in the feature with no Undo — the delete
 * is a single server-side transaction that removes rows from three tables, and
 * reconstructing folder memberships client-side afterwards would be a guess.
 * A choice you cannot take back gets a stop, not a hover.
 */

export interface DeleteFolderDialogProps {
  folderId: string;
  name: string;
  /** How many saved classes are filed in it, across all terms. */
  count: number;
}

export function DeleteFolderDialog({ folderId, name, count }: DeleteFolderDialogProps) {
  const router = useRouter();
  const [alsoDelete, setAlsoDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirm = async (close: () => void) => {
    setIsDeleting(true);
    try {
      const removed = await deleteFolder(folderId, alsoDelete);
      close();
      router.push("/saved");
      toast.info({
        title: `Deleted ${name}`,
        description:
          removed > 0
            ? `${removed} saved ${removed === 1 ? "class" : "classes"} removed with it.`
            : count > 0
              ? "Its classes are still saved, under Uncategorized."
              : undefined,
        dedupeKey: "folder-deleted",
      });
    } catch (cause) {
      toast.error({
        title: "Couldn't delete that folder",
        description: cause instanceof Error ? cause.message : "Please try again.",
        dedupeKey: "folder-delete-error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AriaDialogTrigger
      onOpenChange={(open) => {
        // Reset on every open. A checkbox that remembers "yes, delete the
        // classes too" from a previous folder is a trap, not a convenience.
        if (open) setAlsoDelete(false);
      }}
    >
      <Button size="small" variant="ghost" leadingIcon={RiDeleteBinLine}>
        Delete folder
      </Button>

      <AriaModalOverlay
        isDismissable
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px]"
      >
        <AriaModal className="w-full max-w-md">
          <AriaDialog
            role="alertdialog"
            className="flex flex-col gap-4 rounded-2xl border border-border-button-default bg-background-primary-default p-5 shadow-dropdown outline-none"
          >
            {({ close }) => (
              <>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-headline-semibold text-text-primary">Delete “{name}”?</h2>
                  <p className="text-body-regular text-text-secondary">
                    {count === 0
                      ? "This folder is empty."
                      : `The ${count} ${count === 1 ? "class" : "classes"} in it stay saved — you'll find ${count === 1 ? "it" : "them"} under Uncategorized.`}
                  </p>
                </div>

                {count > 0 ? (
                  <Checkbox
                    isSelected={alsoDelete}
                    onChange={setAlsoDelete}
                    className={cx(
                      "items-start gap-2.5 rounded-xl border p-3",
                      alsoDelete
                        ? "border-border-error-default bg-background-tertiary-error"
                        : "border-border-table",
                    )}
                  >
                    <span className="flex flex-col gap-0.5 text-left">
                      <span>
                        Also remove the {count} saved{" "}
                        {count === 1 ? "class" : "classes"}
                      </span>
                      <span className="text-caption-1-regular text-text-tertiary">
                        {/* A class filed in two folders is not orphaned by
                            this, so the sentence has to be precise or it
                            over-promises destruction. */}
                        Classes also filed in another folder are removed too. This can&apos;t be
                        undone.
                      </span>
                    </span>
                  </Checkbox>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button size="small" variant="secondary" onClick={close} disabled={isDeleting}>
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() => void confirm(close)}
                    disabled={isDeleting}
                  >
                    {alsoDelete ? "Delete folder and classes" : "Delete folder"}
                  </Button>
                </div>
              </>
            )}
          </AriaDialog>
        </AriaModal>
      </AriaModalOverlay>
    </AriaDialogTrigger>
  );
}
