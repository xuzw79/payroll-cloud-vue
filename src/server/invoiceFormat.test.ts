import assert from "node:assert/strict";
import { invoiceBankRows, invoiceFileName, timeAdjustmentDescription } from "./invoiceFormat.js";

assert.equal(
  timeAdjustmentDescription("大村紙業株式会社保守サポート", "EXCESS", 183, "上限", 180),
  "大村紙業株式会社保守サポート 超過時間"
);
assert.equal(
  timeAdjustmentDescription("大村紙業株式会社保守サポート", "DEDUCTION", 130, "下限", 140),
  "大村紙業株式会社保守サポート 控除時間"
);
assert.equal(invoiceFileName("株式会社サンプル", "2026-07"), "請求書_株式会社サンプル御中_202607.pdf");

assert.deepEqual(
  invoiceBankRows({
    bankName: "みずほ銀行(0001)",
    bankBranch: "鷺沼支店(379)",
    bankAccount: "普通 2319709",
    bankHolder: "アイウィル(カ"
  }),
  [
    ["銀行名称", "みずほ銀行(0001)"],
    ["支店名称", "鷺沼支店(379)"],
    ["口座種別", "普通"],
    ["口座番号", "2319709"],
    ["口座名義", "アイウィル(カ"]
  ]
);

assert.deepEqual(
  invoiceBankRows({
    bankName: "みずほ銀行(0001)",
    bankBranch: "鷺沼支店(379)",
    bankAccount: "2319709",
    bankHolder: "アイウィル(カ"
  }).slice(2, 4),
  [
    ["口座種別", "普通"],
    ["口座番号", "2319709"]
  ]
);

console.log("invoiceFormat tests passed");
