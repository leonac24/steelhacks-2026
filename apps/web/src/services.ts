import { createAuth } from "@steelhacks-2026/auth";
import { createDb } from "@steelhacks-2026/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
