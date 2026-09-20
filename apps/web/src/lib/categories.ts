import {
  CircleDollarSign,
  Home,
  type LucideIcon,
  MoreHorizontal,
  Phone,
  Pill,
  ShoppingCart,
  UtensilsCrossed,
  Zap,
} from "lucide-react";

type CategoryMeta = { label: string; icon: LucideIcon; chart: 1 | 2 | 3 | 4 | 5 };

// Matches the free-form `category` strings seeded/stored on `transaction` and
// `budget` (see apps/web/scripts/seed.ts). Unknown categories fall back to OTHER.
const CATEGORIES: Record<string, CategoryMeta> = {
  housing: { label: "Housing", icon: Home, chart: 1 },
  phone: { label: "Phone", icon: Phone, chart: 2 },
  utilities: { label: "Utilities", icon: Zap, chart: 3 },
  groceries: { label: "Groceries", icon: ShoppingCart, chart: 4 },
  pharmacy: { label: "Pharmacy", icon: Pill, chart: 5 },
  dining: { label: "Dining", icon: UtensilsCrossed, chart: 1 },
  income: { label: "Income", icon: CircleDollarSign, chart: 2 },
};

const OTHER: CategoryMeta = { label: "Other", icon: MoreHorizontal, chart: 3 };

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORIES[category] ?? OTHER;
}

export function categoryLabel(category: string): string {
  return categoryMeta(category).label;
}

export const KNOWN_CATEGORIES = Object.keys(CATEGORIES);
