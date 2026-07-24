CREATE TABLE "SesExpense" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "customerId" TEXT,
  "contractId" TEXT,
  "employeeId" TEXT,
  "externalMemberId" TEXT,
  "title" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "memo" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SesExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SesExpense_period_idx" ON "SesExpense"("period");
CREATE INDEX "SesExpense_customerId_idx" ON "SesExpense"("customerId");
CREATE INDEX "SesExpense_contractId_idx" ON "SesExpense"("contractId");
CREATE INDEX "SesExpense_employeeId_idx" ON "SesExpense"("employeeId");
CREATE INDEX "SesExpense_externalMemberId_idx" ON "SesExpense"("externalMemberId");
CREATE INDEX "SesExpense_isActive_idx" ON "SesExpense"("isActive");

ALTER TABLE "SesExpense" ADD CONSTRAINT "SesExpense_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesExpense" ADD CONSTRAINT "SesExpense_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SesContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesExpense" ADD CONSTRAINT "SesExpense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesExpense" ADD CONSTRAINT "SesExpense_externalMemberId_fkey" FOREIGN KEY ("externalMemberId") REFERENCES "SesExternalMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
