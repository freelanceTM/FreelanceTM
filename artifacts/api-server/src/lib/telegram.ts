import https from "https";

const BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
export const BOT_NAME = process.env["TELEGRAM_BOT_NAME"] ?? "FreelanceTMbot";

// ─── NOTIFICATION HELPER ──────────────────────────────────────────────────────

export async function sendTelegramNotification(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return; // silently skip if bot not configured

  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume(); // drain response
        resolve();
      },
    );
    req.on("error", () => resolve()); // never throw — notifications are best-effort
    req.write(body);
    req.end();
  });
}

// ─── LINKING TOKEN STORE ──────────────────────────────────────────────────────
// Stores one-time tokens used to link a Telegram account to a user.
// Token → { userId, expiry }  — 15-minute TTL, cleaned up lazily.

const linkTokens = new Map<string, { userId: number; expiry: number }>();

export function createLinkToken(userId: number): string {
  // Invalidate any existing token for this user first
  for (const [tok, val] of linkTokens) {
    if (val.userId === userId) linkTokens.delete(tok);
  }

  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  linkTokens.set(token, { userId, expiry: Date.now() + 15 * 60 * 1000 });
  return token;
}

export function consumeLinkToken(token: string): number | null {
  const entry = linkTokens.get(token);
  if (!entry) return null;
  linkTokens.delete(token);
  if (Date.now() > entry.expiry) return null;
  return entry.userId;
}
