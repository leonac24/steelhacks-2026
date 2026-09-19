import { defineConfig } from "drizzle-kit";
import "varlock/auto-load";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Schema changes must use Neon's direct (unpooled) connection.
    url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || "",
  },
});
