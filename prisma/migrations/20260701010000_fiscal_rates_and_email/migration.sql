ALTER TABLE "Employee" ADD COLUMN "email" TEXT;
ALTER TABLE "Payroll" ADD COLUMN "fiscalYear" INTEGER;
ALTER TABLE "Payroll" ADD COLUMN "emailedAt" TIMESTAMP(3);
ALTER TABLE "CompanySetting" ADD COLUMN "currentFiscalYear" INTEGER;

CREATE TABLE "FiscalRate" (
  "id" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "overtimeRate" DECIMAL(5,3) NOT NULL DEFAULT 1.25,
  "incomeTaxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0300,
  "socialInsuranceRate" DECIMAL(5,4) NOT NULL DEFAULT 0.1500,
  "employmentInsuranceRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0060,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FiscalRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalRate_fiscalYear_key" ON "FiscalRate"("fiscalYear");
