"use server";

import { cookies } from "next/headers";

import { deleteSignedInAccount, getSessionUser } from "@/lib/db/auth";
import { ONBOARDING_COOKIE } from "@/lib/onboarding/state";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
}

/** Permanently delete the caller's account and all saved catalog data. */
export async function deleteAccountAction(): Promise<SettingsActionResult> {
  const account = await getSessionUser();
  if (!account) {
    return { ok: false, error: "You are not signed in." };
  }

  const { error } = await deleteSignedInAccount(account.userId);
  if (error) return { ok: false, error };

  // The completion cookie outlived the account and made re-sign-in skip the
  // first feed. Clear it with the row so the next pass is a real first run.
  const store = await cookies();
  store.delete(ONBOARDING_COOKIE);

  return { ok: true };
}
