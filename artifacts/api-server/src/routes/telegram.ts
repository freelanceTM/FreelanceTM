import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { consumeLinkToken } from "../lib/telegram";

const router: IRouter = Router();

// ─── TELEGRAM BOT WEBHOOK ─────────────────────────────────────────────────────
// Register this URL with BotFather:
//   POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://YOUR_DOMAIN/api/telegram/webhook
//
// When a user sends /start TOKEN to the bot, Telegram calls this endpoint.
// We consume the token, look up the user, and save their chat_id.

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  const update = req.body as {
    message?: {
      chat?: { id: number };
      text?: string;
      from?: { id: number; username?: string };
    };
  };

  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = msg?.text ?? "";

  // Handle /start <token>
  if (chatId && text.startsWith("/start ")) {
    const token = text.slice(7).trim();
    if (token) {
      const userId = consumeLinkToken(token);
      if (userId) {
        await db
          .update(usersTable)
          .set({ telegramChatId: String(chatId) })
          .where(eq(usersTable.id, userId));
      }
    }
  }

  // Always respond 200 to Telegram immediately
  res.json({ ok: true });
});

export default router;
