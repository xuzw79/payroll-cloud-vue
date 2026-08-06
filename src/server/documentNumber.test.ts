import assert from "node:assert/strict";
import { documentNumberPeriodKey, formatDocumentNumber, normalizeDocumentNumberSettings } from "./documentNumber.js";

assert.deepEqual(normalizeDocumentNumberSettings({}), {
  invoiceNoPattern: "{YYYYMM}-{SEQ3}",
  contractNoPattern: "CON-{YYYY}-{SEQ3}",
  purchaseOrderNoPattern: "PO-{YYYYMM}-{SEQ3}",
  documentNumberResetType: "MONTHLY",
  documentNumberSeqDigits: 3
});

assert.equal(
  formatDocumentNumber("INV-{YYYYMM}-{SEQ3}", "2026-08", 7),
  "INV-202608-007"
);

assert.equal(
  formatDocumentNumber("CON-{YYYY}-{SEQ4}", "2026-08", 12),
  "CON-2026-0012"
);

assert.equal(
  formatDocumentNumber("PO-{YYYYMM}-{SEQ}", "2026-08", 9, 5),
  "PO-202608-00009"
);

assert.equal(
  documentNumberPeriodKey("MONTHLY", "2026-08"),
  "202608"
);

assert.equal(
  documentNumberPeriodKey("YEARLY", "2026-08"),
  "2026"
);

assert.equal(
  documentNumberPeriodKey("NONE", "2026-08"),
  "ALL"
);

console.log("documentNumber tests passed");
