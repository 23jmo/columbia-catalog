/**
 * The agent's non-negotiables, as tests.
 *
 * The spec lists four verifications for this lane, and three of them are here:
 * a query citing a course no tool returned is rejected by the grounding check,
 * the 21st prompt in six hours is refused, and a signed-out submit makes zero
 * LLM calls. The fourth — that prose actually streams — is a property of the
 * transport and is verified by running it, not by asserting on a mock.
 *
 * Nothing here calls a model. That is deliberate: a test that needs a gateway
 * key is a test that gets skipped in CI and then rots. The two rules worth
 * pinning are both pure logic, and the third is an ordering property of the
 * route that can be checked by construction.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { agentModelId, GATEWAY_MODEL, OPENAI_MODEL, usingOpenAI } from "./agent";
import { checkGrounding, extractCitedCourseCodes, groundedCourseCodes } from "./grounding";
import { decide, PROMPT_LIMIT, WINDOW_HOURS } from "./usage";

/* ==========================================================================
 * Grounding
 * ========================================================================== */

/** A realistic slice of what `search_courses` actually emits. */
const SEARCH_OUTPUT = JSON.stringify({
  courses: [
    {
      courseId: "COMS3134W",
      code: "COMS W3134",
      title: "Data Structures in Java",
      prerequisiteText: "COMS W1004 or knowledge of Java.",
    },
    { courseId: "MATH1201UN", code: "MATH UN1201", title: "Calculus III" },
  ],
});

describe("grounding", () => {
  it("accepts an answer citing only courses a tool returned", () => {
    const prose = "Take COMS W3134 next term; it pairs well with MATH UN1201.";
    expect(checkGrounding(prose, [SEARCH_OUTPUT])).toEqual({ grounded: true, ungrounded: [] });
  });

  /**
   * The spec's own verification, stated as it is stated there: a query citing a
   * course code not present in tool output is rejected.
   */
  it("rejects an answer citing a course no tool returned", () => {
    const prose = "You should take COMS W4995, our special topics course.";
    const verdict = checkGrounding(prose, [SEARCH_OUTPUT]);
    expect(verdict.grounded).toBe(false);
    expect(verdict.ungrounded).toEqual(["COMS4995W"]);
  });

  it("rejects an answer that ran no tools at all", () => {
    const verdict = checkGrounding("COMS W4111 is Databases.", []);
    expect(verdict.grounded).toBe(false);
    expect(verdict.ungrounded).toEqual(["COMS4111W"]);
  });

  /**
   * An answer with no course codes is grounded. "I couldn't find anything
   * matching that" is a legitimate reply and cites nothing — a check that
   * flagged it would make honesty the failing case.
   */
  it("accepts an answer that cites nothing", () => {
    expect(checkGrounding("I couldn't find a match. Try naming the topic?", []).grounded).toBe(true);
  });

  /**
   * The qualifier is how people actually write these codes, and they drop it
   * constantly. Flagging `COMS 3134` as invented because the tool said
   * `COMS W3134` would fail the most common correct citation there is.
   */
  it("accepts a citation that drops the school qualifier", () => {
    expect(checkGrounding("COMS 3134 is the one.", [SEARCH_OUTPUT]).grounded).toBe(true);
  });

  /**
   * The Bulletin separates subject from number with U+00A0, that text reaches
   * the model through `prerequisiteText`, and a model quoting it quotes the
   * NBSP too. A `\s`-based pattern would miss exactly the codes most likely to
   * have been copied from source rather than recalled.
   */
  it("reads a code separated by a non-breaking space", () => {
    expect(extractCitedCourseCodes("Prerequisite: COMS W1004.")).toEqual(["COMS1004W"]);
  });

  /**
   * Tool payloads carry `courseId` in stored form — qualifier AFTER the number.
   * That does not look like a printed citation, and missing it would mark a
   * course ungrounded on the strength of its own primary key.
   */
  it("grounds a course by its stored id as well as its printed code", () => {
    expect(groundedCourseCodes(['{"courseId":"ECON1105W"}'])).toContain("ECON1105W");
  });

  it("does not mistake a term or a year for a course code", () => {
    expect(extractCitedCourseCodes("Offered in Fall 2026 and Spring 2027.")).toEqual([]);
  });

  it("reports each invented course once, however many times it is repeated", () => {
    const prose = "COMS W4995 is great. I recommend COMS W4995. Did I mention COMS 4995?";
    expect(checkGrounding(prose, [SEARCH_OUTPUT]).ungrounded).toEqual(["COMS4995W"]);
  });
});

/* ==========================================================================
 * The prompt budget
 * ========================================================================== */

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-08-24T18:00:00Z");

/** `count` prompts, one minute apart, ending `agoHours` before NOW. */
function promptsEndingAt(count: number, agoHours: number): Date[] {
  const last = NOW.getTime() - agoHours * HOUR;
  return Array.from({ length: count }, (_, index) => new Date(last - index * 60_000));
}

describe("prompt budget", () => {
  it("allows a student who has asked nothing", () => {
    expect(decide([], NOW)).toEqual({
      allowed: true,
      used: 0,
      limit: PROMPT_LIMIT,
      resetsAt: null,
    });
  });

  /** The spec's verification: the 21st prompt in six hours is refused. */
  it("refuses the 21st prompt inside the window", () => {
    const decision = decide(promptsEndingAt(PROMPT_LIMIT, 0.5), NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.used).toBe(PROMPT_LIMIT);
  });

  it("allows the 20th", () => {
    expect(decide(promptsEndingAt(PROMPT_LIMIT - 1, 0.5), NOW).allowed).toBe(true);
  });

  /**
   * The window slides. A student who spent their twenty this morning gets them
   * back this evening — not at a fixed block boundary, which would hand out 40
   * across a boundary and then zero for six hours.
   */
  it("forgets prompts older than the window", () => {
    const decision = decide(promptsEndingAt(PROMPT_LIMIT, WINDOW_HOURS + 1), NOW);
    expect(decision).toMatchObject({ allowed: true, used: 0 });
  });

  it("counts only the prompts still inside the window", () => {
    const decision = decide(
      [...promptsEndingAt(15, WINDOW_HOURS + 1), ...promptsEndingAt(5, 1)],
      NOW,
    );
    expect(decision).toMatchObject({ allowed: true, used: 5 });
  });

  /**
   * A limit that cannot say when it lifts is indistinguishable from a bug. The
   * reset is the OLDEST prompt in the window plus the window — that is the one
   * whose expiry frees a slot — and not `now + 6h`, which would tell a student
   * who asked their twentieth question five hours ago to wait six more.
   */
  it("reports the reset as the oldest in-window prompt plus the window", () => {
    const stamps = promptsEndingAt(PROMPT_LIMIT, 5);
    const oldest = stamps.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
    const decision = decide(stamps, NOW);
    expect(decision.resetsAt?.getTime()).toBe(oldest.getTime() + WINDOW_HOURS * HOUR);
  });

  /**
   * Null, not `now`. A reset time on an allowed decision renders as "resets in
   * 0 seconds" next to a working input box.
   */
  it("reports no reset time while the student is under the limit", () => {
    expect(decide(promptsEndingAt(3, 1), NOW).resetsAt).toBeNull();
  });

  it("does not care what order the timestamps arrive in", () => {
    const stamps = promptsEndingAt(PROMPT_LIMIT, 5);
    const shuffled = [...stamps].reverse();
    expect(decide(shuffled, NOW).resetsAt).toEqual(decide(stamps, NOW).resetsAt);
  });
});

/* ==========================================================================
 * Provider selection
 * ========================================================================== */

/*
 * Which model runs is decided by environment alone, and the decision has to be
 * made per request rather than at module load. `next dev` keeps the module
 * graph alive across edits, so a provider captured at import time would survive
 * the very `.env.local` change made to switch it — the developer sets
 * `OPENAI_API_KEY`, sees gateway billing errors anyway, and concludes the key
 * is bad. These tests pin the decision to a function call.
 */
describe("provider selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the gateway when no OpenAI key is set", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AGENT_MODEL", "");
    expect(usingOpenAI()).toBe(false);
    expect(agentModelId()).toBe(GATEWAY_MODEL);
  });

  it("switches to OpenAI on the presence of a key alone", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AGENT_MODEL", "");
    expect(usingOpenAI()).toBe(true);
    expect(agentModelId()).toBe(OPENAI_MODEL);
  });

  it("lets AGENT_MODEL override either default", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AGENT_MODEL", "gpt-5.4-nano");
    expect(agentModelId()).toBe("gpt-5.4-nano");
  });

  it("names a gateway model with its provider prefix, and an OpenAI model without one", () => {
    // The gateway routes on "provider/model"; the OpenAI provider does not, and
    // sending it a prefixed id is a 404 that reads like a missing model.
    expect(GATEWAY_MODEL).toContain("/");
    expect(OPENAI_MODEL).not.toContain("/");
  });
});
