// Pure input rules for onboarding a member. The service does the writes.

// Caretakers type phone numbers however they like; the DB stores E.164.
// US/Canada numbers may omit the country code.
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!hasPlus && digits.length === 10) return `+1${digits}`;
  if (!hasPlus && digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // "+4125550142" is a 10-digit US number typed with a stray plus, but it's
  // also a valid Swiss number. Too dangerous to guess: we'd dial Switzerland.
  if (hasPlus && digits.length === 10) {
    throw new Error(`"${input}" is missing a country code. Try +1 412 555 0142.`);
  }
  if (hasPlus && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  throw new Error(`"${input}" isn't a phone number we can dial. Try +1 412 555 0142.`);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Used when a caretaker gives a full name but no preferred name.
export function defaultPreferredName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  if (!first) throw new Error("A name is required");
  return first;
}

export class PhoneInUseError extends Error {
  constructor(phoneE164: string) {
    super(`${phoneE164} already belongs to another member`);
    this.name = "PhoneInUseError";
  }
}

export class NoAccountForEmailError extends Error {
  constructor(email: string) {
    super(`No account found for ${email}. Have them sign up in the app first.`);
    this.name = "NoAccountForEmailError";
  }
}

export class LoginAlreadyLinkedError extends Error {
  constructor(email: string) {
    super(`${email} is already linked to a member`);
    this.name = "LoginAlreadyLinkedError";
  }
}
