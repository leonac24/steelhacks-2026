import { describe, expect, it } from "vitest";

import { normalizePhoneE164 } from "./phone";

describe("normalizePhoneE164", () => {
  it.each([
    ["+1 (412) 555-0142", "+14125550142"],
    ["(412) 555-0142", "+14125550142"],
    ["4125550142", "+14125550142"],
    ["14125550142", "+14125550142"],
    ["+14125550142", "+14125550142"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalizes %s to %s", (raw, expected) => {
    expect(normalizePhoneE164(raw)).toBe(expected);
  });

  it.each([
    "",
    "not a number",
    "12345", // too short
    "5550142", // 7 digits
    "1234567890123456", // 16 digits
    "412555014", // 9 digits
  ])("returns null for hopeless input %j", (raw) => {
    expect(normalizePhoneE164(raw)).toBeNull();
  });
});