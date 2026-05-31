import { Router, type IRouter } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, gigsTable, usersTable, tendersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

// ─── EXISTING: General AI chat ─────────────────────────────────────────────

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
    const status = (err as { status?: number })?.status === 429 ? 429 : 500;
    const message =
      status === 429
        ? "Лимит запросов ИИ исчерпан. Попробуйте через минуту."
        : err instanceof Error
        ? err.message
        : "AI error";
    res.status(status).json({ error: message });
  }
});

// ─── NEW: Generate content (title / description / tags) ───────────────────

router.post("/ai/generate-content", async (req, res): Promise<void> => {
  const { category, title, description, type } = req.body as {
    category?: string;
    title?: string;
    description?: string;
    type?: "gig" | "tender";
  };

  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = `Generate a ${type === "tender" ? "project brief (tender)" : "freelance service listing (gig)"} for FreelanceTM — a digital freelance platform in Turkmenistan.
Category: ${category ?? "Development"}
${title ? `Existing title hint: ${title}` : ""}
${description ? `Existing description hint: ${description}` : ""}

Respond ONLY with valid JSON (no markdown code fences), format:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Rules:
- Title: action-oriented, 40-80 chars, in Russian, starts with a verb
- Description: 150-350 chars, professional tone, in Russian, sells the value
- Tags: 4-6 lowercase tags relevant to the service (mix Russian and English is ok)`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          title?: string;
          description?: string;
          tags?: string[];
        };
        if (parsed.title && parsed.description && Array.isArray(parsed.tags)) {
          res.json({ title: parsed.title, description: parsed.description, tags: parsed.tags });
          return;
        }
      }
    } catch (err) {
      req.log?.warn({ err }, "Gemini generate-content failed, using mock");
    }
  }

  // Smart mock fallback — keyed by category name
  const mocks: Record<
    string,
    { title: string; description: string; tags: string[] }
  > = {
    Telegram: {
      title: "Разработаю профессионального Telegram-бота для вашего бизнеса",
      description:
        "Создам Telegram-бота с нуля: приём заявок, авторассылка, интеграция с CRM. Современный UX, быстрое выполнение. Работаю на Python/Node.js. Поддержка после сдачи.",
      tags: ["telegram", "бот", "python", "автоматизация", "бизнес"],
    },
    TikTok: {
      title: "Смонтирую вирусный TikTok-ролик для вашего бренда",
      description:
        "Профессиональный монтаж с трендовыми эффектами, субтитрами и музыкой. Работаю с любым исходным материалом. Опыт 2+ года в SMM и видеоконтенте.",
      tags: ["tiktok", "монтаж", "видео", "reels", "smm"],
    },
    Design: {
      title: "Создам современный логотип и фирменный стиль",
      description:
        "Разработаю уникальный логотип с нуля. Предоставлю все форматы (SVG, PNG, PDF) и исходники. Неограниченные правки до утверждения. 5+ лет опыта в брендинге.",
      tags: ["дизайн", "логотип", "брендинг", "графика", "фирменный стиль"],
    },
    Development: {
      title: "Разработаю landing page или корпоративный сайт под ключ",
      description:
        "Современный адаптивный сайт на React/Next.js с SEO-оптимизацией. Быстрая загрузка, интеграция с аналитикой, форма обратной связи. Сдам в срок.",
      tags: ["разработка", "react", "сайт", "nextjs", "frontend"],
    },
    "AI Services": {
      title: "Настрою AI-ассистента и автоматизирую бизнес-процессы",
      description:
        "Интеграция ChatGPT/Gemini в ваш бизнес. Умные чат-боты, авторедакция контента, нейросетевая генерация. ROI-ориентированный подход.",
      tags: ["ai", "автоматизация", "chatgpt", "интеграция", "нейросеть"],
    },
  };

  const catKey = category
    ? Object.keys(mocks).find((k) => k.toLowerCase() === category.toLowerCase()) ?? "Development"
    : "Development";
  res.json(mocks[catKey] ?? mocks.Development);
});

// ─── NEW: Suggest price ───────────────────────────────────────────────────

router.post("/ai/suggest-price", async (req, res): Promise<void> => {
  const { category, level } = req.body as {
    category?: string;
    level?: string;
  };

  type PriceRange = { min: number; max: number; recommended: number };
  const priceTable: Record<string, Record<string, PriceRange>> = {
    Telegram: {
      New: { min: 15, max: 40, recommended: 25 },
      Rising: { min: 30, max: 80, recommended: 50 },
      Top: { min: 60, max: 150, recommended: 100 },
      Pro: { min: 100, max: 300, recommended: 180 },
    },
    TikTok: {
      New: { min: 10, max: 30, recommended: 20 },
      Rising: { min: 25, max: 60, recommended: 40 },
      Top: { min: 50, max: 120, recommended: 80 },
      Pro: { min: 80, max: 200, recommended: 130 },
    },
    Design: {
      New: { min: 10, max: 35, recommended: 20 },
      Rising: { min: 25, max: 70, recommended: 45 },
      Top: { min: 50, max: 150, recommended: 90 },
      Pro: { min: 100, max: 350, recommended: 200 },
    },
    Development: {
      New: { min: 30, max: 80, recommended: 50 },
      Rising: { min: 60, max: 150, recommended: 100 },
      Top: { min: 100, max: 300, recommended: 180 },
      Pro: { min: 200, max: 600, recommended: 350 },
    },
    "AI Services": {
      New: { min: 20, max: 60, recommended: 35 },
      Rising: { min: 50, max: 120, recommended: 80 },
      Top: { min: 100, max: 250, recommended: 160 },
      Pro: { min: 150, max: 500, recommended: 280 },
    },
  };

  const catKey = category
    ? Object.keys(priceTable).find((k) => k.toLowerCase() === category.toLowerCase()) ??
      "Development"
    : "Development";
  const catPrices = priceTable[catKey] ?? priceTable.Development;

  const normaliseLevel = (l: string) =>
    l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
  const levelKey = level ? normaliseLevel(level) : "New";
  const prices: PriceRange = catPrices[levelKey] ?? catPrices.New;

  res.json(prices);
});

// ─── NEW: Moderate content ────────────────────────────────────────────────

router.post("/ai/moderate", async (req, res): Promise<void> => {
  const { content } = req.body as { content?: string };
  if (!content || content.trim().length === 0) {
    res.json({ safe: true });
    return;
  }

  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const prompt = `You are a content moderator for FreelanceTM, a professional freelance marketplace in Turkmenistan.

Review this content:
"""
${content.slice(0, 1200)}
"""

Platform prohibits: illegal services, adult/explicit content, scams, hate speech, drug/weapon sales, harassment, spam, fake reviews.
Legitimate digital freelance services (Telegram bots, design, web development, video editing, AI tools, etc.) are ALWAYS safe.

Respond ONLY with valid JSON — no markdown, no extra text:
{"safe": true}  OR  {"safe": false, "reason": "<one sentence in Russian explaining the violation>"}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          safe?: boolean;
          reason?: string;
        };
        res.json({ safe: !!parsed.safe, reason: parsed.reason });
        return;
      }
    } catch (err) {
      req.log?.warn({ err }, "Gemini moderation failed, falling back to keyword check");
    }
  }

  // Keyword-based fallback
  const lower = content.toLowerCase();
  const blocklist = [
    "наркот",
    "оружи",
    "взрывч",
    "порно",
    "эскорт",
    "проститу",
    "фальш",
    "взлом счёт",
    "ddos",
    "спам-рассыл",
    "кардинг",
  ];
  const hit = blocklist.find((w) => lower.includes(w));
  if (hit) {
    res.json({
      safe: false,
      reason: "Контент нарушает правила платформы и не может быть опубликован",
    });
    return;
  }
  res.json({ safe: true });
});

// ─── NEW: Smart freelancer matching for a tender ──────────────────────────
// Returns top-5 freelancers whose gig tags best match the tender's skills/description.

router.get("/ai/match-freelancers/:tenderId", async (req, res): Promise<void> => {
  const tenderId = parseInt(req.params.tenderId, 10);
  if (isNaN(tenderId) || tenderId <= 0) {
    res.status(400).json({ error: "Invalid tender id" });
    return;
  }

  const [tender] = await db.select().from(tendersTable).where(eq(tendersTable.id, tenderId));
  if (!tender) {
    res.status(404).json({ error: "Tender not found" });
    return;
  }

  // Build keyword set from skills + description words (>3 chars)
  const tenderKeywords = new Set<string>([
    ...(tender.skills ?? []).map((s) => s.toLowerCase()),
    ...tender.description
      .toLowerCase()
      .split(/[\s,;.\-!?()[\]]+/)
      .filter((w) => w.length > 3),
    ...tender.title
      .toLowerCase()
      .split(/[\s,;.\-!?()[\]]+/)
      .filter((w) => w.length > 3),
  ]);

  // Fetch all gigs with their sellers (capped at 300 for performance)
  const gigs = await db
    .select({ gig: gigsTable, seller: usersTable })
    .from(gigsTable)
    .innerJoin(usersTable, eq(usersTable.id, gigsTable.sellerId))
    .limit(300);

  type SellerEntry = {
    score: number;
    seller: typeof usersTable.$inferSelect;
    tags: string[];
    gigTitles: string[];
  };
  const sellerMap = new Map<number, SellerEntry>();

  for (const { gig, seller } of gigs) {
    if (!sellerMap.has(seller.id)) {
      sellerMap.set(seller.id, { score: 0, seller, tags: [], gigTitles: [] });
    }
    const entry = sellerMap.get(seller.id)!;

    const gigWords = new Set<string>([
      ...(gig.tags ?? []).map((t) => t.toLowerCase()),
      ...gig.title
        .toLowerCase()
        .split(/[\s,;.\-!?()[\]]+/)
        .filter((w) => w.length > 3),
    ]);

    // Tag overlap score
    for (const kw of tenderKeywords) {
      for (const gw of gigWords) {
        if (gw === kw) {
          entry.score += 3; // exact match
        } else if (gw.includes(kw) || kw.includes(gw)) {
          entry.score += 1; // partial match
        }
      }
    }

    // Quality boosts
    entry.score += (gig.rating ?? 0) * 0.5;
    entry.score += Math.min((gig.reviewCount ?? 0) * 0.05, 1);

    entry.tags.push(...(gig.tags ?? []));
    entry.gigTitles.push(gig.title);
  }

  const results = Array.from(sellerMap.values())
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((e) => ({
      userId: e.seller.id,
      username: e.seller.username,
      displayName: (e.seller.displayName ?? e.seller.username) as string,
      avatarUrl: (e.seller.avatarUrl ?? null) as string | null,
      level: ((e.seller as Record<string, unknown>).level ?? null) as string | null,
      rating: ((e.seller as Record<string, unknown>).rating ?? null) as number | null,
      completedOrders: ((e.seller as Record<string, unknown>).completedOrders ?? null) as number | null,
      isVerified: ((e.seller as Record<string, unknown>).isVerified ?? false) as boolean,
      matchScore: Math.round(e.score * 10) / 10,
      tags: [...new Set(e.tags)].slice(0, 6),
      topGig: e.gigTitles[0] ?? null,
    }));

  res.json({ items: results });
});

export default router;
