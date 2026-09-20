import type { Database } from "@steelhacks-2026/db";
import { caretakerLink, member, user } from "@steelhacks-2026/db/schema/index";
import { eq } from "drizzle-orm";

import { sendNotificationEmail } from "./mailer";

// Tell a member's caretakers something happened. The activity feed already
// shows it; this is the push on top (email now, SMS later).
export async function notifyCaretakers(db: Database, memberId: string, message: string) {
  const [target, links] = await Promise.all([
    db.query.member.findFirst({ where: eq(member.id, memberId) }),
    db
      .select({ email: user.email })
      .from(caretakerLink)
      .innerJoin(user, eq(user.id, caretakerLink.caretakerUserId))
      .where(eq(caretakerLink.memberId, memberId)),
  ]);

  const name = target?.preferredName ?? "your member";
  console.log(`[notify] member=${memberId}: ${message}`);
  try {
    await sendNotificationEmail({
      to: links.map((l) => l.email),
      subject: `Update about ${name}`,
      text: message,
    });
  } catch (error) {
    // Whatever triggered this notification (a change request, an alert)
    // already succeeded; an SMTP hiccup shouldn't unwind it.
    console.error(`[notify] email failed for member=${memberId}:`, error);
  }
}
