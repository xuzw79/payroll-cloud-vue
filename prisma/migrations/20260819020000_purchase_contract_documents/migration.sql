ALTER TABLE "SesContract" ADD COLUMN IF NOT EXISTS "purchaseOrderNo" TEXT;
ALTER TABLE "SesContract" ADD COLUMN IF NOT EXISTS "contractPdfDownloadedAt" TIMESTAMP(3);
ALTER TABLE "SesContract" ADD COLUMN IF NOT EXISTS "purchaseOrderPdfDownloadedAt" TIMESTAMP(3);
