"use client";

import { useRouter } from "next/navigation";
import { RiRobot2Line } from "@remixicon/react";
import { Announcement } from "@/components/base/announcement/announcement";
import { SETUP_PATH } from "@/lib/mcp/config";

/** Home reminder — links to `/mcp-setup`. Dismissal is session-only. */
export function AgentAnnouncement() {
  const router = useRouter();

  return (
    <Announcement
      icon={RiRobot2Line}
      title="Use Columbia Catalog in your agent"
      actionLabel="Set up"
      onAction={() => router.push(SETUP_PATH)}
      dismissible
      closeLabel="Dismiss"
      introDelay={0.15}
      /*
        `Announcement` is sized for the 236px sidebar it was drawn for — 12px
        padding, 12px radius. Home uses it as a full-width banner in a 900px
        column, stacked between the page header and two 24px/20px cards, so at
        its native scale its content line sat at 424 while the header sat at 412
        and both cards at 436: three left edges in one column.
      */
      className="rounded-[20px] p-5 sm:p-6"
    />
  );
}
