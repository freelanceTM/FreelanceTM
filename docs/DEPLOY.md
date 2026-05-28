# FreelanceTM — Пошаговый гайд деплоя в продакшен

## ☁️ Выбор сервера

**Рекомендуем:** Hetzner Cloud (CPX31: 4 vCPU / 8 GB RAM / 160 GB NVMe) — €15/мес
**Минимум:** CPX21 (2 vCPU / 4 GB RAM) — €8/мес (для beta до 500 пользователей)

**ОС:** Ubuntu 22.04 LTS

---

## 1. Подготовка сервера

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker + Docker Compose
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Добавить текущего пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker

# Проверка
docker --version
```

---

## 2. Клонирование и настройка

```bash
cd ~
git clone https://github.com/freelanceTM/FreelanceTM.git
mv FreelanceTM freelancetm
cd freelancetm

# Скопировать .env и ЗАПОЛНИТЬ ВСЕ ПОЛЯ
cp api-server/.env.example .env
nano .env
```

### 🔐 Генерация секретов (выполнить на сервере, сохранить в KeePass/Bitwarden)

```bash
# JWT_SECRET (64 chars)
openssl rand -base64 48

# MASTER_ENCRYPTION_KEY (32 bytes hex)
openssl rand -hex 32

# ADMIN_SECRET
openssl rand -base64 32

# S3_SECRET_KEY
openssl rand -base64 32
```

Вставьте их в `.env`. **Никогда не коммитьте `.env`!**

---

## 3. Первый запуск (структура данных)

```bash
cd ~/freelancetm

# Поднять PostgreSQL, Redis, MinIO
# (API ещё НЕ запускаем — сначала миграции)
docker-compose -f docker-compose.prod.yml up -d postgres redis minio minio-init

# Ждём 10 секунд
echo "Waiting for Postgres..."
sleep 10

# Запускаем временный контейнер для миграций
docker run --rm -v $(pwd)/api-server:/app -w /app \
  --network freelancetm_ftm-network \
  -e DATABASE_URL="$(grep DATABASE_URL .env | cut -d= -f2-)" \
  node:20-alpine sh -c "
    npm install prisma --no-save && \
    npx prisma migrate deploy && \
    npx prisma db seed
  "

# Готово! Теперь поднимаем весь стек
docker-compose -f docker-compose.prod.yml up -d
```

---

## 4. Проверка работоспособности

```bash
# Health check
curl -sf http://localhost/api/healthz && echo "✅ API OK"

# Проверка MinIO (замените на ваш IP)
curl -sf http://localhost:9000/minio/health/live && echo "✅ MinIO OK"

# Логи API (в реальном времени)
docker logs -f ftm-api

# Логи nginx
docker logs -f ftm-nginx
```

---

## 5. Настройка домена и SSL (Let's Encrypt)

### 5.1. Купите домен, направьте A-запись на IP сервера.

### 5.2. Раскомментируйте certbot в `docker-compose.prod.yml`:

```yaml
  certbot:
    image: certbot/certbot:latest
    container_name: ftm-certbot
    volumes:
      - certbot-data:/etc/letsencrypt
      - ./nginx/www:/var/www/certbot:rw
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h; done'"
    networks:
      - ftm-network
```

### 5.3. Раскомментируйте HTTPS server block в `nginx/nginx.conf`.

### 5.4. Получить первый сертификат:

```bash
docker run -it --rm \
  -v certbot-data:/etc/letsencrypt \
  -v ./nginx/www:/var/www/certbot \
  certbot/certbot certonly \
  --standalone \
  --agree-tos \
  --no-eff-email \
  -d app.freelancetm.io
```

### 5.5. Перезапустить nginx:

```bash
docker-compose -f docker-compose.prod.yml restart nginx
```

---

## 6. Настройка GitHub Actions (Auto-deploy)

### 6.1. Добавьте Secrets в репозиторий GitHub:

- `SSH_HOST` — IP сервера
- `SSH_USER` — `root` или `deploy`
- `SSH_PRIVATE_KEY` — содержимое `~/.ssh/id_rsa` (или создайте новый: `ssh-keygen -t ed25519 -C deploy`)
- `SSH_PORT` — `22`
- `GITHUB_TOKEN` — уже доступен автоматически

### 6.2. На сервере разрешите ключ:

```bash
# На сервере
echo "YOUR_PUBLIC_KEY" >> ~/.ssh/authorized_keys
```

### 6.3. Деплой теперь автоматический при каждом `git push` в `main`!

---

## 7. Настройка Telegram Bot

### 7.1. Получите токен у @BotFather

### 7.2. Установите Webhook (для продакшена, чтобы бот не опрашивал):

```bash
# Если домен настроен:
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.freelancetm.io/api/telegram/webhook"}'

# Проверить:
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Если нет домена — polling работает автоматически в dev-режиме.

---

## 8. TON Escrow контракт (Testnet)

### 8.1. Получите testnet TON (бесплатно):
- @testgiver_ton_bot в Telegram
- Или https://faucet.tonxapi.com

### 8.2. Деплой контракта:

```bash
cd ~/freelancetm/contracts/tact-escrow
npm install
npx tact --config ./tact.config.json
npx ts-node scripts/deploy.ts
```

Скопируйте выведенный `ESCROW_CONTRACT_ADDRESS` в `.env`.

### 8.3. Перезапустите API:

```bash
docker-compose -f docker-compose.prod.yml restart api
```

---

## 9. Мониторинг (по желанию)

### 9.1. Sentry (ошибки)

- Регистрация: https://sentry.io
- Создайте проект → скопируйте DSN → добавьте в `.env` как `SENTRY_DSN`
- Перезапустите API

### 9.2. k6 Load Test

```bash
# На локальной машине или CI
k6 run -e API_URL=https://api.freelancetm.io/api scripts/k6/api-load-test.js
```

---

## 10. Сидирование демо-данных (Beta)

```bash
# На сервере — создать 50+ тестовых gigs и пользователей
docker-compose -f docker-compose.prod.yml exec api npx ts-node prisma/seed-demo.ts
```

---

## 🔴 Чек-лист перед открытием регистрации

- [ ] `.env` заполнен, MASTER_KEY и JWT_SECRET сгенерированы
- [ ] `.env` НЕ в репозитории (`git status` — зелёный)
- [ ] PostgreSQL миграции применены
- [ ] MinIO бакеты созданы
- [ ] Nginx отвечает на 80 порту
- [ ] Telegram Bot токен рабочий, /start отвечает
- [ ] TON escrow задеплоен (testnet)
- [ ] Sentry DSN добавлен (опционально)
- [ ] CI/CD secrets настроены
- [ ] Домен + SSL (или планируется в течение 24ч)
- [ ] TOS и Privacy Policy доступны пользователям
- [ ] Резервная копия .env сохранена оффлайн

---

## 🆘 Откат (Rollback)

```bash
# Посмотреть предыдущий образ
docker images | grep freelancetm

# Откат на предыдущую версию
docker-compose -f docker-compose.prod.yml down api
docker pull ghcr.io/freelancetm/api:<PREVIOUS_SHA>
docker-compose -f docker-compose.prod.yml up -d api
```

---

**Готово к запуску!** 🚀
