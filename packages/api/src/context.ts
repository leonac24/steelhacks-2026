import type { Session } from "@steelhacks-2026/auth";
import type { Database } from "@steelhacks-2026/db";

import type { BankProviderKind } from "./providers";
import type { ElevenLabsCallEnv } from "./services/outbound-calls";

export type Context = {
  session: Session | null;
  db: Database;
  bankProvider: BankProviderKind;
  // Gates the dev.* procedures that power the live demo.
  devToolsEnabled: boolean;
  // Optional: present only when the ElevenLabs env vars are configured. The
  // dev.* alert tools and cron endpoints use it to place real outbound calls.
  elevenLabsEnv?: ElevenLabsCallEnv;
};
