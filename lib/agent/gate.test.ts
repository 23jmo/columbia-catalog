/**
 * The rule that a signed-out student costs nothing.
 *
 * This is the spec's line, quoted: "Signed-out students get zero LLM calls.
 * The box accepts input; submitting shows the sign-in wall. The model is never
 * invoked." The route enforces it with a 401, and these tests cover the half
 * the route cannot: that the request is never sent in the first place.
 */

import { describe, expect, it } from "vitest";

import { describeFailure, planSubmission } from "./gate";

describe("planning a submission", () => {
  it("never sends for a signed-out student", () => {
    const plan = planSubmission({
      text: "What should I take next term?",
      isSignedIn: false,
      isBusy: false,
    });
    expect(plan.action).toBe("gate");
  });

  it("keeps the signed-out student's question so signing in does not cost them it", () => {
    const plan = planSubmission({ text: "  what about mornings  ", isSignedIn: false, isBusy: false });
    expect(plan).toEqual({
      action: "gate",
      gate: { kind: "signed-out" },
      keepInBox: "what about mornings",
    });
  });

  it("sends a signed-in student's question, trimmed", () => {
    expect(planSubmission({ text: "  hello  ", isSignedIn: true, isBusy: false })).toEqual({
      action: "send",
      text: "hello",
    });
  });

  it("ignores an empty box rather than showing a wall for whitespace", () => {
    expect(planSubmission({ text: "   \n ", isSignedIn: false, isBusy: false })).toEqual({
      action: "ignore",
    });
    expect(planSubmission({ text: "", isSignedIn: true, isBusy: false })).toEqual({
      action: "ignore",
    });
  });

  it("ignores a second question while one is still streaming", () => {
    // The budget is spent before the stream starts, so this would not be free.
    expect(planSubmission({ text: "and mornings?", isSignedIn: true, isBusy: true })).toEqual({
      action: "ignore",
    });
  });

  it("checks the session before the stream, so a busy signed-out box still walls", () => {
    const plan = planSubmission({ text: "anything", isSignedIn: false, isBusy: true });
    expect(plan.action).not.toBe("send");
  });
});

describe("describing a failure", () => {
  it("reads 401 as the wall", () => {
    expect(describeFailure(401, { error: "Sign in first.", signInRequired: true })).toEqual({
      kind: "signed-out",
    });
  });

  it("keeps the reset time off a 429 so the student knows when to come back", () => {
    expect(
      describeFailure(429, {
        error: "You've used all 20 questions for now.",
        used: 20,
        limit: 20,
        resetsAt: "2026-08-24T20:20:11.000Z",
      }),
    ).toEqual({
      kind: "budget",
      message: "You've used all 20 questions for now.",
      resetsAt: "2026-08-24T20:20:11.000Z",
    });
  });

  it("does not confuse a spent budget with a sign-in wall", () => {
    // Both are refusals with nothing to read; only one is fixed by signing in.
    expect(describeFailure(429, { error: "out" }).kind).toBe("budget");
  });

  it("carries the 503's named variable through to the owner", () => {
    const gate = describeFailure(503, {
      error: "The assistant isn't configured on this deployment yet.",
      configurationProblem: "No model credential. Set OPENAI_API_KEY, or …",
    });
    expect(gate).toMatchObject({
      kind: "config",
      detail: "No model credential. Set OPENAI_API_KEY, or …",
    });
  });

  it("falls back to a sentence when the body is not JSON at all", () => {
    const gate = describeFailure(500, null);
    expect(gate.kind).toBe("failed");
    expect(gate).toHaveProperty("message");
    expect((gate as { message: string }).message.length).toBeGreaterThan(0);
  });

  it("ignores a resetsAt that is not a string rather than rendering it", () => {
    expect(describeFailure(429, { error: "out", resetsAt: 1_724_500_000 })).toEqual({
      kind: "budget",
      message: "out",
      resetsAt: null,
    });
  });
});
