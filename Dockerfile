# Monorepo: build Next.js app from apps/web without Railway "Root Directory".
# Railway: enable Docker builder (or leave auto-detect if Dockerfile is used).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web/ ./
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --omit=dev

COPY apps/web/public ./public
COPY apps/web/prisma ./prisma
COPY apps/web/next.config.ts ./
COPY apps/web/scripts ./scripts
COPY --from=builder /app/.next ./.next

RUN chmod +x ./scripts/start.sh

EXPOSE 3000
ENV PORT=3000

CMD ["./scripts/start.sh"]
