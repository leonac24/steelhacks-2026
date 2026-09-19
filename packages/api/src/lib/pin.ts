import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPin(pin: string): Promise<string> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4-8 digits");
  return bcrypt.hash(pin, ROUNDS);
}

export function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return bcrypt.compare(pin, pinHash);
}
