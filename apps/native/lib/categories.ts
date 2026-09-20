import type { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

type CategoryMeta = { label: string; icon: IconName };

// Matches the free-form `category` strings seeded/stored on `transaction` and
// `budget` (see apps/web/scripts/seed.ts). Unknown categories fall back to OTHER.
const CATEGORIES: Record<string, CategoryMeta> = {
  housing: { label: "Housing", icon: "home" },
  phone: { label: "Phone", icon: "call" },
  utilities: { label: "Utilities", icon: "flash" },
  groceries: { label: "Groceries", icon: "cart" },
  pharmacy: { label: "Pharmacy", icon: "medkit" },
  dining: { label: "Dining", icon: "restaurant" },
  income: { label: "Income", icon: "cash" },
};

const OTHER: CategoryMeta = { label: "Other", icon: "ellipsis-horizontal" };

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORIES[category] ?? OTHER;
}

export function categoryLabel(category: string): string {
  return categoryMeta(category).label;
}

export const KNOWN_CATEGORIES = Object.keys(CATEGORIES);
