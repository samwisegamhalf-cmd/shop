ALTER TABLE "ShoppingItem"
ADD COLUMN IF NOT EXISTS "canonicalName" TEXT NOT NULL DEFAULT '';

UPDATE "ShoppingItem"
SET "canonicalName" = LOWER(TRIM(COALESCE(NULLIF("normalizedName", ''), "originalText")))
WHERE "canonicalName" = '';
