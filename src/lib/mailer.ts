import "server-only";

import nodemailer, { Transporter } from "nodemailer";

interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface MailDispatchResult {
  delivered: boolean;
  messageId: string | null;
}

declare global {
  var _smtpTransporter: Transporter | undefined;
}

function getFromAddress(): string | null {
  const fromAddress = process.env.EMAIL_FROM?.trim();
  return fromAddress ? fromAddress : null;
}

export function isMailerConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();
  const fromAddress = getFromAddress();
  return Boolean(host && port && fromAddress);
}

function parseSecureFlag(): boolean {
  return process.env.SMTP_SECURE?.trim().toLowerCase() === "true";
}

function getTransporter(): Transporter | null {
  if (!isMailerConfigured()) {
    return null;
  }

  if (!global._smtpTransporter) {
    const host = process.env.SMTP_HOST!.trim();
    const port = Number(process.env.SMTP_PORT);
    const secure = parseSecureFlag();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    global._smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  return global._smtpTransporter;
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
): Promise<MailDispatchResult> {
  const fromAddress = getFromAddress();
  const transporter = getTransporter();

  if (!fromAddress || !transporter) {
    console.info("[mail-fallback] Email provider not configured.");
    console.info(`[mail-fallback] To: ${email.to}`);
    console.info(`[mail-fallback] Subject: ${email.subject}`);
    console.info(`[mail-fallback] Body:\n${email.text}`);
    return {
      delivered: false,
      messageId: null,
    };
  }

  const info = await transporter.sendMail({
    from: fromAddress,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return {
    delivered: true,
    messageId: info.messageId || null,
  };
}
