CREATE TABLE "SesPartnerCost" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "customerId" TEXT,
  "contractId" TEXT NOT NULL,
  "contractMemberId" TEXT,
  "employeeId" TEXT,
  "externalMemberId" TEXT,
  "title" TEXT NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 0,
  "memo" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SesPartnerCost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SesPartnerCost_period_idx" ON "SesPartnerCost"("period");
CREATE INDEX "SesPartnerCost_customerId_idx" ON "SesPartnerCost"("customerId");
CREATE INDEX "SesPartnerCost_contractId_idx" ON "SesPartnerCost"("contractId");
CREATE INDEX "SesPartnerCost_contractMemberId_idx" ON "SesPartnerCost"("contractMemberId");
CREATE INDEX "SesPartnerCost_employeeId_idx" ON "SesPartnerCost"("employeeId");
CREATE INDEX "SesPartnerCost_externalMemberId_idx" ON "SesPartnerCost"("externalMemberId");
CREATE INDEX "SesPartnerCost_isActive_idx" ON "SesPartnerCost"("isActive");

ALTER TABLE "SesPartnerCost" ADD CONSTRAINT "SesPartnerCost_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesPartnerCost" ADD CONSTRAINT "SesPartnerCost_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SesContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SesPartnerCost" ADD CONSTRAINT "SesPartnerCost_contractMemberId_fkey" FOREIGN KEY ("contractMemberId") REFERENCES "SesContractMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesPartnerCost" ADD CONSTRAINT "SesPartnerCost_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesPartnerCost" ADD CONSTRAINT "SesPartnerCost_externalMemberId_fkey" FOREIGN KEY ("externalMemberId") REFERENCES "SesExternalMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
