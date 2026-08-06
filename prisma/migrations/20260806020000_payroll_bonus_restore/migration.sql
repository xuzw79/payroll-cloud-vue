ALTER TABLE "Payroll" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payroll" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Bonus" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Bonus" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Payroll_isDeleted_idx" ON "Payroll"("isDeleted");
CREATE INDEX "Bonus_isDeleted_idx" ON "Bonus"("isDeleted");
