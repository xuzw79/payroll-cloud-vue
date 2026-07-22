CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "postalCode" TEXT,
    "address" TEXT,
    "invoiceNumber" TEXT,
    "closingDay" INTEGER,
    "paymentSiteDays" INTEGER,
    "memo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");
CREATE INDEX "Customer_name_idx" ON "Customer"("name");
CREATE INDEX "Customer_isActive_idx" ON "Customer"("isActive");
