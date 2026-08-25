/**
 * Reading a turn — the parts of the chat surface a browser cannot check.
 *
 * The UI itself is verified by running it. What is tested here is the layer
 * underneath: a discriminated union with five tool states, arriving partially
 * streamed, whose payloads are `unknown` by design. Every assertion below is
 * about a shape that actually reaches this code in production, and several are
 * about shapes that reach it BROKEN — a tool that errored, a payload that is
 * not JSON, a row with no course in it. Those are the cases where a component
 * would otherwise throw and take the answer down with it.
 */

import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import type { FeedCard } from "@/lib/recommend/feed";

import {
  citedCourses,
  campusMapArtifacts,
  feedCards,
  instructorArtifacts,
  onboardingArtifacts,
  proseOf,
  scheduleArtifacts,
  shownCourseIds,
  suggestedFollowUps,
  toolActivity,
  toolLabel,
  turnBlocks,
  unseenFeedCards,
} from "./transcript";

/* ==========================================================================
 * Builders
 * ========================================================================== */

/**
 * A tool part, in the shape the SDK actually produces.
 *
 * Cast at the boundary rather than typed through: `ToolUIPart` is a union
 * generic over the tool set, and reconstructing that here would test the type
 * algebra rather than the reader. The cast is confined to this one function so
 * every test below stays honest about what it is passing.
 */
function toolPart(options: {
  name: string;
  id?: string;
  state: "input-available" | "output-available" | "output-error";
  output?: unknown;
  errorText?: string;
}): UIMessage["parts"][number] {
  return {
    type: `tool-${options.name}`,
    toolCallId: options.id ?? `call-${options.name}`,
    state: options.state,
    input: {},
    ...(options.output === undefined ? {} : { output: options.output }),
    ...(options.errorText === undefined ? {} : { errorText: options.errorText }),
  } as unknown as UIMessage["parts"][number];
}

function assistant(parts: UIMessage["parts"]): UIMessage {
  return { id: "m1", role: "assistant", parts };
}

function text(value: string): UIMessage["parts"][number] {
  return { type: "text", text: value };
}

/* ==========================================================================
 * Tool activity
 * ========================================================================== */

describe("tool activity", () => {
  it("reports a call that has not returned as still running", () => {
    const message = assistant([toolPart({ name: "search_courses", state: "input-available" })]);
    expect(toolActivity(message)).toEqual([
      {
        toolCallId: "call-search_courses",
        name: "search_courses",
        label: "Searching the catalog",
        state: "running",
      },
    ]);
  });

  it("reports a failed call as failed, and keeps the reason", () => {
    const message = assistant([
      toolPart({ name: "get_course", state: "output-error", errorText: "no such course" }),
    ]);
    const [activity] = toolActivity(message);
    expect(activity.state).toBe("failed");
    expect(activity.errorText).toBe("no such course");
  });

  it("does not read a failed call as a successful one with no output", () => {
    /*
     * The ordering trap this file exists to pin. `output-error` is a state in
     * the same union as `output-available`, and a reader that checks for the
     * absence of `output` first would call this one done.
     */
    const message = assistant([toolPart({ name: "get_course", state: "output-error" })]);
    expect(toolActivity(message)[0].state).not.toBe("done");
  });

  it("keeps the order the model called them in", () => {
    const message = assistant([
      toolPart({ name: "get_courses_taken", state: "output-available", output: {} }),
      toolPart({ name: "get_unmet_requirements", state: "output-available", output: {} }),
      toolPart({ name: "recommend_courses", state: "output-available", output: {} }),
    ]);
    expect(toolActivity(message).map((entry) => entry.name)).toEqual([
      "get_courses_taken",
      "get_unmet_requirements",
      "recommend_courses",
    ]);
  });

  it("shows an unknown tool by its raw name rather than hiding it", () => {
    // A silent blank would conceal a tool call from the person it was run for.
    expect(toolLabel("some_future_tool")).toBe("some_future_tool");
  });

  it("ignores text parts", () => {
    expect(toolActivity(assistant([text("hello")]))).toEqual([]);
  });
});

/* ==========================================================================
 * Cited courses
 * ========================================================================== */

describe("cited courses", () => {
  it("reads the recommendation engine's shape, with the reason", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: {
          recommendations: [
            {
              courseId: "COMS4111W",
              code: "COMS W4111",
              title: "Introduction to Databases",
              reasons: [{ kind: "required", groupId: "cs-elective", groupLabel: "CS Elective" }],
            },
          ],
        },
      }),
    ]);

    expect(citedCourses(message)).toEqual([
      {
        courseId: "COMS4111W",
        code: "COMS W4111",
        title: "Introduction to Databases",
        source: "recommend_courses",
        whyShown: "Clears CS Elective",
      },
    ]);
  });

  it("keeps requirement fit and taste as different sentences", () => {
    /*
     * The engine's whole point. If these two collapsed into one wording the
     * pane would undo, at the last step, the distinction the scoring keeps.
     */
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: {
          recommendations: [
            { courseId: "A1111W", reasons: [{ kind: "required", groupLabel: "Global Core" }] },
            {
              courseId: "B2222W",
              reasons: [{ kind: "interesting_and_counts", groupLabel: "Global Core" }],
            },
            { courseId: "C3333W", reasons: [{ kind: "because_you_took", similarTo: [] }] },
          ],
        },
      }),
    ]);

    expect(citedCourses(message).map((course) => course.whyShown)).toEqual([
      "Clears Global Core",
      "Your interests, and clears Global Core",
      "Close to what you've taken",
    ]);
  });

  it("parses a bridged MCP tool's JSON string output", () => {
    // `bridgeMcpTool` returns MCP content — JSON in a string, not an object.
    const message = assistant([
      toolPart({
        name: "search_courses",
        state: "output-available",
        output: JSON.stringify({
          courses: [{ code: "MATH UN1201", title: "Calculus III" }],
        }),
      }),
    ]);

    const [course] = citedCourses(message);
    expect(course.courseId).toBe("MATH1201UN");
    expect(course.code).toBe("MATH UN1201");
    expect(course.source).toBe("search_courses");
  });

  it("surfaces what was withheld, so 'why not that one' can be answered", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { withheld: [{ courseId: "COMS4111W", code: "COMS W4111", title: "Databases" }] },
      }),
    ]);
    expect(citedCourses(message).map((course) => course.code)).toEqual(["COMS W4111"]);
  });

  it("keeps the first mention's reason when a course is returned twice", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: {
          recommendations: [{ courseId: "COMS4111W", reasons: [{ kind: "required", groupLabel: "X" }] }],
        },
      }),
      toolPart({
        name: "get_course",
        id: "call-2",
        state: "output-available",
        output: { courses: [{ courseId: "COMS4111W" }] },
      }),
    ]);

    const courses = citedCourses(message);
    expect(courses).toHaveLength(1);
    expect(courses[0].whyShown).toBe("Clears X");
  });

  it("ignores a call that has not returned yet", () => {
    const message = assistant([toolPart({ name: "recommend_courses", state: "input-available" })]);
    expect(citedCourses(message)).toEqual([]);
  });

  it("survives output that is not JSON at all", () => {
    const message = assistant([
      toolPart({ name: "search_courses", state: "output-available", output: "not json {" }),
    ]);
    expect(citedCourses(message)).toEqual([]);
  });

  it("skips rows that carry no course", () => {
    const message = assistant([
      toolPart({
        name: "search_courses",
        state: "output-available",
        output: { courses: [null, 42, {}, { title: "no code and no id" }] },
      }),
    ]);
    expect(citedCourses(message)).toEqual([]);
  });
});

/* ==========================================================================
 * Section cards
 * ========================================================================== */

/** A `FeedCard` with only the fields `readFeedCard` actually insists on. */
function card(overrides: Record<string, unknown> = {}) {
  return {
    courseId: "COMS4111W",
    code: "COMS W4111",
    title: "Introduction to Databases",
    points: 3,
    reasons: [],
    caveats: [],
    best: {
      sectionId: "sec-1",
      sectionCode: "001",
      callNumber: "12345",
      vergilUrl: "https://vergil.columbia.edu/vergil/class/20263/12345",
    },
    others: [],
    ...overrides,
  };
}

describe("section cards", () => {
  it("reads the cards the engine returned", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card()] },
      }),
    ]);

    const [first] = feedCards(message);
    expect(first.courseId).toBe("COMS4111W");
    expect(first.best.vergilUrl).toContain("vergil.columbia.edu");
  });

  it("skips a card with no section, rather than rendering an empty shell", () => {
    /*
     * The whole point of a card is that it is a section a student can open in
     * Vergil. One with no `best` has no call number and no link, so it is a
     * course row wearing a card's clothes — `citedCourses` still lists it as
     * evidence, which is the honest place for it.
     */
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card({ best: undefined }), card({ best: { sectionId: "s" } })] },
      }),
    ]);
    expect(feedCards(message)).toEqual([]);
  });

  it("skips a card whose section carries no Vergil link", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card({ best: { sectionId: "sec-1", sectionCode: "001" } })] },
      }),
    ]);
    expect(feedCards(message)).toEqual([]);
  });

  it("keeps one card per course when a follow-up call repeats it", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card()] },
      }),
      toolPart({
        name: "recommend_courses",
        id: "call-2",
        state: "output-available",
        output: { cards: [card({ title: "A later, barer copy" }), card({ courseId: "MATH1201UN" })] },
      }),
    ]);

    const cards = feedCards(message);
    expect(cards.map((entry) => entry.courseId)).toEqual(["COMS4111W", "MATH1201UN"]);
    expect(cards[0].title).toBe("Introduction to Databases");
  });

  it("ignores a call that has not returned yet", () => {
    const message = assistant([toolPart({ name: "recommend_courses", state: "input-available" })]);
    expect(feedCards(message)).toEqual([]);
  });

  it("survives rows that are not objects", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [null, 42, "COMS W4111", []] },
      }),
    ]);
    expect(feedCards(message)).toEqual([]);
  });

  it("still lists a carded course as a cited course", () => {
    // The two readers agree on `cards`, so the answer's evidence is complete
    // even for a surface that renders no cards at all.
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card()] },
      }),
    ]);
    expect(citedCourses(message).map((course) => course.code)).toEqual(["COMS W4111"]);
  });
});

describe("shown course ids", () => {
  it("collects card ids from earlier assistant turns, once each", () => {
    const first = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card(), card({ courseId: "MATH1201UN" })] },
      }),
    ]);
    const second = { ...assistant([toolPart({
      name: "recommend_courses",
      state: "output-available",
      output: { cards: [card()] },
    })]), id: "m2" };

    expect(shownCourseIds([first, second])).toEqual(["COMS4111W", "MATH1201UN"]);
  });

  it("ignores the student's messages", () => {
    const user: UIMessage = { id: "u1", role: "user", parts: [text("more")] };
    expect(shownCourseIds([user])).toEqual([]);
  });
});

describe("unseen feed cards", () => {
  it("drops a card this thread has already shown", () => {
    const kept = unseenFeedCards(
      [{ courseId: "COMS4731W" }, { courseId: "HUMA1001CC" }] as FeedCard[],
      new Set(["COMS4731W"]),
    );
    expect(kept.map((row) => row.courseId)).toEqual(["HUMA1001CC"]);
  });
});

/* ==========================================================================
 * Prose
 * ========================================================================== */

describe("prose", () => {
  it("joins the text either side of a tool call into one answer", () => {
    const message = assistant([
      text("Let me check what you still need."),
      toolPart({ name: "get_unmet_requirements", state: "output-available", output: {} }),
      text("You owe Global Core."),
    ]);
    expect(proseOf(message)).toBe("Let me check what you still need.\n\nYou owe Global Core.");
  });

  it("drops empty text parts rather than emitting blank paragraphs", () => {
    expect(proseOf(assistant([text(""), text("   "), text("Real.")]))).toBe("Real.");
  });
});

/* ==========================================================================
 * Follow-ups
 * ========================================================================== */

describe("suggested follow-ups", () => {
  it("offers nothing when the turn ran no tools", () => {
    // Three fixed suggestions under every answer are decoration, and a student
    // stops reading them within two turns.
    expect(suggestedFollowUps(assistant([text("Hello.")]))).toEqual([]);
  });

  it("offers a follow-up to generate more when there were recommendations", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card()] },
      }),
    ]);
    expect(suggestedFollowUps(message)).toContain("Show me more like these");
  });

  it("only offers 'why these and not others' when there were recommendations", () => {
    const empty = assistant([
      toolPart({ name: "recommend_courses", state: "output-available", output: { recommendations: [] } }),
    ]);
    expect(suggestedFollowUps(empty)).not.toContain("Why these and not others?");
  });

  it("offers a clash check only once there is more than one course", () => {
    const one = assistant([
      toolPart({
        name: "search_courses",
        state: "output-available",
        output: { courses: [{ courseId: "A1111W" }] },
      }),
    ]);
    const two = assistant([
      toolPart({
        name: "search_courses",
        state: "output-available",
        output: { courses: [{ courseId: "A1111W" }, { courseId: "B2222W" }] },
      }),
    ]);

    expect(suggestedFollowUps(one)).not.toContain("Do any of these clash?");
    expect(suggestedFollowUps(two)).toContain("Do any of these clash?");
  });

  it("never offers more than three", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { recommendations: [{ courseId: "A1111W" }, { courseId: "B2222W" }] },
      }),
      toolPart({ name: "get_unmet_requirements", id: "call-2", state: "output-available", output: {} }),
      toolPart({ name: "search_courses", id: "call-3", state: "output-available", output: {} }),
    ]);
    expect(suggestedFollowUps(message).length).toBeLessThanOrEqual(3);
  });
});

/* ==========================================================================
 * Schedule and campus map
 * ========================================================================== */

describe("schedule artifacts", () => {
  it("reads a schedule_card payload into week-grid blocks", () => {
    const message = assistant([
      toolPart({
        name: "show_schedule",
        state: "output-available",
        output: {
          kind: "schedule_card",
          termCode: "20263",
          planId: "plan-1",
          planName: "Fall draft",
          blocks: [
            {
              blockId: "s@Tu@790",
              label: "COMS 4111 · 001",
              weekday: "Tu",
              startMinute: 790,
              endMinute: 865,
              tone: "plan",
            },
          ],
          commitmentIds: [],
          unknownMeetingSectionIds: [],
          unresolvedSectionIds: [],
        },
      }),
    ]);
    const [artifact] = scheduleArtifacts(message);
    expect(artifact?.planName).toBe("Fall draft");
    expect(artifact?.blocks[0]?.label).toBe("COMS 4111 · 001");
  });

  it("skips a payload that is not a schedule_card", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card()], blocks: [{ label: "nope" }] },
      }),
    ]);
    expect(scheduleArtifacts(message)).toEqual([]);
  });
});

describe("campus map artifacts", () => {
  it("reads a campus_map_card payload", () => {
    const message = assistant([
      toolPart({
        name: "show_campus_map",
        state: "output-available",
        output: {
          kind: "campus_map_card",
          buildingNames: ["Hamilton Hall"],
          roomLabel: "517",
          label: "COMS 4111 · 001",
          meta: "Thursday · 1:10pm–2:25pm",
          routeStops: [{ buildingNames: ["Hamilton Hall"], label: "COMS 4111 · 001", highlighted: true }],
          connectStops: true,
          weekday: "Th",
        },
      }),
    ]);
    const [artifact] = campusMapArtifacts(message);
    expect(artifact?.buildingNames).toEqual(["Hamilton Hall"]);
    expect(artifact?.connectStops).toBe(true);
  });
});

describe("instructor artifacts", () => {
  it("reads an instructor_card payload", () => {
    const message = assistant([
      toolPart({
        name: "show_instructor",
        state: "output-available",
        output: {
          kind: "instructor_card",
          found: true,
          name: "Adam H Cannon",
          slug: "adam-h-cannon",
          subtitle: "Computer Science",
          subjects: ["COMS"],
          termLabel: "Fall 2026",
          courseCount: 1,
          sectionCount: 2,
          courses: [{ courseId: "COMS1004W", code: "COMS 1004", title: "Intro to Java" }],
          teachingDays: ["Tu", "Th"],
          buildings: ["Mudd"],
          reputation: null,
        },
      }),
    ]);
    const [artifact] = instructorArtifacts(message);
    expect(artifact?.name).toBe("Adam H Cannon");
    expect(artifact?.slug).toBe("adam-h-cannon");
    expect(artifact?.courses[0]?.code).toBe("COMS 1004");
  });

  it("skips a card that did not resolve", () => {
    const message = assistant([
      toolPart({
        name: "show_instructor",
        state: "output-available",
        output: { kind: "instructor_card", found: false, name: "Staff", error: "placeholder" },
      }),
    ]);
    expect(instructorArtifacts(message)).toEqual([]);
  });
});

describe("turn blocks", () => {
  const schedule = {
    kind: "schedule_card",
    termCode: "20263",
    planId: "plan-1",
    planName: "Fall draft",
    blocks: [
      {
        blockId: "s@Tu@790",
        label: "COMS 4111 · 001",
        weekday: "Tu",
        startMinute: 790,
        endMinute: 865,
        tone: "plan",
      },
    ],
    commitmentIds: [],
    unknownMeetingSectionIds: [],
    unresolvedSectionIds: [],
  };

  it("keeps prose and cards in the order the parts arrived", () => {
    const message = assistant([
      text("Here is the week."),
      toolPart({ name: "show_schedule", state: "output-available", output: schedule }),
      text("And the walk."),
      toolPart({
        name: "show_campus_map",
        state: "output-available",
        output: {
          kind: "campus_map_card",
          buildingNames: ["Hamilton Hall"],
          roomLabel: "517",
          label: "COMS 4111 · 001",
          meta: null,
          routeStops: [],
          connectStops: false,
          weekday: null,
        },
      }),
    ]);
    expect(turnBlocks(message).map((block) => block.kind)).toEqual([
      "text",
      "schedule",
      "text",
      "campus_map",
    ]);
  });

  it("does not split prose around a lookup that has no card", () => {
    const message = assistant([
      text("Checking."),
      toolPart({ name: "search_courses", state: "output-available", output: { courses: [] } }),
      text("Take this."),
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card()] },
      }),
    ]);
    const blocks = turnBlocks(message);
    expect(blocks.map((block) => block.kind)).toEqual(["text", "feed"]);
    expect(blocks[0]).toEqual({ kind: "text", text: "Checking.\n\nTake this." });
  });

  it("hides a feed card this thread has already shown", () => {
    const message = assistant([
      toolPart({
        name: "recommend_courses",
        state: "output-available",
        output: { cards: [card()] },
      }),
    ]);
    expect(turnBlocks(message, new Set(["COMS4111W"]))).toEqual([]);
  });

  it("puts an onboarding prompt on the thread instead of ranking Global Core", () => {
    const message = assistant([
      toolPart({
        name: "get_unmet_requirements",
        state: "output-available",
        output: {
          kind: "onboarding_prompt",
          href: "/onboarding",
          reason: "no_degree",
          needsOnboarding: true,
          programs: [],
        },
      }),
    ]);
    expect(onboardingArtifacts(message)).toEqual([
      { kind: "onboarding_prompt", href: "/onboarding", reason: "no_degree" },
    ]);
    expect(turnBlocks(message).map((block) => block.kind)).toEqual(["onboarding"]);
    expect(suggestedFollowUps(message)).not.toContain("What's the fastest way to finish?");
  });
});
