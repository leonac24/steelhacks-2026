import type { Database } from "@steelhacks-2026/db";
import { activityLog } from "@steelhacks-2026/db/schema/index";

export type ActivityEntry = typeof activityLog.$inferInsert;

// Every meaningful thing that happens to a member ends up here; the caretaker
// dashboard polls it.
export async function log(db: Database, entry: ActivityEntry) {
  const [row] = await db.insert(activityLog).values(entry).returning();
  return row;
}
