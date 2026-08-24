"use client";

import { useState, useTransition } from "react";

import { Checkbox } from "@/components/base/checkbox/checkbox";
import { setAttestationAction } from "@/app/profile/actions";

/**
 * The tick box for a requirement no public data source can verify.
 *
 * Language matters more than mechanics here. The label is "I have completed
 * this" and the confirmation under it reads "you certified this on <date>" —
 * never "verified", never "complete", never a bare green tick. The audit engine
 * already refuses to promote an `attested` group to a stronger tier
 * (`verificationOf` derives the tier from the rule kind, so it cannot be
 * authored around); this component's job is to make sure the *screen* does not
 * quietly do what the engine won't.
 *
 * Optimistic on the checkbox, authoritative on the server. The box flips
 * immediately because a checkbox that lags feels broken; if the write fails the
 * box flips back and says why.
 */

export interface AttestToggleProps {
  programId: string;
  groupId: string;
  attestedAt: string | null;
}

function attestedOnLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "earlier";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AttestToggle({ programId, groupId, attestedAt }: AttestToggleProps) {
  const [checked, setChecked] = useState(attestedAt != null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const change = (next: boolean) => {
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const result = await setAttestationAction(programId, groupId, next);
      if (!result.ok) {
        setChecked(!next);
        setError(result.error ?? "Could not save that.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Checkbox isSelected={checked} onChange={change} size="sm">
        I have completed this
      </Checkbox>
      <p className="text-caption-2-regular text-text-tertiary">
        {checked
          ? `You certified this${attestedAt ? ` on ${attestedOnLabel(attestedAt)}` : ""}. We have no way to confirm it — your adviser does.`
          : "Nothing public records this one, so it stays open until you say otherwise."}
      </p>
      {error ? (
        <p className="text-caption-2-regular text-text-error-primary" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
