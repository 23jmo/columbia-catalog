import type { Metadata } from "next";
import { ButtonLink } from "@/components/base/buttons/button";
import { AppShell } from "@/components/shell/app-shell";
import { PageContent } from "@/components/shell/page-content";

export const metadata: Metadata = {
  title: "Thank you · LionPlan",
  description: "Your support helps keep LionPlan running.",
};

export default function SupportThanksPage() {
  return (
    <AppShell activeNav="home">
      <PageContent className="max-w-[480px]">
        <div className="flex flex-col gap-4">
          <h1 className="text-title-2-semibold text-text-primary">Thank you</h1>
          <p className="text-body-regular text-text-secondary">
            Your coffee landed. It helps cover hosting and keeps this catalog free to browse.
          </p>
          <ButtonLink variant="secondary" href="/search">
            Back to the catalog
          </ButtonLink>
        </div>
      </PageContent>
    </AppShell>
  );
}
