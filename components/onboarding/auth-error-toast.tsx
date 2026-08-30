"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { authErrorCopy } from "@/components/shell/auth-error-notice";
import { toast } from "@/lib/toast/store";

/**
 * Turns `?auth_error=` into a toast on this route.
 *
 * The banner used to sit on the ornament. A toast uses the same store as the
 * transcript offer, so a refused Gmail sign-in is a message they can dismiss
 * rather than a strip covering the first question.
 *
 * ── Why the param is read here and not passed down ──────────────────────────
 *
 * `app/onboarding/page.tsx` used to `await searchParams` for this one value,
 * which is a dynamic API: reading it opted the whole route out of static
 * rendering, so every visit — including the overwhelming majority that carry no
 * `auth_error` at all — paid a server render in the function region instead of
 * being served the prerendered document from the CDN edge.
 *
 * Reading the param from the client instead costs nothing: this component has
 * never rendered anything, it only raises a toast from an effect, so the
 * Suspense boundary it now needs has `null` on both sides of it and there is
 * no fallback for anyone to see.
 */
export function AuthErrorToast() {
  const key = useSearchParams().get("auth_error");

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
