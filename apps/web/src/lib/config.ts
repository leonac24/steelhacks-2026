// Client-visible settings for the two interfaces.
import { ENV } from "@/env";

// E.164; falls back to a placeholder if SUPPORT_PHONE isn't set (e.g. a
// fresh local checkout with no .env yet) so the simplified view still renders.
export const SUPPORT_PHONE = ENV.SUPPORT_PHONE ?? "+14125550100";

/** How the number is shown on screen, formatted from SUPPORT_PHONE. */
export const SUPPORT_PHONE_DISPLAY = formatUsPhoneDisplay(SUPPORT_PHONE);

function formatUsPhoneDisplay(e164: string): string {
  const digits = e164.replace(/^\+1/, "");
  const match = /^(\d{3})(\d{3})(\d{4})$/.exec(digits);
  if (!match) return e164;
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}
