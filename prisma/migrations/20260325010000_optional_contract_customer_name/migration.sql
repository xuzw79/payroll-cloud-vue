ALTER TABLE "SesContract" ADD COLUMN "manualCustomerName" TEXT;
ALTER TABLE "SesContract" ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "SesContract" DROP CONSTRAINT IF EXISTS "SesContract_customerId_fkey";
ALTER TABLE "SesContract" ADD CONSTRAINT "SesContract_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
