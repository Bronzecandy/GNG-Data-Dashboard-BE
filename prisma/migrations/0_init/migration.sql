-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'USER');

-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","permissionKey")
);

-- CreateTable
CREATE TABLE "BeanDailyFact" (
    "id" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "cluster" TEXT NOT NULL DEFAULT 'platform:(hive,sg-cluster)',
    "dt" DATE NOT NULL,
    "dimsKey" TEXT NOT NULL DEFAULT '{}',
    "dims" JSONB NOT NULL DEFAULT '{}',
    "measures" JSONB NOT NULL,
    "ingestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeanDailyFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionWatermark" (
    "metricId" TEXT NOT NULL,
    "cluster" TEXT NOT NULL DEFAULT 'platform:(hive,sg-cluster)',
    "lastDt" DATE NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "IngestionWatermark_pkey" PRIMARY KEY ("metricId","cluster")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "metricId" TEXT,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "rowsUpserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "BeanDailyFact_metricId_dt_idx" ON "BeanDailyFact"("metricId", "dt");

-- CreateIndex
CREATE INDEX "BeanDailyFact_dt_idx" ON "BeanDailyFact"("dt");

-- CreateIndex
CREATE UNIQUE INDEX "BeanDailyFact_metricId_cluster_dt_dimsKey_key" ON "BeanDailyFact"("metricId", "cluster", "dt", "dimsKey");

-- CreateIndex
CREATE INDEX "IngestionRun_startedAt_idx" ON "IngestionRun"("startedAt" DESC);

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
