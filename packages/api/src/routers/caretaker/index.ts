import { approvalsRouter } from "./approvals";
import { activityRouter, membersRouter } from "./members";
import { plaidRouter } from "./plaid";
import {
  alertRulesRouter,
  budgetsRouter,
  permissionsRouter,
  settingsRouter,
  trustedContactsRouter,
} from "./settings";

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
};
