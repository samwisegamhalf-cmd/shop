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

- Создайте сервис из папки `apps/web` (Root Directory в настройках Railway).
- Подключите PostgreSQL и привяжите к сервису (переменная `DATABASE_URL` подставится автоматически).
- Добавьте переменные окружения:
  - `SESSION_TTL_DAYS=30`
- **Build command** (нужен `DATABASE_URL` на этапе сборки; у Railway он доступен, если БД уже привязана):
  - `npx prisma migrate deploy && npm run prisma:generate && npm run build`
- **Start command:** `npm run start`

Альтернатива: оставить build как `npm run prisma:generate && npm run build`, а миграции выполнять в **Release Command** Railway: `npx prisma migrate deploy`.

Локально после клонирования: `cd apps/web && cp .env.example .env`, задать `DATABASE_URL`, затем `npx prisma migrate dev` (или только `npx prisma migrate deploy`, если база пустая и миграции уже в репозитории).
