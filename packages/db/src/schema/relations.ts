import { relations } from "drizzle-orm";

import { activityLog, alertSent, callSession, changeRequest } from "./activity";
import { user } from "./auth";
import { bankAccount, bankConnection, recurringStream, transaction } from "./banking";
import { caretakerLink, member } from "./member";
import { alertRule, budget, memberSettings, permission } from "./settings";

export const memberRelations = relations(member, ({ one, many }) => ({
  user: one(user, { fields: [member.userId], references: [user.id] }),
  settings: one(memberSettings),
  caretakerLinks: many(caretakerLink),
  bankConnections: many(bankConnection),
  bankAccounts: many(bankAccount),
  transactions: many(transaction),
  recurringStreams: many(recurringStream),
  budgets: many(budget),
  alertRules: many(alertRule),
  permissions: many(permission),
  changeRequests: many(changeRequest),
  activity: many(activityLog),
  alertsSent: many(alertSent),
  callSessions: many(callSession),
}));

export const caretakerLinkRelations = relations(caretakerLink, ({ one }) => ({
  caretaker: one(user, { fields: [caretakerLink.caretakerUserId], references: [user.id] }),
  member: one(member, { fields: [caretakerLink.memberId], references: [member.id] }),
}));

export const bankConnectionRelations = relations(bankConnection, ({ one, many }) => ({
  member: one(member, { fields: [bankConnection.memberId], references: [member.id] }),
  accounts: many(bankAccount),
}));

export const bankAccountRelations = relations(bankAccount, ({ one, many }) => ({
  member: one(member, { fields: [bankAccount.memberId], references: [member.id] }),
  connection: one(bankConnection, {
    fields: [bankAccount.bankConnectionId],
    references: [bankConnection.id],
  }),
  transactions: many(transaction),
}));

export const transactionRelations = relations(transaction, ({ one }) => ({
  member: one(member, { fields: [transaction.memberId], references: [member.id] }),
  bankAccount: one(bankAccount, {
    fields: [transaction.bankAccountId],
    references: [bankAccount.id],
  }),
}));

export const recurringStreamRelations = relations(recurringStream, ({ one }) => ({
  member: one(member, { fields: [recurringStream.memberId], references: [member.id] }),
}));

export const budgetRelations = relations(budget, ({ one }) => ({
  member: one(member, { fields: [budget.memberId], references: [member.id] }),
}));

export const memberSettingsRelations = relations(memberSettings, ({ one }) => ({
  member: one(member, { fields: [memberSettings.memberId], references: [member.id] }),
}));

export const alertRuleRelations = relations(alertRule, ({ one }) => ({
  member: one(member, { fields: [alertRule.memberId], references: [member.id] }),
}));

export const permissionRelations = relations(permission, ({ one }) => ({
  member: one(member, { fields: [permission.memberId], references: [member.id] }),
}));

export const changeRequestRelations = relations(changeRequest, ({ one }) => ({
  member: one(member, { fields: [changeRequest.memberId], references: [member.id] }),
  sourceCallSession: one(callSession, {
    fields: [changeRequest.sourceCallSessionId],
    references: [callSession.id],
  }),
  decidedBy: one(user, { fields: [changeRequest.decidedByUserId], references: [user.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  member: one(member, { fields: [activityLog.memberId], references: [member.id] }),
}));

export const alertSentRelations = relations(alertSent, ({ one }) => ({
  member: one(member, { fields: [alertSent.memberId], references: [member.id] }),
  callSession: one(callSession, {
    fields: [alertSent.callSessionId],
    references: [callSession.id],
  }),
}));

export const callSessionRelations = relations(callSession, ({ one, many }) => ({
  member: one(member, { fields: [callSession.memberId], references: [member.id] }),
  changeRequests: many(changeRequest),
}));
