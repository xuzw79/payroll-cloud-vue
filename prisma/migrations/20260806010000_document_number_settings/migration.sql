ALTER TABLE "CompanySetting" ADD COLUMN "invoiceNoPattern" TEXT NOT NULL DEFAULT '{YYYYMM}-{SEQ3}';
ALTER TABLE "CompanySetting" ADD COLUMN "contractNoPattern" TEXT NOT NULL DEFAULT 'CON-{YYYY}-{SEQ3}';
ALTER TABLE "CompanySetting" ADD COLUMN "purchaseOrderNoPattern" TEXT NOT NULL DEFAULT 'PO-{YYYYMM}-{SEQ3}';
ALTER TABLE "CompanySetting" ADD COLUMN "documentNumberResetType" TEXT NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "CompanySetting" ADD COLUMN "documentNumberSeqDigits" INTEGER NOT NULL DEFAULT 3;

CREATE TABLE "DocumentNumberSequence" (
  "id" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "nextSeq" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DocumentNumberSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentNumberSequence_documentType_periodKey_key" ON "DocumentNumberSequence"("documentType", "periodKey");
