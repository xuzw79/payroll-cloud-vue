ALTER TABLE "CompanySetting" ADD COLUMN "fiscalClosingMonth" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "SesRevenue" (
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
  CONSTRAINT "SesRevenue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SesRevenue_period_idx" ON "SesRevenue"("period");
CREATE INDEX "SesRevenue_customerId_idx" ON "SesRevenue"("customerId");
CREATE INDEX "SesRevenue_contractId_idx" ON "SesRevenue"("contractId");
CREATE INDEX "SesRevenue_employeeId_idx" ON "SesRevenue"("employeeId");
CREATE INDEX "SesRevenue_externalMemberId_idx" ON "SesRevenue"("externalMemberId");
CREATE INDEX "SesRevenue_isActive_idx" ON "SesRevenue"("isActive");

ALTER TABLE "SesRevenue" ADD CONSTRAINT "SesRevenue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesRevenue" ADD CONSTRAINT "SesRevenue_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SesContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesRevenue" ADD CONSTRAINT "SesRevenue_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesRevenue" ADD CONSTRAINT "SesRevenue_externalMemberId_fkey" FOREIGN KEY ("externalMemberId") REFERENCES "SesExternalMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
