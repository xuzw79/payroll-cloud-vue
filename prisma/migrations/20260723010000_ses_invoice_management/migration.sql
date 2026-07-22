CREATE TABLE "SesInvoice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contractId" TEXT,
    "period" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "issueDate" TEXT NOT NULL,
    "dueDate" TEXT,
    "title" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(8,6) NOT NULL DEFAULT 0.100000,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SesInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT '式',
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesInvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SesInvoice_customerId_idx" ON "SesInvoice"("customerId");
CREATE INDEX "SesInvoice_contractId_idx" ON "SesInvoice"("contractId");
CREATE INDEX "SesInvoice_period_idx" ON "SesInvoice"("period");
CREATE INDEX "SesInvoice_isActive_idx" ON "SesInvoice"("isActive");
CREATE INDEX "SesInvoiceItem_invoiceId_idx" ON "SesInvoiceItem"("invoiceId");

ALTER TABLE "SesInvoice" ADD CONSTRAINT "SesInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SesInvoice" ADD CONSTRAINT "SesInvoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SesContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SesInvoiceItem" ADD CONSTRAINT "SesInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
