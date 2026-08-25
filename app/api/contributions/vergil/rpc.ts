import "server-only";

import { SUPABASE_URL } from "@/lib/db/client";

export class ContributionDatabaseError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "ContributionDatabaseError";
    this.code = code;
  }
}

function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new ContributionDatabaseError("Contribution storage is not configured.");
  }
  return key;
}

interface PostgrestErrorBody {
  code?: unknown;
  message?: unknown;
}

/** Calls a service-role-only RPC without widening the shared generated schema. */
export async function callContributionRpc<T>(
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const key = serviceRoleKey();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(parameters),
    cache: "no-store",
  });

  if (!response.ok) {
    let body: PostgrestErrorBody = {};
    try {
      body = (await response.json()) as PostgrestErrorBody;
    } catch {
      // The status still gives the caller a safe generic failure.
    }
    throw new ContributionDatabaseError(
      typeof body.message === "string" ? body.message : "Contribution storage rejected the request.",
      typeof body.code === "string" ? body.code : null,
    );
  }

  return (await response.json()) as T;
}

