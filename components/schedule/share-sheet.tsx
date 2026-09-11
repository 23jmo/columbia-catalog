"use client";

import { useEffect, useState } from "react";
import { RiCheckLine, RiDownloadLine, RiFileCopyLine, RiShareForwardLine } from "@remixicon/react";

import { Button } from "@/components/base/buttons/button";
import { Switch } from "@/components/base/switch/switch";
import { useSessionAccount } from "@/hooks/use-session-account";
import { termLabel } from "@/lib/constants";
import { signIn } from "@/lib/db/auth";
import { readScheduleShareToken, setScheduleShared, sharedScheduleUrl } from "@/lib/db/plan-share";
import { toast } from "@/lib/toast/store";
import type { TermCode } from "@/lib/types";
import { cx } from "@/utils/cx";

import { Sheet } from "./sheet";

/**
 * Share — one switch, one link.
 *
 * The link is read-only and shows the schedule as it is when opened, not as
 * it was when shared: the token points at the plan, not at a snapshot, so a
 * friend who opens it tomorrow sees tomorrow's version. Turning the switch
 * off kills the link; turning it back on mints a new one.
 *
 * The switch is the only state. There is no list of who has it and no
 * expiry, because the product has one schedule and the honest description of
 * a shared link is "anyone with it can see this until you turn it off".
 */

export interface ShareSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  termCode: TermCode;
  /** Present when there is something with a time to export. */
  onExportIcs?: () => void;
}

export function ShareSheet({ isOpen, onOpenChange, termCode, onExportIcs }: ShareSheetProps) {
  const { account, isLoading } = useSessionAccount();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !account) return;
    let active = true;
    readScheduleShareToken(termCode).then((value) => {
      if (active) setToken(value);
    });
    return () => {
      active = false;
    };
  }, [isOpen, account, termCode]);

  const url = token ? sharedScheduleUrl(token) : null;

  const setShared = async (enabled: boolean) => {
    setIsBusy(true);
    try {
      const next = await setScheduleShared(termCode, enabled);
      setToken(next);
      setCopied(false);
    } catch (cause) {
      toast.error({
        title: enabled ? "Couldn't create a link" : "Couldn't turn sharing off",
        description: cause instanceof Error ? cause.message : "Please try again.",
        dedupeKey: "schedule-share",
      });
    } finally {
      setIsBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info({ title: "Copy the link from the box above", dedupeKey: "schedule-copy" });
    }
  };

  const shareNative = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: `My ${termLabel(termCode)} schedule`, url });
    } catch {
      // Dismissed. Nothing to say.
    }
  };

  const canShareNative = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Sheet isOpen={isOpen} onOpenChange={onOpenChange} title="Share your schedule">
      <div className="flex flex-col gap-5 px-5 pb-4 pt-3 sm:pb-5">
        {!account && !isLoading ? (
          <div className="flex flex-col gap-3 rounded-xl bg-background-secondary-default p-4">
            <p className="text-body-regular text-text-secondary">
              A link needs somewhere to point. Sign in and your schedule gets one.
            </p>
            <Button onClick={() => void signIn()} className="self-start">
              Sign in
            </Button>
          </div>
        ) : (
          <>
            <Switch
              isSelected={Boolean(token)}
              isDisabled={isBusy || token === undefined}
              onChange={(value) => void setShared(value)}
              className="w-full justify-between"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-body-medium text-text-primary">Anyone with the link can view</span>
                <span className="text-caption-1-regular text-text-tertiary">
                  Read-only. They see the week as it is now, and stop seeing it when you turn this off.
                </span>
              </span>
            </Switch>

            {url ? (
              <div className="flex flex-col gap-2">
                <div
                  className={cx(
                    "flex h-11 items-center gap-2 rounded-xl border border-border-button-default bg-background-secondary-default pl-3 pr-1",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-caption-1-regular tabular-nums text-text-secondary">
                    {url.replace(/^https?:\/\//, "")}
                  </span>
                  <Button
                    size="small"
                    variant="ghost"
                    leadingIcon={copied ? RiCheckLine : RiFileCopyLine}
                    onClick={() => void copy()}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                {canShareNative ? (
                  <Button leadingIcon={RiShareForwardLine} onClick={() => void shareNative()}>
                    Share…
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {onExportIcs ? (
          <div className="flex flex-col gap-2 border-t border-border-table pt-4">
            <Button variant="secondary" leadingIcon={RiDownloadLine} onClick={onExportIcs} className="self-start">
              Download .ics
            </Button>
            <p className="text-caption-2-regular text-text-tertiary">
              Every meeting with a published time, for Google Calendar or Apple Calendar.
            </p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
