// Authorization lives here instead of database RLS. Every procedure that
// touches a member's data goes through one of these checks.
import { ORPCError } from "@orpc/server";
import type { Database } from "@steelhacks-2026/db";
import { caretakerLink, member } from "@steelhacks-2026/db/schema/index";
import { and, eq } from "drizzle-orm";

export type CaretakerRole = (typeof caretakerLink.$inferSelect)["role"];

// Viewers can read; only a primary caretaker can change settings or decide approvals.
export async function requireCaretakerOf(
  db: Database,
  userId: string,
  memberId: string,
  role: CaretakerRole = "viewer",
) {
  const link = await db.query.caretakerLink.findFirst({
    where: and(eq(caretakerLink.caretakerUserId, userId), eq(caretakerLink.memberId, memberId)),
  });
  // Same error whether the member doesn't exist or isn't theirs, so IDs can't be probed.
  if (!link) throw new ORPCError("FORBIDDEN", { message: "Not a caretaker of this member" });
  if (role === "primary" && link.role !== "primary") {
    throw new ORPCError("FORBIDDEN", { message: "Only the primary caretaker can do this" });
  }
  return link;
}

// The member profile belonging to the signed-in user (native app).
export async function requireSelfMember(db: Database, userId: string) {
  const self = await db.query.member.findFirst({ where: eq(member.userId, userId) });
  if (!self) throw new ORPCError("FORBIDDEN", { message: "No member profile for this user" });
  return self;
}
