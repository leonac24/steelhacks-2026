import { describe, expect, it } from "vitest";

import { formatCentsForSpeech, numberToWords } from "./speech";

describe("formatCentsForSpeech", () => {
  it.each([
    [8_417, "about eighty-four dollars"],
    [8_450, "about eighty-five dollars"],
    [5_000, "fifty dollars"],
    [100, "one dollar"],
    [149, "about one dollar"],
    [45, "forty-five cents"],
    [1, "one cent"],
    [0, "zero cents"],
    [184_200, "one thousand eight hundred forty-two dollars"],
    [30_005, "about three hundred dollars"],
    [-2_500, "negative twenty-five dollars"],
  ])("%i → %s", (cents, spoken) => {
    expect(formatCentsForSpeech(cents)).toBe(spoken);
  });

  it("rejects fractional cents", () => {
    expect(() => formatCentsForSpeech(12.5)).toThrow();
  });
});

describe("numberToWords", () => {
  it.each([
    [7, "seven"],
    [15, "fifteen"],
    [40, "forty"],
    [105, "one hundred five"],
    [2_000_013, "two million thirteen"],
    [1_001_000, "one million one thousand"],
  ])("%i → %s", (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });
});
