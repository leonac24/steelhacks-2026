import { describe, expect, it } from "vitest";

import {
  APPROVAL_WINDOW_MS,
  checkConfirmable,
  formatClockForSpeech,
  outcomeForTier,
  outcomeForTimeout,
  parseChange,
  permissionFor,
  summarizeChange,
  type CurrentState,
} from "./change-rules";

const current: CurrentState = { budgets: { groceries: 25_000 }, safetyBufferCents: 10_000 };
const now = new Date("2026-09-19T15:00:00Z");

describe("parseChange", () => {
  it("normalizes budget categories", () => {
    expect(
      parseChange("budget_update", { category: " Groceries ", monthlyLimitCents: 30_000 }).payload,
    ).toEqual({ category: "groceries", monthlyLimitCents: 30_000 });
  });

  it.each([
    ["budget_update", { category: "groceries", monthlyLimitCents: 300.5 }],
    ["budget_update", { category: "groceries", monthlyLimitCents: -1 }],
    ["quiet_hours_update", { start: "8pm", end: "09:00" }],
    ["alert_rule_toggle", { type: "everything", enabled: false }],
    ["trusted_contact_update", { name: "Sam", phoneE164: "412-555-0100", relationship: "son" }],
  ] as const)("rejects bad %s payloads", (changeType, payload) => {
    expect(() => parseChange(changeType, payload)).toThrow();
  });
});

describe("permissionFor", () => {
  const judge = (changeType: Parameters<typeof parseChange>[0], payload: unknown) =>
    permissionFor(parseChange(changeType, payload), current);

  it("treats raising a budget as an increase and lowering as a decrease", () => {
    expect(judge("budget_update", { category: "groceries", monthlyLimitCents: 30_000 })).toBe(
      "budget_increase",
    );
    expect(judge("budget_update", { category: "groceries", monthlyLimitCents: 20_000 })).toBe(
      "budget_decrease",
    );
  });

  it("treats a brand-new budget as an increase", () => {
    expect(judge("budget_update", { category: "travel", monthlyLimitCents: 5_000 })).toBe(
      "budget_increase",
    );
  });

  it("splits alert toggles by direction", () => {
    expect(judge("alert_rule_toggle", { type: "unusual_txn", enabled: true })).toBe("alert_enable");
    expect(judge("alert_rule_toggle", { type: "unusual_txn", enabled: false })).toBe(
      "alert_disable",
    );
  });

  it("splits safety buffer changes by direction", () => {
    expect(judge("safety_buffer_update", { safetyBufferCents: 5_000 })).toBe(
      "safety_buffer_decrease",
    );
    expect(judge("safety_buffer_update", { safetyBufferCents: 15_000 })).toBe(
      "safety_buffer_increase",
    );
  });
});

describe("summarizeChange", () => {
  const say = (changeType: Parameters<typeof parseChange>[0], payload: unknown) =>
    summarizeChange(parseChange(changeType, payload), current);

  it("reads budget changes in plain words", () => {
    expect(say("budget_update", { category: "groceries", monthlyLimitCents: 30_000 })).toBe(
      "Raise the groceries budget from two hundred fifty dollars to three hundred dollars a month.",
    );
    expect(say("budget_update", { category: "travel", monthlyLimitCents: 5_000 })).toBe(
      "Set a travel budget of fifty dollars a month.",
    );
  });

  it("reads quiet hours and alert toggles", () => {
    expect(say("quiet_hours_update", { start: "21:00", end: "08:30" })).toBe(
      "Don't call between 9 PM and 8:30 AM.",
    );
    expect(say("alert_rule_toggle", { type: "unusual_txn", enabled: false })).toBe(
      "Turn off calls about unusual charges.",
    );
  });
});

describe("formatClockForSpeech", () => {
  it.each([
    ["00:00", "12 AM"],
    ["09:30", "9:30 AM"],
    ["12:00", "12 PM"],
    ["20:05", "8:05 PM"],
  ])("%s → %s", (time, spoken) => {
    expect(formatClockForSpeech(time)).toBe(spoken);
  });
});

describe("checkConfirmable", () => {
  const request = {
    status: "proposed",
    confirmationExpiresAt: new Date(now.getTime() + 60_000),
    sourceCallSessionId: "call-1",
  };

  it("accepts a fresh proposal from the same call", () => {
    expect(checkConfirmable(request, "call-1", now)).toBeNull();
  });

  it("rejects missing, handled, expired, and cross-call confirmations", () => {
    expect(checkConfirmable(undefined, "call-1", now)).toBe("not_found");
    expect(checkConfirmable({ ...request, status: "applied" }, "call-1", now)).toBe(
      "already_handled",
    );
    expect(checkConfirmable({ ...request, confirmationExpiresAt: now }, "call-1", now)).toBe(
      "expired",
    );
    expect(checkConfirmable(request, "call-2", now)).toBe("wrong_call");
    expect(checkConfirmable(request, null, now)).toBe("wrong_call");
  });
});

describe("outcomeForTier", () => {
  it("applies instant changes quietly and instant_notify ones loudly", () => {
    expect(outcomeForTier("instant", now)).toEqual({ status: "applied", notifyCaretaker: false });
    expect(outcomeForTier("instant_notify", now)).toEqual({
      status: "applied",
      notifyCaretaker: true,
    });
  });

  it("holds needs_approval changes for 24 hours", () => {
    expect(outcomeForTier("needs_approval", now)).toEqual({
      status: "awaiting_approval",
      approvalDeadline: new Date(now.getTime() + APPROVAL_WINDOW_MS),
    });
  });

  it("fails safe when no permission is configured", () => {
    expect(outcomeForTier(undefined, now).status).toBe("awaiting_approval");
  });
});

describe("outcomeForTimeout", () => {
  it("applies only when configured to, otherwise expires", () => {
    expect(outcomeForTimeout("apply")).toBe("applied");
    expect(outcomeForTimeout("expire")).toBe("expired");
    expect(outcomeForTimeout(undefined)).toBe("expired");
  });
});
