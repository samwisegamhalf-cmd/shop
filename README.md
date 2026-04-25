# Shop PWA

MVP личного мультиплатформенного PWA-приложения для списка покупок с приватной авторизацией и синхронизацией через PostgreSQL.

## Структура проекта

- `apps/web` — Next.js (UI + API + PWA shell).
- `apps/web/prisma` — Prisma schema и миграции.
- `packages` — место для общих пакетов (типы/SDK, следующий шаг).
- `services/ai` — отдельный слой для AI parsing/transcription/vision (следующий шаг).

## Быстрый старт

1. Перейдите в `apps/web`.
2. Скопируйте `.env.example` в `.env`.
3. Укажите `DATABASE_URL` PostgreSQL.
4. Выполните:
   - `npm install`
   - `npm run prisma:generate`
   - `npx prisma migrate dev --name init`
   - `npm run dev`

## Railway Deploy

Есть два рабочих варианта (выберите один).

### Вариант 1 — Railpack / Nixpacks (без Docker)

В настройках сервиса Railway → **Settings → Source → Root Directory** укажите **`apps/web`**. Иначе Railpack смотрит корень монорепозитория и не находит `package.json` приложения.

Дальше:

- Подключите PostgreSQL к сервису (`DATABASE_URL` подставится автоматически).
- Переменная **`SESSION_TTL_DAYS=30`**.
- **Build command** (нужен `DATABASE_URL` на сборке, если миграции в build):
  - `npx prisma migrate deploy && npm run prisma:generate && npm run build`
- **Start:** `npm run start`

Либо build без миграций и **Release Command:** `npx prisma migrate deploy`.

### Вариант 2 — Docker из корня репозитория (без Root Directory)

В корне репозитория лежит **`Dockerfile`**: он копирует `apps/web` и собирает образ. В Railway включите сборку через **Docker** (или оставьте автоопределение, если платформа подхватывает Dockerfile).

При старте контейнера выполняется **`npx prisma migrate deploy`** и затем **`npm run start`** (миграции не зашиты в слой сборки, достаточно `DATABASE_URL` в runtime).

Локально проверка образа: `docker build -t shop-web .` из корня репозитория.

### Если в браузере `ERR_FAILED` или сайт не открывается

1. **Railway → сервис → Deployments → Logs**: контейнер должен дойти до строки `Ready` у Next. Если падает на `prisma migrate deploy` — проверьте **`DATABASE_URL`** (сервис Postgres привязан к приложению, переменная реально есть у **web**-сервиса). Для внешних клиентов к URL иногда добавляют **`&sslmode=require`**.
2. Убедитесь, что приложение слушает **`PORT`**, который задаёт Railway (скрипт старта использует `PORT`).
3. Проверка без БД: откройте `https://<ваш-домен>/api/health` — должен вернуться JSON `{"ok":true,...}`. Если health ок, а остальное нет — смотрите логи и миграции/БД.

---

Локально после клонирования: `cd apps/web && cp .env.example .env`, задать `DATABASE_URL`, затем `npx prisma migrate dev` (или `npx prisma migrate deploy`, если база пустая и миграции уже в репозитории).
