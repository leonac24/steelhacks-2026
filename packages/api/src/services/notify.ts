import type { Database } from "@steelhacks-2026/db";
import { caretakerLink } from "@steelhacks-2026/db/schema/index";
import { eq } from "drizzle-orm";

// Tell a member's caretakers something happened. The activity feed already
// shows it; this is the push on top.
export async function notifyCaretakers(db: Database, memberId: string, message: string) {
  const links = await db
    .select({ caretakerUserId: caretakerLink.caretakerUserId })
    .from(caretakerLink)
    .where(eq(caretakerLink.memberId, memberId));

  // TODO: send email or SMS to each caretaker. Logged only for now.
  for (const link of links) {
    console.log(`[notify] caretaker=${link.caretakerUserId} member=${memberId}: ${message}`);
  }
}
