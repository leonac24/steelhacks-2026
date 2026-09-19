import type { Session } from "@steelhacks-2026/auth";
import type { Database } from "@steelhacks-2026/db";

import type { BankProviderKind } from "./providers";

export type Context = {
  session: Session | null;
  db: Database;
  bankProvider: BankProviderKind;
  // Gates the dev.* procedures that power the live demo.
  devToolsEnabled: boolean;
};
