#!/usr/bin/env sh
set -eu
# Migrations at container start (DATABASE_URL from Railway).
npx prisma migrate deploy
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
