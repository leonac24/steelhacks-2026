import { approvalsRouter } from "./approvals";
import { bankRouter } from "./bank";
import { insightsRouter } from "./insights";
import { activityRouter, membersRouter } from "./members";
import { notificationsRouter } from "./notifications";
import { plaidRouter } from "./plaid";
import {
  alertRulesRouter,
  budgetsRouter,
  permissionsRouter,
  settingsRouter,
  trustedContactsRouter,
} from "./settings";
import { transactionsRouter } from "./transactions";

export const caretakerRouter = {
  members: membersRouter,
  activity: activityRouter,
  approvals: approvalsRouter,
  settings: settingsRouter,
  budgets: budgetsRouter,
  permissions: permissionsRouter,
  alertRules: alertRulesRouter,
  trustedContacts: trustedContactsRouter,
  plaid: plaidRouter,
  transactions: transactionsRouter,
  insights: insightsRouter,
  bank: bankRouter,
  notifications: notificationsRouter,
};
