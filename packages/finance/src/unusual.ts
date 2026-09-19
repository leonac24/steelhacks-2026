export type TxnLike = {
  // Positive = money out, matching the transaction table.
  amountCents: number;
  merchantName: string | null;
};

export type UnusualReason = "large_amount" | "new_merchant" | "gift_card_like";

export type UnusualResult = {
  unusual: boolean;
  reasons: UnusualReason[];
};

export type UnusualOptions = {
  // Nothing below this is ever "large".
  largeFloorCents?: number;
  // "Large" means this many times the typical (median) purchase.
  largeMultiplier?: number;
  // New merchants alone only matter above this amount; small new shops are normal.
  newMerchantMinCents?: number;
};

const DEFAULTS: Required<UnusualOptions> = {
  largeFloorCents: 10_000,
  largeMultiplier: 3,
  newMerchantMinCents: 5_000,
};

// Payment methods scammers ask for: gift cards, wires, crypto, cash transfer.
const GIFT_CARD_LIKE =
  /gift\s*card|giftcard|google\s*play|itunes|apple\.com\/bill|app\s*store|steam|vanilla|green\s*dot|moneygram|western\s*union|bitcoin|btc\s*atm|crypto|coinbase|wire\s*transfer/i;

// "GIANT-EAGLE #123" and "Giant Eagle" are the same merchant: drop punctuation
// and store numbers.
export function normalizeMerchant(name: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word && !/^\d+$/.test(word))
    .join(" ");
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

// Flags an outgoing transaction that's large for this member, from a merchant
// they've never paid, or to a gift-card/wire style merchant. Incoming money is
// never unusual. `history` should not include `txn` itself.
export function isUnusualTransaction(
  txn: TxnLike,
  history: TxnLike[],
  options: UnusualOptions = {},
): UnusualResult {
  const opts = { ...DEFAULTS, ...options };
  if (txn.amountCents <= 0) return { unusual: false, reasons: [] };

  const outflows = history.filter((t) => t.amountCents > 0);
  const merchant = normalizeMerchant(txn.merchantName);
  const sameMerchant = outflows.filter((t) => normalizeMerchant(t.merchantName) === merchant);
  const reasons: UnusualReason[] = [];

  if (GIFT_CARD_LIKE.test(txn.merchantName ?? "")) reasons.push("gift_card_like");

  // A usual bill (e.g. rent) at its usual size isn't large, even if it dwarfs groceries.
  const largestAtMerchant = Math.max(0, ...sameMerchant.map((t) => t.amountCents));
  const typical = median(outflows.map((t) => t.amountCents));
  const isLarge =
    txn.amountCents >= opts.largeFloorCents &&
    txn.amountCents > typical * opts.largeMultiplier &&
    txn.amountCents > largestAtMerchant * 1.5;
  if (isLarge) reasons.push("large_amount");

  const isNewMerchant = merchant !== "" && sameMerchant.length === 0 && outflows.length > 0;
  if (isNewMerchant && txn.amountCents >= opts.newMerchantMinCents) reasons.push("new_merchant");

  return { unusual: reasons.length > 0, reasons };
}
