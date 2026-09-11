import { describe, expect, it } from "vitest";

import {
  escapeIlike,
  isConversationId,
  relativeAge,
  SIDEBAR_THREAD_CAP,
  threadHref,
} from "./history-format";
import { toUIMessage } from "./conversation";

describe("relativeAge", () => {
  const now = Date.parse("2026-08-25T12:00:00.000Z");

  it("prints compact badges like the sidebar mock", () => {
    expect(relativeAge("2026-08-25T11:59:40.000Z", now)).toBe("now");
    expect(relativeAge("2026-08-25T11:26:00.000Z", now)).toBe("34m");
    expect(relativeAge("2026-08-25T07:00:00.000Z", now)).toBe("5h");
    expect(relativeAge("2026-08-24T18:00:00.000Z", now)).toBe("18h");
    expect(relativeAge("2026-08-23T12:00:00.000Z", now)).toBe("2d");
    expect(relativeAge("2026-08-11T12:00:00.000Z", now)).toBe("2w");
  });

  it("drops an unparseable stamp rather than printing Invalid Date", () => {
    expect(relativeAge("not-a-date", now)).toBe("");
  });
});

describe("escapeIlike", () => {
  it("treats wildcard characters as literals", () => {
    expect(escapeIlike("100%_off\\x")).toBe("100\\%\\_off\\\\x");
  });
});

describe("isConversationId", () => {
  it("accepts a uuid and rejects a path fragment", () => {
    expect(isConversationId("2c1a0f7e-9b4d-4c8a-a123-9f0e1d2c3b4a")).toBe(true);
    expect(isConversationId("../agent")).toBe(false);
    expect(isConversationId("")).toBe(false);
  });
});

describe("threadHref", () => {
  it("opens a thread as a query on the chat page", () => {
    // Not `/`. Home is the recommendation feed and does not read `?c=`, so a
    // thread link that pointed there would open a feed and lose the thread.
    expect(threadHref("2c1a0f7e-9b4d-4c8a-a123-9f0e1d2c3b4a")).toBe(
      "/chat?c=2c1a0f7e-9b4d-4c8a-a123-9f0e1d2c3b4a",
    );
  });
});

describe("toUIMessage", () => {
  it("prefers stored parts so reloaded cards stay cards", () => {
    const message = toUIMessage({
      message_id: "m1",
      role: "assistant",
      content: "Take COMS W3134.",
      parts: [{ type: "text", text: "Take COMS W3134." }],
    });
    expect(message).toEqual({
      id: "m1",
      role: "assistant",
      parts: [{ type: "text", text: "Take COMS W3134." }],
    });
  });

  it("falls back to content when parts are empty", () => {
    const message = toUIMessage({
      message_id: "m2",
      role: "user",
      content: "What should I take?",
      parts: [],
    });
    expect(message.parts).toEqual([{ type: "text", text: "What should I take?" }]);
  });
});

describe("sidebar cap", () => {
  it("keeps five recent threads in the rail", () => {
    expect(SIDEBAR_THREAD_CAP).toBe(5);
  });
});
