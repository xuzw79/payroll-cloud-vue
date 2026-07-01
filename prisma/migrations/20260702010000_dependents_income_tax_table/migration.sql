ALTER TABLE "Employee" ADD COLUMN "defaultDependentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payroll" ADD COLUMN "dependentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payroll" ADD COLUMN "taxableIncome" INTEGER;

CREATE TABLE "IncomeTaxBracket" (
  "id" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "dependentCount" INTEGER NOT NULL,
  "minTaxable" INTEGER NOT NULL,
  "maxTaxable" INTEGER,
  "taxAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncomeTaxBracket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IncomeTaxBracket_fiscalYear_dependentCount_minTaxable_idx"
  ON "IncomeTaxBracket"("fiscalYear", "dependentCount", "minTaxable");
