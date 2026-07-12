CREATE TABLE "Bonus" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "bonusAmount" INTEGER NOT NULL DEFAULT 0,
  "incomeTaxRate" DECIMAL(8,6) NOT NULL,
  "healthInsuranceRate" DECIMAL(8,6) NOT NULL,
  "pensionInsuranceRate" DECIMAL(8,6) NOT NULL,
  "childCareSupportRate" DECIMAL(8,6) NOT NULL DEFAULT 0.000000,
  "employmentInsuranceRate" DECIMAL(8,6) NOT NULL,
  "socialInsuranceEnrolled" BOOLEAN NOT NULL DEFAULT true,
  "employmentInsuranceEnrolled" BOOLEAN NOT NULL DEFAULT true,
  "socialInsuranceBaseAmount" INTEGER,
  "taxableIncome" INTEGER NOT NULL,
  "incomeTax" INTEGER NOT NULL,
  "healthInsurance" INTEGER NOT NULL DEFAULT 0,
  "pensionInsurance" INTEGER NOT NULL DEFAULT 0,
  "childCareSupport" INTEGER NOT NULL DEFAULT 0,
  "socialInsurance" INTEGER NOT NULL,
  "employmentInsurance" INTEGER NOT NULL,
  "totalDeduction" INTEGER NOT NULL,
  "netPay" INTEGER NOT NULL,
  "fiscalYear" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bonus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bonus_employeeId_period_key" ON "Bonus"("employeeId", "period");
CREATE INDEX "Bonus_period_idx" ON "Bonus"("period");

ALTER TABLE "Bonus" ADD CONSTRAINT "Bonus_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
