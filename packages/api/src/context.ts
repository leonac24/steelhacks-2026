import type { Session } from "@steelhacks-2026/auth";
import type { Database } from "@steelhacks-2026/db";

export type Context = {
  session: Session | null;
  db: Database;
};
