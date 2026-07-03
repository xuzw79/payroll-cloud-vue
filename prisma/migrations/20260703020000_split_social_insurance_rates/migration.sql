ALTER TABLE "Payroll" ALTER COLUMN "overtimeRate" TYPE DECIMAL(7,5);
ALTER TABLE "Payroll" ALTER COLUMN "incomeTaxRate" TYPE DECIMAL(7,5);
ALTER TABLE "Payroll" ALTER COLUMN "socialInsuranceRate" TYPE DECIMAL(7,5);
ALTER TABLE "Payroll" ALTER COLUMN "employmentInsuranceRate" TYPE DECIMAL(7,5);
ALTER TABLE "Payroll" ADD COLUMN "healthInsuranceRate" DECIMAL(7,5) NOT NULL DEFAULT 0.05000;
ALTER TABLE "Payroll" ADD COLUMN "pensionInsuranceRate" DECIMAL(7,5) NOT NULL DEFAULT 0.10000;
ALTER TABLE "Payroll" ADD COLUMN "healthInsurance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payroll" ADD COLUMN "pensionInsurance" INTEGER NOT NULL DEFAULT 0;

UPDATE "Payroll"
SET
  "healthInsuranceRate" = ROUND("socialInsuranceRate" / 2, 5),
  "pensionInsuranceRate" = "socialInsuranceRate" - ROUND("socialInsuranceRate" / 2, 5),
  "healthInsurance" = ROUND("socialInsurance"::numeric / 2)::integer,
  "pensionInsurance" = "socialInsurance" - ROUND("socialInsurance"::numeric / 2)::integer;

ALTER TABLE "CompanySetting" ALTER COLUMN "overtimeRate" TYPE DECIMAL(7,5);
ALTER TABLE "CompanySetting" ALTER COLUMN "incomeTaxRate" TYPE DECIMAL(7,5);
ALTER TABLE "CompanySetting" ALTER COLUMN "socialInsuranceRate" TYPE DECIMAL(7,5);
ALTER TABLE "CompanySetting" ALTER COLUMN "employmentInsuranceRate" TYPE DECIMAL(7,5);
ALTER TABLE "CompanySetting" ADD COLUMN "healthInsuranceRate" DECIMAL(7,5) NOT NULL DEFAULT 0.05000;
ALTER TABLE "CompanySetting" ADD COLUMN "pensionInsuranceRate" DECIMAL(7,5) NOT NULL DEFAULT 0.10000;

UPDATE "CompanySetting"
SET
  "healthInsuranceRate" = ROUND("socialInsuranceRate" / 2, 5),
  "pensionInsuranceRate" = "socialInsuranceRate" - ROUND("socialInsuranceRate" / 2, 5);

ALTER TABLE "FiscalRate" ALTER COLUMN "overtimeRate" TYPE DECIMAL(7,5);
ALTER TABLE "FiscalRate" ALTER COLUMN "incomeTaxRate" TYPE DECIMAL(7,5);
ALTER TABLE "FiscalRate" ALTER COLUMN "socialInsuranceRate" TYPE DECIMAL(7,5);
ALTER TABLE "FiscalRate" ALTER COLUMN "employmentInsuranceRate" TYPE DECIMAL(7,5);
ALTER TABLE "FiscalRate" ADD COLUMN "healthInsuranceRate" DECIMAL(7,5) NOT NULL DEFAULT 0.05000;
ALTER TABLE "FiscalRate" ADD COLUMN "pensionInsuranceRate" DECIMAL(7,5) NOT NULL DEFAULT 0.10000;

UPDATE "FiscalRate"
SET
  "healthInsuranceRate" = ROUND("socialInsuranceRate" / 2, 5),
  "pensionInsuranceRate" = "socialInsuranceRate" - ROUND("socialInsuranceRate" / 2, 5);
