// Shared between onboarding and the settings page — both let a steward pick
// an assistant voice and set alert recipients, one during first-time setup,
// the other any time after.
export type AssistantId = "Jay" | "Robin";
export const ASSISTANTS: { id: AssistantId; emoji: string; blurb: string; sound: string }[] = [
  {
    id: "Robin",
    emoji: "🐦‍🔥",
    blurb: "Warm and a little slower.",
    sound: "/sounds/robin.wav",
  },
  { id: "Jay", emoji: "🐦", blurb: "Bright and to the point.", sound: "/sounds/jay.wav" },
];

export type AlertType = "budget_reached" | "unusual_txn" | "deposit_arrived";
export const ALERT_ROWS: { type: AlertType; label: string; description: string }[] = [
  {
    type: "budget_reached",
    label: "Budget reached",
    description: "A category budget is over, or on pace to go over.",
  },
  {
    type: "unusual_txn",
    label: "Potential fraud",
    description: "A charge that doesn't look like the usual pattern.",
  },
  {
    type: "deposit_arrived",
    label: "New significant deposit",
    description: "A deposit large enough to be worth flagging.",
  },
];

export type Recipients = Record<AlertType, { steward: boolean; nester: boolean }>;
export const DEFAULT_RECIPIENTS: Recipients = {
  budget_reached: { steward: true, nester: false },
  unusual_txn: { steward: true, nester: true },
  deposit_arrived: { steward: true, nester: true },
};
