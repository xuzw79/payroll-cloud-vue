import assert from "node:assert/strict";
import { invoiceFileName, timeAdjustmentDescription } from "./invoiceFormat.js";

assert.equal(
  timeAdjustmentDescription("大村紙業株式会社保守サポート", "EXCESS", 183, "上限", 180),
  "大村紙業株式会社保守サポート 超過時間"
);
assert.equal(
  timeAdjustmentDescription("大村紙業株式会社保守サポート", "DEDUCTION", 130, "下限", 140),
  "大村紙業株式会社保守サポート 控除時間"
);
assert.equal(invoiceFileName("株式会社サンプル", "2026-07"), "請求書_株式会社サンプル御中_202607.pdf");

console.log("invoiceFormat tests passed");
