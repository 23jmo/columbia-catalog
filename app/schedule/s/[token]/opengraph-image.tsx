/**
 * The preview card a shared schedule link unfurls into.
 *
 * Drawn from the same blocks the page draws, so the picture in iMessage is
 * the week itself and not a logo. Five columns, the fitted hour window, one
 * hue per course — the grid at a glance, with the name on top.
 */

import { ImageResponse } from "next/og";

import { toWeekGridBlocks } from "@/components/schedule/to-blocks";
import { fitGridBounds, gridWeekdays, layoutWeek, ownerIdOf } from "@/components/schedule/to-blocks";
import { WEEKDAY_SHORT, minutesToLabel, termLabel } from "@/lib/constants";
import { loadSharedSchedule } from "@/lib/db/shared-schedule";

export const alt = "A shared class schedule on LionPlan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HUES = ["#dbeafe|#1d4ed8", "#ede9fe|#6d28d9", "#d1fae5|#065f46", "#fce7f3|#be185d", "#ecfccb|#3f6212"];

function hueFor(ownerId: string): { bg: string; fg: string } {
  const key = ownerId.replace(/^\d{5}/, "").replace(/\d{3}$/, "");
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  const [bg, fg] = HUES[hash % HUES.length].split("|");
  return { bg, fg };
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await loadSharedSchedule(token);

  const blocks = shared
    ? toWeekGridBlocks({ sections: shared.sections, customBlocks: shared.customBlocks })
    : [];
  const bounds = fitGridBounds(blocks);
  const days = gridWeekdays(blocks);
  const laidOut = layoutWeek(blocks, days);
  const span = bounds.endMinute - bounds.startMinute;

  const owner = shared?.ownerName?.trim().split(/\s+/)[0];
  const heading = shared
    ? `${owner ? `${owner}’s` : "A"} ${termLabel(shared.termCode)} schedule`
    : "Schedule not found";
  const count = shared ? `${shared.sections.length} ${shared.sections.length === 1 ? "class" : "classes"}` : "";

  const gridTop = 150;
  const gridHeight = 440;
  const gutter = 70;
  const colWidth = (1200 - 80 - gutter) / days.length;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#f8fafc",
          color: "#101828",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          padding: "40px 40px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>{heading}</div>
            <div style={{ fontSize: 22, color: "#475467" }}>{count}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 600 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(#3b82f6,#2563eb)" }} />
            LionPlan
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: gridTop,
            left: 40,
            width: 1120,
            height: gridHeight,
            display: "flex",
            borderRadius: 20,
            border: "1px solid #e4e7ec",
            background: "#ffffff",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", width: gutter, paddingTop: 40 }}>
            {Array.from({ length: Math.floor(span / 60) }, (_, index) => bounds.startMinute + (index + 1) * 60)
              .filter((minute) => minute < bounds.endMinute)
              .map((minute) => (
                <div
                  key={minute}
                  style={{
                    position: "absolute",
                    top: 40 + ((minute - bounds.startMinute) / span) * (gridHeight - 40) - 8,
                    right: 8,
                    fontSize: 13,
                    color: "#98a2b3",
                  }}
                >
                  {minutesToLabel(minute).replace(":00", "")}
                </div>
              ))}
          </div>
          {days.map((day) => (
            <div
              key={day}
              style={{
                display: "flex",
                flexDirection: "column",
                width: colWidth,
                borderLeft: "1px solid #e4e7ec",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#475467",
                  background: "#f2f4f7",
                  borderBottom: "1px solid #e4e7ec",
                }}
              >
                {WEEKDAY_SHORT[day]}
              </div>
              {(laidOut.get(day) ?? []).map((block) => {
                const hue = hueFor(ownerIdOf(block.blockId));
                const top = 40 + ((block.startMinute - bounds.startMinute) / span) * (gridHeight - 40);
                const height = ((block.endMinute - block.startMinute) / span) * (gridHeight - 40);
                const laneWidth = colWidth / block.laneCount;
                return (
                  <div
                    key={block.blockId}
                    style={{
                      position: "absolute",
                      top,
                      left: block.lane * laneWidth + 2,
                      width: laneWidth - 4,
                      height: Math.max(height, 18),
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      borderRadius: 8,
                      borderLeft: `4px solid ${hue.fg}`,
                      background: hue.bg,
                      color: hue.fg,
                      padding: "4px 8px",
                      fontSize: 15,
                      fontWeight: 600,
                      lineHeight: 1.2,
                    }}
                  >
                    <div>{block.label}</div>
                    {height > 44 ? (
                      <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>
                        {minutesToLabel(block.startMinute)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
