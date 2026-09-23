import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { payslipFixedDeductionCell } from "./pdf.js";

describe("payslipFixedDeductionCell", () => {
  it("uses the manual fixed deduction title when present", () => {
    assert.deepEqual(payslipFixedDeductionCell("貸付返済", 12000), {
      label: "貸付返済",
      value: "12,000"
    });
  });

  it("falls back to the default title when the manual title is blank", () => {
    assert.deepEqual(payslipFixedDeductionCell(" ", 5000), {
      label: "固定控除",
      value: "5,000"
    });
  });
});
