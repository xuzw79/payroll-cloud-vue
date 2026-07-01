CREATE TYPE "PayType" AS ENUM ('MONTHLY', 'HOURLY');

CREATE TABLE "Employee" (
  "id" TEXT NOT NULL,
  "employeeNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payType" "PayType" NOT NULL DEFAULT 'MONTHLY',
  "basePay" INTEGER NOT NULL,
  "memo" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payroll" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "workDays" DECIMAL(8,2) NOT NULL,
  "workHours" DECIMAL(8,2) NOT NULL,
  "overtimeHours" DECIMAL(8,2) NOT NULL,
  "allowance" INTEGER NOT NULL DEFAULT 0,
  "fixedDeduction" INTEGER NOT NULL DEFAULT 0,
  "overtimeRate" DECIMAL(5,3) NOT NULL,
  "incomeTaxRate" DECIMAL(5,4) NOT NULL,
  "socialInsuranceRate" DECIMAL(5,4) NOT NULL,
  "employmentInsuranceRate" DECIMAL(5,4) NOT NULL,
  "regularPay" INTEGER NOT NULL,
  "overtimePay" INTEGER NOT NULL,
  "grossPay" INTEGER NOT NULL,
  "incomeTax" INTEGER NOT NULL,
  "socialInsurance" INTEGER NOT NULL,
  "employmentInsurance" INTEGER NOT NULL,
  "totalDeduction" INTEGER NOT NULL,
  "netPay" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanySetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "overtimeRate" DECIMAL(5,3) NOT NULL DEFAULT 1.25,
  "incomeTaxRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0300,
  "socialInsuranceRate" DECIMAL(5,4) NOT NULL DEFAULT 0.1500,
  "employmentInsuranceRate" DECIMAL(5,4) NOT NULL DEFAULT 0.0060,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Employee_employeeNo_key" ON "Employee"("employeeNo");
CREATE UNIQUE INDEX "Payroll_employeeId_period_key" ON "Payroll"("employeeId", "period");
CREATE INDEX "Payroll_period_idx" ON "Payroll"("period");

ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
