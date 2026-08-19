import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contractDocumentFileName,
  contractPartnerName,
  contractPeriodText,
  formatReiwaDate,
  memberDisplayNames,
  purchaseOrderFeeLines,
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

  it("formats dates in the Reiwa era for contract documents", () => {
    assert.equal(formatReiwaDate("2026-07-31"), "令和8年7月31日");
    assert.equal(formatReiwaDate("2019-05-01"), "令和元年5月1日");
  });

  it("builds purchase order fee lines from time range settings", () => {
    const lines = purchaseOrderFeeLines({
      source: "EXTERNAL",
      itemDescription: "通販システム開発支援",
      unitPrice: 550000,
      billingType: "TIME_RANGE",
      lowerLimitHours: 150,
      upperLimitHours: 190,
      deductionHourlyRate: 3660,
      excessHourlyRate: 2890
    });

    assert.deepEqual(lines.slice(0, 4), [
      "¥ 550,000",
      "150h～190hの範囲を基準時間とし超過控除精算します。",
      "超過時間単価：　¥ 2,890-/h (月額単価190h割)",
      "控除時間単価：　¥ 3,660-/h (月額単価150h割)"
    ]);
  });

  it("joins member names for purchase order worker row", () => {
    assert.equal(
      memberDisplayNames([
        { source: "EMPLOYEE", unitPrice: 0, billingType: "FIXED", employee: { name: "山田 太郎" } },
        { source: "EXTERNAL", unitPrice: 0, billingType: "FIXED", externalMember: { name: "田中 花子" } }
      ]),
      "山田 太郎、田中 花子"
    );
  });
});
