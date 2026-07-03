ALTER TABLE "Payroll" ADD COLUMN "socialInsuranceEnrolled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Payroll" ADD COLUMN "socialInsuranceBaseAmount" INTEGER;
