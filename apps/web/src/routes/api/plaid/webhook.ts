import * as activity from "@steelhacks-2026/api/services/activity";
import { bankConnection } from "@steelhacks-2026/db/schema/index";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { bankProvider, db } from "../../../services";

// https://plaid.com/docs/api/webhooks/webhook-verification/
const webhookSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string(),
});

export const Route = createFileRoute("/api/plaid/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // TODO: verify the Plaid-Verification JWT header (see PLAID_WEBHOOK_SECRET
        // in .env.schema) before trusting the body. Skipped for the hackathon demo.
        const parsed = webhookSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad Request", { status: 400 });
        const { webhook_type, webhook_code, item_id } = parsed.data;
        console.log(`plaid webhook: ${webhook_type}/${webhook_code} item=${item_id}`);

        // We only handle transaction updates today; item errors / SYNC_UPDATES
        // for other products would go here too.
        if (webhook_type === "TRANSACTIONS") {
          const connection = await db.query.bankConnection.findFirst({
            where: eq(bankConnection.providerItemId, item_id),
          });
          if (connection) {
            const result = await bankProvider.syncTransactions(connection.memberId);
            await activity.log(db, {
              memberId: connection.memberId,
              type: "bank_synced",
              summaryText: `Bank synced: ${result.added.length} new, ${result.modified} updated`,
              metadata: {
                webhookCode: webhook_code,
                added: result.added.length,
                modified: result.modified,
                removed: result.removed,
              },
            });
            // TODO(alerts service): alerts.evaluate(connection.memberId) once it exists,
            // so a new transaction can trigger a shortfall/unusual-txn call.
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
