-- CreateEnum
CREATE TYPE "ReportRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rangeStart" DATE NOT NULL,
    "rangeEnd" DATE NOT NULL,
    "status" "ReportRunStatus" NOT NULL DEFAULT 'PENDING',
    "html" TEXT,
    "payloadJson" JSONB,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "error" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportRun_type_createdAt_idx" ON "ReportRun"("type", "createdAt" DESC);
CREATE INDEX "ReportRun_createdAt_idx" ON "ReportRun"("createdAt" DESC);