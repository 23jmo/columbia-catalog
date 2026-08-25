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
      title="Use LionPlan in your agent"
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
      /*
        The dismiss is a `CloseButton size="xs"` — a 20px circle, under the
        WCAG 2.5.8 floor. `Announcement` lives in `components/base`, which this
        project does not modify, and it exposes no handle on that button, so the
        hit area is asked for from out here by descendant selector. The circle
        keeps its 20px look; only the pressable region grows to 44, and it grows
        up and to the right into the card's own padding, where the nearest other
        control ("Set up") is a full row away.
      */
      className="rounded-[20px] p-5 sm:p-6 pointer-coarse:[&_button[aria-label='Dismiss']]:before:absolute pointer-coarse:[&_button[aria-label='Dismiss']]:before:-inset-3 pointer-coarse:[&_button[aria-label='Dismiss']]:before:content-['']"
    />
  );
}
