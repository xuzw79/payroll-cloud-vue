import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expenseAccountOptions, expenseRowsToSave } from "./expenseAccounts.js";

describe("expenseAccountOptions", () => {
  it("contains only expense account titles for expense registration", () => {
    const codes = expenseAccountOptions.map((account) => account.code);

    assert.equal(codes.includes(1), false);
    assert.equal(codes.includes(2), false);
    assert.equal(codes.includes(3), false);
    assert.equal(codes.includes(22), false);
    assert.equal(codes.includes(5), true);
    assert.equal(codes.includes(24), true);
  });
});

describe("expenseRowsToSave", () => {
  it("keeps filled rows and ignores empty rows", () => {
    assert.deepEqual(expenseRowsToSave([
      { expenseDate: "2026-08-01", accountCode: 5, amount: 1200, memo: "電車" },
      { expenseDate: "", accountCode: null, amount: 0, memo: "" },
      { expenseDate: "2026-08-02", accountCode: 13, amount: 3000, memo: "" }
    ]), [
      { expenseDate: "2026-08-01", accountCode: 5, amount: 1200, memo: "電車" },
      { expenseDate: "2026-08-02", accountCode: 13, amount: 3000, memo: "" }
    ]);
  });
});
