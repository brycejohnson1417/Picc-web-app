-- CreateTable
CREATE TABLE "NotionCacheSnapshot" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "unresolvedLocationCount" INTEGER NOT NULL DEFAULT 0,
    "lastEditedMax" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotionCacheSnapshot_pkey" PRIMARY KEY ("key")
);
