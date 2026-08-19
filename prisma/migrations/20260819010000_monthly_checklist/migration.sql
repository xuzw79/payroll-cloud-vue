ALTER TYPE "PermissionMenu" ADD VALUE IF NOT EXISTS 'MONTHLY_CHECK';

ALTER TABLE "SesInvoice" ADD COLUMN IF NOT EXISTS "pdfDownloadedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "MonthlyCheckConfirmation" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "checkKey" TEXT NOT NULL,
  "confirmedByUserId" TEXT,
  "confirmedByName" TEXT,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonthlyCheckConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyCheckConfirmation_period_checkKey_key"
ON "MonthlyCheckConfirmation"("period", "checkKey");

CREATE INDEX IF NOT EXISTS "MonthlyCheckConfirmation_period_idx"
ON "MonthlyCheckConfirmation"("period");

CREATE INDEX IF NOT EXISTS "MonthlyCheckConfirmation_checkKey_idx"
ON "MonthlyCheckConfirmation"("checkKey");
