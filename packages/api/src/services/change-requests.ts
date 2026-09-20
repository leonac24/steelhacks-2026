// Voice changes are two-step: propose (never applies) → confirm after a clear
// yes. Confirm then applies, applies + notifies, or waits for the caretaker,
// depending on the member's permission tier.
import type { Database } from "@steelhacks-2026/db";
import {
  alertRule,
  budget,
  changeRequest,
  memberSettings,
  permission,
} from "@steelhacks-2026/db/schema/index";
import { and, eq, lt } from "drizzle-orm";

import * as activity from "./activity";
import {
  CONFIRMATION_TTL_MS,
  checkConfirmable,
  outcomeForTier,
  outcomeForTimeout,
  parseChange,
  permissionFor,
  summarizeChange,
  type ChangeType,
  type ConfirmRejection,
  type CurrentState,
  type ParsedChange,
  type PermissionChangeType,
} from "./change-rules";
import { notifyCaretakers } from "./notify";

type ChangeRequestRow = typeof changeRequest.$inferSelect;

async function loadCurrentState(db: Database, memberId: string): Promise<CurrentState> {
  const [budgets, settings] = await Promise.all([
    db.select().from(budget).where(eq(budget.memberId, memberId)),
    db.query.memberSettings.findFirst({ where: eq(memberSettings.memberId, memberId) }),
  ]);
  return {
    budgets: Object.fromEntries(budgets.map((b) => [b.category, b.monthlyLimitCents])),
    safetyBufferCents: settings?.safetyBufferCents ?? 0,
  };
}

async function tierFor(db: Database, memberId: string, key: PermissionChangeType) {
  return db.query.permission.findFirst({
    where: and(eq(permission.memberId, memberId), eq(permission.changeType, key)),
  });
}

// Writes the change itself. Every branch is an idempotent "set".
async function applyChange(db: Database, memberId: string, change: ParsedChange) {
  switch (change.changeType) {
    case "budget_update":
      await db
        .insert(budget)
        .values({ memberId, ...change.payload })
        .onConflictDoUpdate({
          target: [budget.memberId, budget.category],
          set: { monthlyLimitCents: change.payload.monthlyLimitCents },
        });
      return;
    case "reminder_mode_update":
      await db
        .update(memberSettings)
        .set({ reminderMode: change.payload.reminderMode })
        .where(eq(memberSettings.memberId, memberId));
      return;
    case "quiet_hours_update":
      await db
        .update(memberSettings)
        .set({ quietHoursStart: change.payload.start, quietHoursEnd: change.payload.end })
        .where(eq(memberSettings.memberId, memberId));
      return;
    case "alert_rule_toggle":
      await db
        .insert(alertRule)
        .values({ memberId, type: change.payload.type, enabled: change.payload.enabled })
        .onConflictDoUpdate({
          target: [alertRule.memberId, alertRule.type],
          set: { enabled: change.payload.enabled },
        });
      return;
    case "safety_buffer_update":
      await db
        .update(memberSettings)
        .set({ safetyBufferCents: change.payload.safetyBufferCents })
        .where(eq(memberSettings.memberId, memberId));
      return;
  }
}

function parseStored(request: ChangeRequestRow): ParsedChange {
  return parseChange(request.changeType, request.payload);
}

// Moves a request from one status to another only if it's still in `from`,
// so two concurrent confirms/approvals can't both win.
async function transition(
  db: Database,
  id: string,
  from: ChangeRequestRow["status"],
  set: Partial<typeof changeRequest.$inferInsert>,
) {
  const [row] = await db
    .update(changeRequest)
    .set(set)
    .where(and(eq(changeRequest.id, id), eq(changeRequest.status, from)))
    .returning();
  return row;
}

export type ProposeInput = {
  memberId: string;
  changeType: ChangeType;
  payload: unknown;
  callSessionId: string | null;
  now?: Date;
};

// Validates and stores a proposal. Never applies anything.
export async function propose(db: Database, input: ProposeInput) {
  const now = input.now ?? new Date();
  const change = parseChange(input.changeType, input.payload);
  const current = await loadCurrentState(db, input.memberId);
  const summaryText = summarizeChange(change, current);

  const [row] = await db
    .insert(changeRequest)
    .values({
      memberId: input.memberId,
      changeType: change.changeType,
      permissionChangeType: permissionFor(change, current),
      payload: change.payload,
      summaryText,
      status: "proposed",
      confirmationId: crypto.randomUUID(),
      confirmationExpiresAt: new Date(now.getTime() + CONFIRMATION_TTL_MS),
      sourceCallSessionId: input.callSessionId,
    })
    .returning();
  if (!row) throw new Error("Failed to store change request");

  await activity.log(db, {
    memberId: input.memberId,
    type: "change_proposed",
    summaryText: `Proposed: ${summaryText}`,
    metadata: { changeRequestId: row.id },
    visibleToCaretaker: false,
  });
  return { confirmationId: row.confirmationId, summaryText };
}

export type ConfirmResult =
  | { ok: true; status: "applied" | "awaiting_approval"; summaryText: string }
  | { ok: false; reason: ConfirmRejection };

export async function confirm(
  db: Database,
  input: { confirmationId: string; callSessionId: string | null; now?: Date },
): Promise<ConfirmResult> {
  const now = input.now ?? new Date();
  const request = await db.query.changeRequest.findFirst({
    where: eq(changeRequest.confirmationId, input.confirmationId),
  });
  const rejection = checkConfirmable(request, input.callSessionId, now);
  if (rejection || !request) return { ok: false, reason: rejection ?? "not_found" };

  const perm = await tierFor(db, request.memberId, request.permissionChangeType);
  const outcome = outcomeForTier(perm?.tier, now);
  const { memberId, summaryText } = request;

  if (outcome.status === "awaiting_approval") {
    const claimed = await transition(db, request.id, "proposed", {
      status: "awaiting_approval",
      approvalDeadline: outcome.approvalDeadline,
    });
    if (!claimed) return { ok: false, reason: "already_handled" };
    await activity.log(db, {
      memberId,
      type: "change_awaiting_approval",
      summaryText: `Needs your approval: ${summaryText}`,
      metadata: { changeRequestId: request.id },
    });
    await notifyCaretakers(db, memberId, `Approval needed: ${summaryText}`);
    return { ok: true, status: "awaiting_approval", summaryText };
  }

  const claimed = await transition(db, request.id, "proposed", { status: "applied" });
  if (!claimed) return { ok: false, reason: "already_handled" };
  try {
    await applyChange(db, memberId, parseStored(request));
  } catch (error) {
    // neon-http has no transactions; put it back so the member can retry.
    await transition(db, request.id, "applied", { status: "proposed" });
    throw error;
  }
  await activity.log(db, {
    memberId,
    type: "change_applied",
    summaryText: `Changed by phone: ${summaryText}`,
    metadata: { changeRequestId: request.id },
  });
  if (outcome.notifyCaretaker) {
    await notifyCaretakers(db, memberId, `Changed by phone: ${summaryText}`);
  }
  return { ok: true, status: "applied", summaryText };
}

// Caller must already have checked the user is a primary caretaker of the member.
export async function approve(
  db: Database,
  input: { changeRequestId: string; decidedByUserId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const row = await transition(db, input.changeRequestId, "awaiting_approval", {
    status: "applied",
    decidedByUserId: input.decidedByUserId,
    decidedAt: now,
  });
  if (!row) return null;
  await applyChange(db, row.memberId, parseStored(row));
  await activity.log(db, {
    memberId: row.memberId,
    type: "change_approved",
    summaryText: `Approved: ${row.summaryText}`,
    metadata: { changeRequestId: row.id, decidedByUserId: input.decidedByUserId },
  });
  return row;
}

export async function reject(
  db: Database,
  input: { changeRequestId: string; decidedByUserId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const row = await transition(db, input.changeRequestId, "awaiting_approval", {
    status: "rejected",
    decidedByUserId: input.decidedByUserId,
    decidedAt: now,
  });
  if (!row) return null;
  await activity.log(db, {
    memberId: row.memberId,
    type: "change_rejected",
    summaryText: `Declined: ${row.summaryText}`,
    metadata: { changeRequestId: row.id, decidedByUserId: input.decidedByUserId },
  });
  return row;
}

// Run on a schedule: settles approvals past their deadline per `onTimeout`,
// and expires proposals nobody confirmed.
export async function processTimeouts(db: Database, now: Date = new Date()) {
  const overdue = await db
    .select()
    .from(changeRequest)
    .where(
      and(eq(changeRequest.status, "awaiting_approval"), lt(changeRequest.approvalDeadline, now)),
    );

  let applied = 0;
  let expired = 0;
  for (const request of overdue) {
    const perm = await tierFor(db, request.memberId, request.permissionChangeType);
    const status = outcomeForTimeout(perm?.onTimeout);
    const row = await transition(db, request.id, "awaiting_approval", { status, decidedAt: now });
    if (!row) continue;

    if (status === "applied") {
      await applyChange(db, row.memberId, parseStored(row));
      applied++;
    } else {
      expired++;
    }
    await activity.log(db, {
      memberId: row.memberId,
      type: status === "applied" ? "change_applied" : "change_expired",
      summaryText:
        status === "applied"
          ? `Applied after no response: ${row.summaryText}`
          : `Expired without approval: ${row.summaryText}`,
      metadata: { changeRequestId: row.id },
    });
  }

  const staleProposals = await db
    .update(changeRequest)
    .set({ status: "expired" })
    .where(and(eq(changeRequest.status, "proposed"), lt(changeRequest.confirmationExpiresAt, now)))
    .returning({ id: changeRequest.id });

  return { applied, expired, staleProposals: staleProposals.length };
}
