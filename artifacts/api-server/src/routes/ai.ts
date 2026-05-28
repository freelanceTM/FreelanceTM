import { Router, type IRouter } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router: IRouter = Router();

const apiKey = process.env["GEMINI_API_KEY"];
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const SYSTEM_PROMPT = `Ты — ИИ-ассистент платформы FreelanceTM, первой цифровой фриланс-платформы Туркменистана.

ПРАВИЛА ПЛАТФОРМЫ:
- FreelanceTM соединяет заказчиков с цифровыми специалистами: Telegram-боты, TikTok-монтаж, дизайн, разработка, AI-сервисы
- Комиссия платформы: 0% на текущем этапе (MVP)
- Оплата защищена эскроу — деньги удерживаются до подтверждения работы
- Статусы заказа: pending (ожидает) → active (в работе) → delivered (сдан) → completed (завершён)
- Споры решаются службой поддержки
- Все коммуникации должны вестись только через платформу
- Верифицированные продавцы (значок ✓) проверены вручную
- Уровни продавца: New → Rising → Top → Pro

КАК ПОМОГАТЬ:
- Помогай заказчикам сформулировать задачу чётко
- Помогай фрилансерам описать свои услуги
- Объясняй правила платформы
- Давай советы по работе с цифровыми специалистами
- Рекомендуй категории услуг исходя из задачи пользователя
- Помогай составить техническое задание (ТЗ)

КАТЕГОРИИ УСЛУГ НА ПЛАТФОРМЕ:
1. Telegram — каналы, боты, оформление
2. TikTok — монтаж, сценарии, продвижение
3. Design — логотипы, баннеры, брендинг
4. Development — сайты, приложения, автоматизация
5. AI Services — чат-боты, автоматизация с ИИ, генерация контента

ЯЗЫК: Отвечай на том же языке, на котором пишет пользователь (русский, туркменский или английский).
СТИЛЬ: Дружелюбный, профессиональный, лаконичный. Не более 3-4 абзацев в ответе.`;

const TZ_SYSTEM_PROMPT = `Ты — помощник по составлению технического задания (ТЗ) на платформе FreelanceTM.

Твоя задача: за 3-4 вопроса собрать всю необходимую информацию и сгенерировать готовое ТЗ.

ФОРМАТ ИТОГОВОГО ТЗ:
---
**Задача:** [краткое описание]
**Что нужно сделать:**
- [пункт 1]
- [пункт 2]
**Требования к результату:** [что должно получиться]
**Сроки:** [если указаны]
**Дополнительно:** [примеры, ссылки, предпочтения]
---

Когда у тебя достаточно информации (после 2-4 вопросов), сгенерируй готовое ТЗ и добавь в конце: [ТЗ_ГОТОВО]

ЯЗЫК: Отвечай на языке пользователя. Будь лаконичным.`;

router.post("/ai/chat", async (req, res): Promise<void> => {
  if (!genAI) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  const { messages, mode } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    mode?: "general" | "tz";
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  try {
    const systemPrompt = mode === "tz" ? TZ_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const text = result.response.text();

    res.json({ content: text });
  } catch (err: unknown) {
    req.log?.error({ err }, "AI chat error");
    // Pass Gemini rate-limit as 429 so the client can show a friendly message
    const status = (err as { status?: number })?.status === 429 ? 429 : 500;
    const message = status === 429
      ? "Лимит запросов ИИ исчерпан. Попробуйте через минуту."
      : (err instanceof Error ? err.message : "AI error");
    res.status(status).json({ error: message });
  }
});

export default router;
