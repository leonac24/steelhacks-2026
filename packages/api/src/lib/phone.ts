/** "+1 (412) 555-0142", "14125550142", "4125550142" → "+14125550142"; returns null if hopeless. */
export function normalizePhoneE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  // Already international (has a leading "+"): keep it as long as it's a valid length.
  if (raw.trim().startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // US 10-digit local number.
  if (digits.length === 10) return `+1${digits}`;

  // US 11-digit with country code.
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;

  return null;
}