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

- Создайте сервис из папки `apps/web`.
- Добавьте переменные окружения:
  - `DATABASE_URL`
  - `SESSION_TTL_DAYS=30`
- Build command: `npm run prisma:generate && npm run build`
- Start command: `npm run start`
