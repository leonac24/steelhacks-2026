// Sends caretaker notification emails over SMTP. Optional: with no SMTP env
// vars set, sendNotificationEmail is a no-op (logs and returns) so budget/
// fraud checks still work without email configured.
import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export type SendEmailInput = { to: string[]; subject: string; text: string };
export type SendEmailResult = { sent: boolean; reason?: string };

export async function sendNotificationEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (input.to.length === 0) return { sent: false, reason: "no recipients" };

  const client = getTransporter();
  if (!client) {
    console.warn("sendNotificationEmail: SMTP_HOST/SMTP_USER/SMTP_PASS not set, skipping email");
    return { sent: false, reason: "SMTP not configured" };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await client.sendMail({ from, to: input.to, subject: input.subject, text: input.text });
  return { sent: true };
}
