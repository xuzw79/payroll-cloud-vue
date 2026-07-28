ALTER TABLE "Employee" ADD COLUMN "department" TEXT;
ALTER TABLE "Employee" ADD COLUMN "hireDate" TEXT;
ALTER TABLE "Employee" ADD COLUMN "retirementDate" TEXT;
ALTER TABLE "Employee" ADD COLUMN "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Employee" ADD COLUMN "employmentType" TEXT NOT NULL DEFAULT 'REGULAR';
