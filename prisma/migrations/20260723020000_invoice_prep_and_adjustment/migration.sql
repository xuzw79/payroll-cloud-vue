ALTER TABLE "CompanySetting" ADD COLUMN "invoiceCompanyName" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "invoicePostalCode" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "invoiceAddress" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "invoiceTel" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "invoiceRegistrationNo" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "invoiceBankName" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "invoiceBankBranch" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "invoiceBankAccount" TEXT;
ALTER TABLE "CompanySetting" ADD COLUMN "invoiceBankHolder" TEXT;

ALTER TABLE "SesContractMember" ADD COLUMN "itemDescription" TEXT;
ALTER TABLE "SesInvoiceItem" ADD COLUMN "workHours" DECIMAL(8,2);
