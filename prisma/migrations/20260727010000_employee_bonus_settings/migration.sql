ALTER TABLE "Employee" ADD COLUMN "bonusEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Employee" ADD COLUMN "bonusSchedules" JSONB;
