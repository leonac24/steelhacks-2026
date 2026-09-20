import { describe, expect, it, vi } from "vitest";

import { hashPin } from "../lib/pin";
import { verifySessionPin } from "./call-sessions";

// A minimal in-memory stand-in for the drizzle query builder surface
// verifySessionPin actually touches: one callSession row, one member row,
// and an update() that's a no-op for these tests (we only care whether the
// comparison itself succeeds).
function fakeDb(opts: { pin: string; verified?: boolean; pinAttempts?: number }) {
  return hashPin(opts.pin).then((pinHash) => {
    const session = {
      id: "session-1",
      memberId: "member-1",
      verified: opts.verified ?? false,
      pinAttempts: opts.pinAttempts ?? 0,
    };
    const member = { id: "member-1", preferredName: "Dot", pinHash };

    return {
      query: {
        callSession: { findFirst: vi.fn().mockResolvedValue(session) },
        member: { findFirst: vi.fn().mockResolvedValue(member) },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
      insert: vi.fn(),
    };
  });
}

describe("verifySessionPin", () => {
  it("accepts the PIN spoken with spaces between digits", async () => {
    const db = await fakeDb({ pin: "1234" });
    const result = await verifySessionPin(db as never, {
      conversationId: "conv1",
      pin: "1 2 3 4",
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts the PIN spoken with hyphens", async () => {
    const db = await fakeDb({ pin: "1234" });
    const result = await verifySessionPin(db as never, {
      conversationId: "conv1",
      pin: "1-2-3-4",
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts the PIN wrapped in extra words", async () => {
    const db = await fakeDb({ pin: "1234" });
    const result = await verifySessionPin(db as never, {
      conversationId: "conv1",
      pin: "it's 1234",
    });
    expect(result).toEqual({ ok: true });
  });

  it("still rejects an actually-wrong PIN", async () => {
    const db = await fakeDb({ pin: "1234" });
    const result = await verifySessionPin(db as never, {
      conversationId: "conv1",
      pin: "9 9 9 9",
    });
    expect(result).toMatchObject({ ok: false, reason: "wrong_pin" });
  });
});
