import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contractDocumentFileName,
  contractPartnerName,
  contractPeriodText,
  purchaseOrderFileName
} from "./contractDocumentFormat.js";

describe("contractDocumentFormat", () => {
  it("uses customer name before manual customer name", () => {
    assert.equal(contractPartnerName({ customer: { name: "株式会社A" }, manualCustomerName: "手入力B" }), "株式会社A");
    assert.equal(contractPartnerName({ customer: null, manualCustomerName: "手入力B" }), "手入力B");
  });

  it("formats contract and purchase order file names", () => {
    assert.equal(contractDocumentFileName("株式会社A", "CON-2026-001"), "契約書_株式会社A_CON-2026-001.pdf");
    assert.equal(purchaseOrderFileName("株式会社A", "2026-07"), "発注書_株式会社A_202607.pdf");
  });

  it("formats contract period", () => {
    assert.equal(contractPeriodText("2026-07-01", "2026-07-31"), "2026年7月1日 ～ 2026年7月31日");
    assert.equal(contractPeriodText("2026-07-01", null), "2026年7月1日 ～");
  });
});
