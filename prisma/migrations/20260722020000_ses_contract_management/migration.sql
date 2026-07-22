CREATE TYPE "SesBillingType" AS ENUM ('FIXED', 'TIME_RANGE');
CREATE TYPE "SesMemberSource" AS ENUM ('EMPLOYEE', 'EXTERNAL');
CREATE TYPE "SesContractType" AS ENUM ('SALES', 'PURCHASE');

CREATE TABLE "SesExternalMember" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "memo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesExternalMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SesContract" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contractType" "SesContractType" NOT NULL DEFAULT 'SALES',
    "contractNo" TEXT,
    "title" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "memo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SesContractMember" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "source" "SesMemberSource" NOT NULL,
    "employeeId" TEXT,
    "externalMemberId" TEXT,
    "billingType" "SesBillingType" NOT NULL DEFAULT 'FIXED',
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "lowerLimitHours" DECIMAL(8,2),
    "upperLimitHours" DECIMAL(8,2),
    "deductionHourlyRate" INTEGER NOT NULL DEFAULT 0,
    "excessHourlyRate" INTEGER NOT NULL DEFAULT 0,
    "startDate" TEXT,
    "endDate" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesContractMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SesExternalMember_customerId_idx" ON "SesExternalMember"("customerId");
CREATE INDEX "SesExternalMember_name_idx" ON "SesExternalMember"("name");
CREATE INDEX "SesExternalMember_isActive_idx" ON "SesExternalMember"("isActive");
CREATE INDEX "SesContract_customerId_idx" ON "SesContract"("customerId");
CREATE INDEX "SesContract_title_idx" ON "SesContract"("title");
CREATE INDEX "SesContract_isActive_idx" ON "SesContract"("isActive");
CREATE INDEX "SesContractMember_contractId_idx" ON "SesContractMember"("contractId");
CREATE INDEX "SesContractMember_employeeId_idx" ON "SesContractMember"("employeeId");
CREATE INDEX "SesContractMember_externalMemberId_idx" ON "SesContractMember"("externalMemberId");

ALTER TABLE "SesExternalMember" ADD CONSTRAINT "SesExternalMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesContract" ADD CONSTRAINT "SesContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SesContractMember" ADD CONSTRAINT "SesContractMember_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SesContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SesContractMember" ADD CONSTRAINT "SesContractMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesContractMember" ADD CONSTRAINT "SesContractMember_externalMemberId_fkey" FOREIGN KEY ("externalMemberId") REFERENCES "SesExternalMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
