import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * `FeedCardView` links through `PrefetchLink`, which calls `useRouter`. There is
 * no app router under `renderToStaticMarkup`, and prefetching is not what any
 * assertion below is about -- the card's own markup is.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: () => {} }),
}));

import type { RecommendationReason } from "@/lib/recommend/types";

import { LANDING_FEED_CARDS } from "@/components/marketing/landing/landing-fixtures";

import { FeedCardView, FeedCardWhy } from "./feed-card";

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

/**
 * Which class the card says it is offering.
 *
 * On a container course the section IS the class: COMS 6998 is one course
 * called "Topics in Computer Science" carrying 20 unrelated seminars, so a card
 * for one of them headed with the course title has not answered the only
 * question the reader has. `lib/recommend/feed.test.ts` pins that the topic
 * title reaches the card; this pins that the card prints it.
 */
describe("FeedCardView and a section that names its own class", () => {
  const text = (card: Parameters<typeof FeedCardView>[0]["card"]) =>
    renderToStaticMarkup(<FeedCardView card={card} readOnly />)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const base = LANDING_FEED_CARDS[0];

  it("leads with the topic title and keeps the course as context", () => {
    const rendered = text({
      ...base,
      courseId: "COMS6998E",
      code: "COMS 6998",
      title: "TOPICS IN COMPUTER SCIENCE",
      best: { ...base.best, title: "COMPUTATION AND THE BRAIN" },
    });

    expect(rendered).toContain("Computation and the Brain");
    // The container is still named, so the reader knows what this is part of --
    // but as context under the class, not as the class.
    expect(rendered).toContain("Part of Topics in Computer Science");
    expect(rendered.indexOf("Computation and the Brain")).toBeLessThan(
      rendered.indexOf("Part of Topics in Computer Science"),
    );
  });

  it("keeps acronyms out of title case, the way the course title already does", () => {
    // `prettyTitle` alone renders this "Llm Based Generative Ai".
    const rendered = text({
      ...base,
      title: "TOPICS IN COMPUTER SCIENCE",
      best: { ...base.best, title: "LLM BASED GENERATIVE AI" },
    });
    expect(rendered).toContain("LLM Based Generative AI");
  });

  it("says nothing extra on an ordinary course", () => {
    // `best.title` is null unless the feed decided the section names a class of
    // its own, so there is no second line to print and no "Part of" to read.
    const rendered = text(base);
    expect(rendered).toContain("Data Structures in Java");
    expect(rendered).not.toContain("Part of");
  });
});
