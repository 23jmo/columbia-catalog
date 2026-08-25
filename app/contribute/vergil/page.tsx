import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";
import { getSessionUser } from "@/lib/db/auth";

import { VergilContributionClient } from "./vergil-contribution-client";

export const metadata: Metadata = {
  title: "Contribute Vergil schedules · LionPlan",
  description: "Review and contribute sanitized class times and locations captured by Vergil.",
};

export const dynamic = "force-dynamic";

const DEVELOPMENT_EXTENSION_ID = "mnhdnmpdfhpgobfdjhjpjhifmfaedmeh";

export default async function VergilContributionPage() {
  const account = await getSessionUser();
  const extensionId =
    process.env.NEXT_PUBLIC_VERGIL_EXTENSION_ID ?? DEVELOPMENT_EXTENSION_ID;

  return (
    <AppShell activeNav="home">
      <PageContent className="max-w-[760px]">
        <VergilContributionClient extensionId={extensionId} signedIn={account !== null} />
      </PageContent>
    </AppShell>
  );
}

