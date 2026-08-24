/**
 * Configuration reporting for the Resend transport.
 *
 * The send path itself is exercised through `sweep.test.ts`, which stubs this
 * module. What is *not* covered there — and is the thing an operator actually
 * reads at 3 a.m. — is which of the two required variables is missing. There
 * are two ways to provision this credential and they fail differently:
 * `vercel integration add resend/resend-email` sets `RESEND_API_KEY` and
 * nothing else, while a hand-pasted key from resend.com usually arrives with
 * someone remembering to set the sender too. The first path lands in
 * `from_address`, which is the state that looks configured and sends nothing.
 */
import { afterEach, describe, expect, it } from "vitest";

import { describeEmailConfigGap, emailConfigGap, isEmailConfigured } from "./resend";

const KEY = "RESEND_API_KEY";
const FROM = "ALERT_FROM_EMAIL";

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const original = { key: process.env[KEY], from: process.env[FROM] };

afterEach(() => {
  setEnv(KEY, original.key);
  setEnv(FROM, original.from);
});

describe("emailConfigGap", () => {
  it("names neither half when both are present", () => {
    setEnv(KEY, "re_test_key");
    setEnv(FROM, "alerts@example.test");
    expect(emailConfigGap()).toBeNull();
    expect(isEmailConfigured()).toBe(true);
  });

  it("reports from_address when only the key is set", () => {
    // The shape the Vercel Marketplace integration leaves behind.
    setEnv(KEY, "re_test_key");
    setEnv(FROM, undefined);
    expect(emailConfigGap()).toBe("from_address");
    expect(isEmailConfigured()).toBe(false);
  });

  it("reports api_key when only the sender is set", () => {
    setEnv(KEY, undefined);
    setEnv(FROM, "alerts@example.test");
    expect(emailConfigGap()).toBe("api_key");
  });

  it("reports both when neither is set", () => {
    setEnv(KEY, undefined);
    setEnv(FROM, undefined);
    expect(emailConfigGap()).toBe("both");
  });

  it("treats an empty string as unset, since that is what a cleared env var looks like", () => {
    setEnv(KEY, "");
    setEnv(FROM, "alerts@example.test");
    expect(emailConfigGap()).toBe("api_key");
  });
});

describe("describeEmailConfigGap", () => {
  it("names the variable to go set, not the concept", () => {
    // "email is not configured" sends the reader to the docs; a variable name
    // sends them to the dashboard field that fixes it.
    expect(describeEmailConfigGap("api_key")).toContain(KEY);
    expect(describeEmailConfigGap("from_address")).toContain(FROM);
    const both = describeEmailConfigGap("both");
    expect(both).toContain(KEY);
    expect(both).toContain(FROM);
  });
});
