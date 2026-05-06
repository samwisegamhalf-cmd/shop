ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "activeListId" TEXT;

CREATE TABLE IF NOT EXISTS "FavoriteProduct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "quantity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FavoriteProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FavoriteProduct_userId_workspaceId_canonicalName_key"
ON "FavoriteProduct"("userId", "workspaceId", "canonicalName");

CREATE INDEX IF NOT EXISTS "FavoriteProduct_workspaceId_canonicalName_idx"
ON "FavoriteProduct"("workspaceId", "canonicalName");

ALTER TABLE "FavoriteProduct"
ADD CONSTRAINT "FavoriteProduct_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FavoriteProduct"
ADD CONSTRAINT "FavoriteProduct_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
