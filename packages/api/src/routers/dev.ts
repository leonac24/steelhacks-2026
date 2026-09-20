// Buttons for the live demo. Only mounted when dev tools are enabled.
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { devProcedure, publicDevProcedure, requirePrimaryCaretaker } from "../index";
import { createBankProvider } from "../providers";
import { injectMockTransaction } from "../providers/mock";
import * as alerts from "../services/alerts";
import * as changeRequests from "../services/change-requests";
import { connectDemoBank } from "../services/demo-bank";
import { runBudgetCheck, runFraudCheck } from "../services/notifications";
import * as onboarding from "../services/onboarding";

// A handful of plausible nesters for the "simulate new user" shortcut — just
// enough variety that repeat demos don't all look identical.
const DEMO_NESTERS = [
  { fullName: "Eleanor Chen", preferredName: "Ellie" },
  { fullName: "Walter Nguyen", preferredName: "Walt" },
  { fullName: "Rosa Delgado", preferredName: "Rosa" },
  { fullName: "Harold Jackson", preferredName: "Harold" },
] as const;

function randomDemoPhone(): string {
  const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  return `+1555${digits}`;
}

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function checkAfterNewTransactions(
  db: Parameters<typeof runFraudCheck>[0],
  memberId: string,
  addedCount: number,
  source: string,
) {
  if (addedCount === 0) return;
  const [fraud, budgets] = await Promise.allSettled([
    runFraudCheck(db, memberId),
    runBudgetCheck(db, memberId),
  ]);
  if (fraud.status === "rejected") console.error(`${source}: fraud check failed`, fraud.reason);
  if (budgets.status === "rejected")
    console.error(`${source}: budget check failed`, budgets.reason);
}

export const devRouter = {
  // Mints a Plaid Sandbox item for a member so the demo has real data to
  // sync, without a Link UI. No-op error if BANK_PROVIDER isn't "plaid".
  plaidCreateSandboxItem: devProcedure
    .input(z.object({ memberId: z.string(), institutionId: z.string().optional() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      if (!context.createSandboxPlaidItem) {
        throw new ORPCError("BAD_REQUEST", { message: "Set BANK_PROVIDER=plaid to use this" });
      }
      const result = await context.createSandboxPlaidItem(input);
      // Pull balances right away so the caretaker dashboard has something to show.
      await createBankProvider(context.db, context.bankProvider).getAccounts(input.memberId);
      return result;
    }),

  // Syncs a member's transactions on demand, independent of whether a real
  // Plaid webhook has fired (sandbox webhooks can lag or need a tunnel).
  plaidSyncNow: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const result = await createBankProvider(context.db, context.bankProvider).syncTransactions(
        input.memberId,
      );
      await checkAfterNewTransactions(
        context.db,
        input.memberId,
        result.added.length,
        "dev.plaidSyncNow",
      );
      return result;
    }),

  // Simulates a new bank transaction, e.g. a $400 gift-card charge. Plaid mode
  // goes through the Sandbox API; mock mode inserts a row directly. Then runs
  // the alerts engine over what landed, which is the "June calls you" moment.
  injectTransaction: devProcedure
    .input(
      z.object({
        memberId: z.string(),
        // Positive = money out, negative = deposit.
        amountCents: z
          .number()
          .int()
          .refine((n) => n !== 0, "Amount can't be zero"),
        merchantName: z.string().min(1).max(80),
        category: z.string().min(1).max(40).default("other"),
        // Plaid Sandbox only accepts the present date or up to 14 days back.
        daysAgo: z.number().int().min(0).max(14).optional(),
      }),
    )
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const sync = context.injectPlaidTransaction
        ? await context.injectPlaidTransaction(input)
        : await injectMockTransaction(context.db, input);

      // Two independent notification channels off the same new transactions:
      // the rule-based alerts engine (may place a voice call), and Gemini
      // fraud + budget-pace checks (land on the caretaker's dashboard/email).
      const [dispatched] = await Promise.all([
        alerts.dispatch(context.db, input.memberId, {
          newTransactions: sync.added,
          elevenLabs: context.elevenLabs,
        }),
        checkAfterNewTransactions(
          context.db,
          input.memberId,
          sync.added.length,
          "dev.injectTransaction",
        ),
      ]);
      return { ...sync, ...dispatched };
    }),

  // Syncs the bank, then calls about anything worth calling about.
  runAlerts: devProcedure
    .input(z.object({ memberId: z.string() }))
    .use(requirePrimaryCaretaker)
    .handler(async ({ input, context }) => {
      const provider = createBankProvider(context.db, context.bankProvider);
      const sync = await provider.syncTransactions(input.memberId);
      return alerts.dispatch(context.db, input.memberId, {
        newTransactions: sync.added,
        elevenLabs: context.elevenLabs,
      });
    }),

  // Settles every overdue approval now instead of waiting for cron.
  processApprovals: devProcedure.handler(({ context }) =>
    changeRequests.processTimeouts(context.db),
  ),

  // Sign-in page onboarding shortcut: mints a brand-new steward account (no
  // session required to call this) with one nester already set up, and
  // optionally connects Demo Bank so there's real data to show right away.
  // No pre-seeded history is involved — this is the same path a real new
  // user would go through.
  simulateNewUser: publicDevProcedure
    .input(z.object({ connectDemoBank: z.boolean().default(false) }))
    .handler(async ({ input, context }) => {
      if (!context.createUser) {
        throw new ORPCError("BAD_REQUEST", {
          message: "User creation isn't wired up in this environment",
        });
      }
      const suffix = crypto.randomUUID().slice(0, 8);
      const email = `demo-${suffix}@nestegg.dev`;
      const password = "demo-password-123";
      const newUser = await context.createUser({ name: "New Steward", email, password });

      const nester = DEMO_NESTERS[Math.floor(Math.random() * DEMO_NESTERS.length)]!;
      const member = await onboarding.createMember(context.db, {
        caretakerUserId: newUser.id,
        fullName: nester.fullName,
        preferredName: nester.preferredName,
        phoneE164: randomDemoPhone(),
        pin: randomPin(),
        timezone: "America/New_York",
        consented: true,
      });

      let bankConnected = false;
      if (input.connectDemoBank) {
        try {
          await connectDemoBank(context, member.id);
          bankConnected = true;
        } catch (error) {
          console.error("simulateNewUser: failed to connect demo bank", error);
        }
      }

      return { email, password, memberId: member.id, bankConnected };
    }),
};
