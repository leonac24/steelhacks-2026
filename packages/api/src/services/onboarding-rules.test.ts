import { describe, expect, it } from "vitest";

import { defaultPreferredName, isValidTimezone, normalizePhone } from "./onboarding-rules";

describe("normalizePhone", () => {
  it.each([
    ["4125550142", "+14125550142"],
    ["(412) 555-0142", "+14125550142"],
    ["412-555-0142", "+14125550142"],
    ["1 412 555 0142", "+14125550142"],
    ["+1 412 555 0142", "+14125550142"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["555-0142", "", "not a phone", "+0 412 555 0142"])("rejects %s", (input) => {
    expect(() => normalizePhone(input)).toThrow();
  });

  it("refuses a plus with no country code rather than dialing Switzerland", () => {
    expect(() => normalizePhone("+412 555 0142")).toThrow(/country code/);
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA names and rejects anything else", () => {
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Eastern")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("defaultPreferredName", () => {
  it("uses the first name", () => {
    expect(defaultPreferredName("Dorothy Alvarez")).toBe("Dorothy");
    expect(defaultPreferredName("  Dot  ")).toBe("Dot");
  });

  it("needs something to work with", () => {
    expect(() => defaultPreferredName("   ")).toThrow();
  });
});
