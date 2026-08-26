"use client";

import { useEffect } from "react";

import { authErrorCopy } from "@/components/shell/auth-error-notice";
import { toast } from "@/lib/toast/store";

/**
 * Turns `?auth_error=` into a toast on this route.
 *
 * The banner used to sit on the ornament. A toast uses the same store as the
 * transcript offer, so a refused Gmail sign-in is a message they can dismiss
 * rather than a strip covering the first question.
 */
export function AuthErrorToast({ reason }: { reason?: string | string[] }) {
  const key = Array.isArray(reason) ? reason[0] : reason;

  useEffect(() => {
    if (!key) return;
    const copy = authErrorCopy(key);
    toast.error({
      title: copy.title,
      description: copy.description,
      dedupeKey: "onboarding-auth-error",
    });
  }, [key]);

  return null;
}
