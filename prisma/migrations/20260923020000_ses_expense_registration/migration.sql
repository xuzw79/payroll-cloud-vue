ALTER TYPE "PermissionMenu" ADD VALUE IF NOT EXISTS 'SES_EXPENSES';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'EXPENSE';

ALTER TABLE "SesExpense" ADD COLUMN "expenseDate" TEXT;
ALTER TABLE "SesExpense" ADD COLUMN "accountCode" INTEGER;
ALTER TABLE "SesExpense" ADD COLUMN "accountTitle" TEXT;

CREATE INDEX "SesExpense_expenseDate_idx" ON "SesExpense"("expenseDate");
CREATE INDEX "SesExpense_accountCode_idx" ON "SesExpense"("accountCode");
