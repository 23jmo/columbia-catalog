"use server";

import { deleteSignedInAccount, getSessionUser } from "@/lib/db/auth";

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

  return { ok: true };
}
