CREATE UNIQUE INDEX "SesInvoice_contractId_period_active_key"
ON "SesInvoice"("contractId", "period")
WHERE "contractId" IS NOT NULL AND "isActive" = true;
