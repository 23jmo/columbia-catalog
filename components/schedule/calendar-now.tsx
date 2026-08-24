/**
 * Ported from Nuxt Calendar Template (MIT)
 * `app/components/calendar/NowIndicator.vue`
 */

"use client";

import { useEffect, useState } from "react";
import { PX_PER_MINUTE } from "./calendar-layout";

export function NowIndicator() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const top = (now.getHours() * 60 + now.getMinutes()) * PX_PER_MINUTE;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-status-rose-text"
      style={{ top: `${top}px` }}
    >
      <div className="absolute -start-1 -top-[5px] size-2 rounded-full bg-status-rose-text" />
    </div>
  );
}
