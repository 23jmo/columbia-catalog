import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RecommendationReason } from "@/lib/recommend/types";

import { FeedCardWhy } from "./feed-card";

/**
 * "Make sure each recommendation is clear WHY we recommended that" is the
 * whole brief for this block, so the assertions here are about the sentence a
 * student reads, not about classes.
 *
 * The reason kinds are deliberately distinct in `RecommendationReason` — "it
 * clears the Global Core" and "you might like it" are different claims — and
 * this is the surface where that distinction either survives or gets blended
 * into a relevance score. Each test below is one claim staying itself.
 */

const render = (reasons: RecommendationReason[]) =>
  renderToStaticMarkup(<FeedCardWhy reasons={reasons} />)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

describe("FeedCardWhy", () => {
  it("names the requirement a course clears", () => {
    expect(render([{ kind: "required", groupId: "gc", groupLabel: "Global Core" }])).toBe(
      "Satisfies Global Core",
    );
  });

  it("splits 'interesting and counts' into its two separate claims", () => {
    // One row would make the student weigh a degree fact and a taste guess as
    // if they were the same kind of statement. They are not.
    const text = render([
      {
        kind: "interesting_and_counts",
        groupId: "gc",
        groupLabel: "Global Core",
        similarTo: ["COMS1004W"],
      },
    ]);
    expect(text).toContain("Satisfies Global Core");
    expect(text).toContain("which you took");
  });

  it("says what a taste match is based on", () => {
    // "Recommended for you" is not a reason. A course the student can name is.
    expect(render([{ kind: "because_you_took", similarTo: ["COMS1004W"] }])).toContain(
      "which you took",
    );
  });

  it("counts unlocked courses from the real total, not the three-item sample", () => {
    // The regression this file exists for: reading the count off `courseIds`
    // printed "3 more courses" on every card in the feed.
    expect(
      render([
        {
          kind: "unlocks",
          courseIds: ["COMS3134W", "COMS3157W", "COMS3203W"],
          unlockedCount: 17,
        },
      ]),
    ).toBe("Opens up 17 more courses");
  });

  it("keeps the singular singular", () => {
    expect(
      render([{ kind: "unlocks", courseIds: ["COMS3134W"], unlockedCount: 1 }]),
    ).toBe("Opens up 1 more course");
  });

  it("renders nothing at all when there is no reason to give", () => {
    // A signed-out feed has no personal claim to make, and the panel says so
    // once above the cards. Eight cards each inventing a reason would be worse
    // than eight cards that do not pretend.
    expect(renderToStaticMarkup(<FeedCardWhy reasons={[]} />)).toBe("");
  });

  it("stops at three rows", () => {
    // A fourth row costs a card-height across the whole page to add a reason
    // nobody read the first three to reach.
    const html = renderToStaticMarkup(
      <FeedCardWhy
        reasons={[
          {
            kind: "interesting_and_counts",
            groupId: "gc",
            groupLabel: "Global Core",
            similarTo: ["COMS1004W"],
          },
          { kind: "required", groupId: "sci", groupLabel: "Science" },
          { kind: "unlocks", courseIds: ["COMS3134W"], unlockedCount: 9 },
        ]}
      />,
    );
    expect(html.match(/<li /g) ?? []).toHaveLength(3);
  });
});
