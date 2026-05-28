import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI | null = null;

  private readonly SYSTEM_PROMPT = `Ты — ИИ-ассистент платформы FreelanceTM, первой цифровой фриланс-платформы Туркменистана.

ПРАВИЛА ПЛАТФОРМЫ:
- FreelanceTM соединяет заказчиков с цифровыми специалистами: Telegram-боты, TikTok-монтаж, дизайн, разработка, AI-сервисы
- Комиссия платформы: 0% на текущем этапе (MVP)
- Оплата защищена эскроу — деньги удерживаются до подтверждения работы
- Статусы заказа: pending → active → delivered → completed
- Споры решаются службой поддержки
- Все коммуникации должны вестись только через платформу
- Верифицированные продавцы (значок ✓) проверены вручную
- Уровни продавца: New → Rising → Top → Pro

КАТЕГОРИИ УСЛУГ НА ПЛАТФОРМЕ:
1. Telegram — каналы, боты, оформление
2. TikTok — монтаж, сценарии, продвижение
3. Design — логотипы, баннеры, брендинг
4. Development — сайты, приложения, автоматизация
5. AI Services — чат-боты, автоматизация с ИИ, генерация контента

ЯЗЫК: Отвечай на том же языке, на котором пишет пользователь (русский, туркменский или английский).
СТИЛЬ: Дружелюбный, профессиональный, лаконичный. Не более 3-4 абзацев в ответе.`;

  private readonly TZ_SYSTEM_PROMPT = `Ты — помощник по составлению технического задания (ТЗ) на платформе FreelanceTM.

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

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async chat(messages: Array<{ role: 'user' | 'assistant'; content: string }>, mode: 'general' | 'tz' = 'general') {
    if (!this.genAI) {
      throw new HttpException('AI service not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new HttpException('messages array required', HttpStatus.BAD_REQUEST);
    }

    const systemPrompt = mode === 'tz' ? this.TZ_SYSTEM_PROMPT : this.SYSTEM_PROMPT;
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const text = result.response.text();

    return { content: text };
  }
}
