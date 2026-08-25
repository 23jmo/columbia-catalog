import { describe, expect, it } from "vitest";

import { messagesFromRows } from "./conversation";

describe("messagesFromRows", () => {
  it("rebuilds UIMessages from stored parts", () => {
    const messages = messagesFromRows([
      {
        message_id: "m1",
        role: "user",
        content: "What about mornings?",
        parts: [{ type: "text", text: "What about mornings?" }],
      },
    ]);
    expect(messages).toEqual([
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "What about mornings?" }],
      },
    ]);
  });

  it("falls back to content when parts were never stored", () => {
    const [message] = messagesFromRows([
      { message_id: "m2", role: "assistant", content: "Take COMS W3134.", parts: [] },
    ]);
    expect(message.parts).toEqual([{ type: "text", text: "Take COMS W3134." }]);
  });
});
