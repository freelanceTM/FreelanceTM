import nodemailer from "nodemailer";
import { logger } from "./logger";

function createTransport() {
  const host = process.env["SMTP_HOST"];
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env["SMTP_PORT"] || "587"),
    secure: process.env["SMTP_SECURE"] === "true",
    auth: {
      user: process.env["SMTP_USER"] || "",
      pass: process.env["SMTP_PASS"] || "",
    },
  });
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const from = process.env["SMTP_FROM"] || "noreply@freelancetm.com";
  const subject = "Ваш код подтверждения FreelanceTM";
  const text = `Ваш код подтверждения для FreelanceTM: ${code}. Код действителен в течение 5 минут.`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f0f14; color: #fff; border-radius: 12px;">
      <div style="font-size: 28px; font-weight: bold; color: #6366f1; margin-bottom: 16px;">FreelanceTM</div>
      <p style="color: #a1a1aa; margin-bottom: 24px;">Ваш код подтверждения email:</p>
      <div style="font-size: 42px; font-weight: bold; letter-spacing: 10px; color: #6366f1; padding: 20px 0; text-align: center; background: rgba(99,102,241,0.1); border-radius: 8px;">
        ${code}
      </div>
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Код действителен в течение 5 минут.<br>Если вы не регистрировались на FreelanceTM — проигнорируйте это письмо.</p>
    </div>
  `;

  const transport = createTransport();
  if (!transport) {
    logger.info({ email, code }, "OTP (SMTP not configured — logging code)");
    return;
  }

  try {
    await transport.sendMail({ from, to: email, subject, text, html });
    logger.info({ email }, "OTP email sent");
  } catch (err) {
    logger.error({ err, email }, "Failed to send OTP email — logging code as fallback");
    logger.info({ email, code }, "OTP code fallback");
  }
}
