# FreelanceTM API (NestJS)

Полноценный backend для платформы FreelanceTM: NestJS + PostgreSQL + Prisma + Socket.IO + TON escrow + AI.

## 🚀 Быстрый старт

### 1. Запуск PostgreSQL (Docker)

```bash
cd api
docker-compose up -d
```

### 2. Установка зависимостей

```bash
npm install
# или
pnpm install
```

### 3. Настройка окружения

```bash
cp .env.example .env
# Отредактируй .env — добавь GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, JWT_SECRET
```

### 4. Применение миграций и seed

```bash
npx prisma migrate dev --name init
npx prisma db seed
npx prisma generate
```

### 5. Запуск dev-сервера

```bash
npm run start:dev
```

API будет доступен на `http://localhost:3000/api`
Swagger Docs: `http://localhost:3000/docs`

## 📦 Архитектура

```
src/
  auth/          Telegram Mini App auth + JWT + refresh sessions
  users/         Профили, onboarding, KYC
  gigs/          CRUD услуг, поиск, фильтрация
  orders/        Заказы + статусная машина
  messages/      WebSocket чаты по заказам (Socket.IO)
  wallets/       Кастодиальные TON-кошельки (AES-шифрование)
  escrow/        Эскроу-логика (задел под TON смарт-контракт)
  ai/            Gemini AI ассистент + генератор ТЗ
  admin/         Верификация платежей TM CELL, арбитраж споров, KYC
  prisma/        PrismaService
  common/        Guards, interceptors, decorators, utils (crypto, telegram)
```

## 🔐 Безопасность

- JWT access/refresh токены с ротацией (хранятся как hash в БД)
- AES-256-GCM шифрование мнемоник и приватных ключей кошельков
- Rate limiting (Throttler) на все endpoints
- Helmet + CORS + ValidationPipe
- XSS защита через whitelist dto

## 💰 TON Escrow (Фаза 2 задел)

- При создании заказа — `EscrowService.createEscrow()` создаёт запись + placeholder escrow адрес
- При завершении — `releaseEscrow()` переводит средства
- При споре — `refundEscrow()` возвращает средства
- Все операции логируются в таблице `transactions`
- Таблица `ton_events` готова для индексатора блокчейна

## 🤖 AI

`POST /api/ai/chat` — Gemini Flash с системным промптом платформы.

## 📱 TM CELL Пополнение

1. Пользователь создаёт `Payment` со скриншотом (загрузка через `/uploads`)
2. Админ одобряет в `/api/admin/payments/:id/approve`
3. Баланс пользователя обновляется (внутренний учёт в `transactions`)

## ⚖️ Арбитраж

- `POST /api/orders/:id/status` → `disputed` (инициация спора)
- Админ разрешает в `/api/admin/disputes/:id/resolve` с resolution:
  - `buyer_wins` — возврат
  - `seller_wins` — выплата
  - `split` — частичная выплата

## 🧪 Тестирование

```bash
npm run test
```

## 🛠 Деплой

```bash
npm run build
npm run start:prod
```

Используйте `DATABASE_URL` с production PostgreSQL и обязательно смените `JWT_SECRET` + `MASTER_ENCRYPTION_KEY`.
