# FreelanceEscrow — TACT смарт-контракт

TON escrow-контракт для платформы FreelanceTM, смоделированный по аналогии с **Kwork**.

## 🏗 Архитектура (модель Kwork)

```
Покупатель создаёт заказ → платит TON в escrow
              ↓
Продавец принимает → работа начинается (ACTIVE)
              ↓
Продавец сдаёт работу → статус DELIVERED
              ↓
Покупатель ПРИНИМАЕТ → TON уходят продавцу (COMPLETED)
Покупатель МОЛЧИТ 3 дня → авто-приём (AUTO-COMPLETE)
Покупатель ОТКРЫВАЕТ СПОР → арбитраж админа
```

## 📦 Структура

| Файл | Назначение |
|---|---|
| `src/FreelanceEscrow.tact` | Контракт + сообщения + getter'ы |
| `scripts/deploy.ts` | Деплой на testnet/mainnet |
| `tests/` | Юнит-тесты (sandbox) |

## 🚀 Деплой

```bash
cd contracts/tact-escrow
npm install
npx tact --config ./tact.config.json       # компиляция
npx jest                                    # тесты
npx ts-node scripts/deploy.ts               # деплой
```

### Требования к .env

```env
TON_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
TON_API_KEY=your_key
PLATFORM_MNEMONIC=word1 word2 ... word24
```

После деплоя скрипт выведет:

```
Platform wallet: EQ...
Escrow address:  EQ...
```

Добавьте `ESCROW_CONTRACT_ADDRESS=EQ...` в `api-server/.env`.

## 🔧 Функциональность контракта

| Статус | Описание |
|---|---|
| `PENDING (0)` | Создан, ожидает оплаты |
| `ACTIVE (1)` | Оплачен, средства заморожены |
| `DELIVERED (2)` | Продавец сдал работу |
| `COMPLETED (3)` | Покупатель принял / авто-приём |
| `DISPUTED (4)` | Открыт спор |
| `CANCELLED (5)` | Отменён / возврат |

### Комиссия платформы

- По умолчанию **0%** (MVP)
- Настраивается `UpdateFee` (basis points: 500 = 5%)

### Автоприём

- `autoCompleteTimeout = 259200` секунд (3 дня)
- Любой может вызвать `AutoComplete` после таймаута

### Арбитраж (Dispute Resolution)

- `0` — полный возврат покупателю
- `1` — полная выплата продавцу
- `2` — split (sellerPercent в basis points, например 5000 = 50/50)

## 🔗 Интеграция с backend

Backend (`api-server/src/ton/`) автоматически:

1. Создаёт заказ в контракте (`CreateOrder`)
2. Отмечает сдачу (`MarkDelivered`)
3. Разрешает споры (`ResolveDispute`)
4. Отменяет (`CancelOrder`)

Если `ESCROW_CONTRACT_ADDRESS` не задан — backend работает в **simulation mode** (только PostgreSQL).

## 🧪 Тесты

```bash
npm test
```

Покрытие:
- Создание + оплата заказа
- Полный flow: create → pay → deliver → confirm
- Отмена до оплаты
- Открытие и разрешение спора
