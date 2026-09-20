import { describe, expect, it } from "vitest";

import {
  buildAffordExplanation,
  buildConfirmationRejection,
  buildShortfallWarning,
  dollarsToCents,
} from "./voice-tools";

describe("dollarsToCents", () => {
  it.each([
    [60, 6000],
    [0, 0],
    [0.5, 50],
    [60.5, 6050],
    [1.234, 123],
    [100000, 10_000_000],
  ])("converts %s dollars to %s cents", (dollars, cents) => {
    expect(dollarsToCents(dollars)).toBe(cents);
  });
});

describe("buildShortfallWarning", () => {
  it("names the next income and date", () => {
    expect(buildShortfallWarning(4_000, "Social Security", "2026-10-03")).toBe(
      "Heads up: you may be short about forty dollars before your next Social Security on 2026-10-03.",
    );
  });

  it("falls back to a generic deposit when income is unknown", () => {
    expect(buildShortfallWarning(9_500, null, null)).toBe(
      "Heads up: you may be short about ninety-five dollars before your next deposit.",
    );
  });
});

describe("buildAffordExplanation", () => {
  it("answers yes, tight, and no", () => {
    expect(buildAffordExplanation("yes", 12_000, "2026-10-03")).toBe(
      "Yes, you can afford that.",
    );
    expect(buildAffordExplanation("yes_but_tight", 5_000, "2026-10-03")).toBe(
      "Yes, but it'll be tight — it dips into your safety cushion.",
    );
    expect(buildAffordExplanation("no", -4_000, "2026-10-03")).toBe(
      "That won't fit — you'd be short about forty dollars before your next income on 2026-10-03.",
    );
  });

  it("omits the date when next income is unknown", () => {
    expect(buildAffordExplanation("no", -1200, null)).toBe(
      "That won't fit — you'd be short about twelve dollars before your next income.",
    );
  });
});

describe("buildConfirmationRejection", () => {
  it("maps each rejection to a speakable sentence", () => {
    expect(buildConfirmationRejection("expired")).toBe(
      "That confirmation timed out — let's start the change again.",
    );
    expect(buildConfirmationRejection("not_found")).toBe(
      "I couldn't find that request — let's start the change again.",
    );
    expect(buildConfirmationRejection("already_handled")).toBe(
      "That change was already handled.",
    );
    expect(buildConfirmationRejection("wrong_call")).toBe(
      "I can't confirm that change here — let's start it again.",
    );
  });
});