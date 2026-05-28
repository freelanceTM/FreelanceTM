# 🔐 Pre-Deployment Security Checklist

Критические проверки, которые **должны** быть выполнены перед открытием регистрации пользователей.

---

## 1. Секреты и ключи

- [ ] **JWT_SECRET** — минимум 32 символа, случайные. Не `secret123`.
- [ ] **MASTER_ENCRYPTION_KEY** — ровно 32 байта (64 hex символа). Генерация: `openssl rand -hex 32`.
- [ ] **MASTER_ENCRYPTION_KEY** — хранится **отдельно** от `.env` на сервере (HashiCorp Vault, 1Password, или зашифрованный диск).
- [ ] **MASTER_ENCRYPTION_KEY** — **не** в Git, **не** в Docker образе, **не** в логах.
- [ ] **PLATFORM_MNEMONIC** (24 слова TON) — написаны на бумаге и хранятся в физически безопасном месте.
- [ ] **TELEGRAM_BOT_TOKEN** — не коммичен, регенерирован если был случайно выложен.
- [ ] **ADMIN_SECRET** — отдельный от JWT, минимум 32 символа.
- [ ] **S3_SECRET_KEY** / **POSTGRES_PASSWORD** — strong passwords, не дефолтные.
- [ ] **SENTRY_DSN** — не содержит приватных ключей проекта.

---

## 2. Сетевой периметр

- [ ] **Nginx** — открыт порты 80 и 443. API (3000) **не** проброшен наружу.
- [ ] **PostgreSQL** — порт 5432 доступен **только** с `127.0.0.1` (или Docker network).
- [ ] **Redis** — порт 6379 доступен **только** с `127.0.0.1`.
- [ ] **MinIO** — порты 9000/9001 доступны **только** с `127.0.0.1` (или через Nginx proxy если нужен public).
- [ ] **Фаервол** (`ufw` / `iptables`) — разрешены только 22, 80, 443.
- [ ] **SSH** — root login отключён, используется key-only auth.
- [ ] **Fail2ban** — установлен и активен.

---

## 3. HTTPS и заголовки

- [ ] **SSL сертификат** — действующий Let's Encrypt (или Cloudflare Origin).
- [ ] **HSTS** — включён после проверки HTTPS.
- [ ] **X-Frame-Options: DENY** — защита от clickjacking.
- [ ] **CORS** — не `*`, а конкретный `CLIENT_URL`.
- [ ] **Rate Limit** — на Nginx (zone) + NestJS Throttler.

---

## 4. База данных

- [ ] **Миграции** — применены (`prisma migrate deploy`).
- [ ] **Бэкапы** — автоматические ежедневные (`pg_dump` в MinIO backups bucket).
- [ ] **RLS** — Row Level Security не требуется (Prisma ORM), но внешние ключи и каскады проверены.
- [ ] **Пароль PostgreSQL** — не дефолтный, сложный.

---

## 5. Файлы и загрузки

- [ ] **Max file size** — 50MB лимит на Nginx + NestJS.
- [ ] **File types** — проверка MIME-type, не только расширение.
- [ ] **S3/MinIO** — публичный бакет только для `freelancetm-uploads`, backups — private.
- [ ] **Virus scan** — ClamAV (опционально, для MVP можно отложить).

---

## 6. Кастодиальные кошельки (TON)

- [ ] **Аудит смарт-контракта** — независимый TON-разработчик проверил `FreelanceEscrow.tact`.
- [ ] **Testnet** — все финансовые операции идут через testnet на beta-фазе.
- [ ] **Mainnet** — **НЕ** деплоится до аудита + юридической консультации.
- [ ] **Ключи** — мнемоника платформы на бумаге, в сейфе.

---

## 7. Логирование и мониторинг

- [ ] **Sentry** — подключён, DSN в `.env`.
- [ ] **Логи** — не содержат JWT токенов, паролей, мнемоник, приватных ключей.
- [ ] **Winston** — JSON формат для Loki/Grafana (при масштабировании).
- [ ] **Алерты** — на email/Telegram при 500 ошибках > 5/min.

---

## 8. Юридическое

- [ ] **TOS** — опубликован на `/terms` или в Telegram Mini App.
- [ ] **Privacy Policy** — опубликован на `/privacy`.
- [ ] **Обе страницы** — доступны без авторизации.
- [ ] **Языки** — минимум на русском и туркменском (если целевая аудитория).

---

## 9. Процедуры

- [ ] **Incident Response Plan** — кто делает что при взломе/утечке.
- [ ] **Contact** — `security@freelancetm.io` или Telegram для security reports.
- [ ] **Bug Bounty** — минимальный (например, 50 TON за критичный баг на testnet).

---

## 🎯 Финальная проверка перед запуском

```bash
# 1. Проверить, что в .env нет default паролей
grep -E "(password|secret|key|mnemonic)" .env | grep -v "^#" | grep -i "changeme\|example\|123"
# Должно быть ПУСТО.

# 2. Проверить, что нет чувствительных данных в коде
grep -r "process.env" api-server/src/ | grep -v ".env.example"
# Все env vars должны быть через ConfigService.

# 3. Проверить открытые порты
sudo ss -tlnp | grep -E "3000|5432|6379|9000"
# Только 80 и 443 должны быть 0.0.0.0. Остальные — 127.0.0.1.

# 4. Health check
curl -sf https://your-domain.com/api/healthz
```

---

**Если все галочки ✅ — можно открывать beta.**
