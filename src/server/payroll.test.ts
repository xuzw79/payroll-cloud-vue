import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculatePayroll } from "./payroll.js";

const baseInput = {
  payType: "MONTHLY" as const,
  basePay: 320000,
  workHours: 160,
  overtimeHours: 10,
  allowance: 0,
  fixedOvertimeAllowance: 0,
  fixedDeduction: 0,
  overtimeRate: 1.25,
  incomeTaxRate: 0,
  healthInsuranceRate: 0,
  pensionInsuranceRate: 0,
  childCareSupportRate: 0,
  employmentInsuranceRate: 0,
  socialInsuranceEnrolled: false,
  employmentInsuranceEnrolled: false
};

describe("calculatePayroll", () => {
  it("uses the conventional overtime rate when overtime hourly amount is not set", () => {
    const result = calculatePayroll(baseInput);

    assert.equal(result.overtimePay, 25000);
    assert.equal(result.grossPay, 345000);
  });

  it("uses employee overtime hourly amount when it is set", () => {
    const result = calculatePayroll({
      ...baseInput,
      overtimeHourlyAmount: 3000
    });

    assert.equal(result.overtimePay, 30000);
    assert.equal(result.grossPay, 350000);
  });
});
