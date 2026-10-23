import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateBonus } from "./payroll.js";

const input = {
  bonusAmount: 4500000,
  incomeTaxRate: 0,
  healthInsuranceRate: 0.05,
  pensionInsuranceRate: 0.0915,
  childCareSupportRate: 0.00115,
  employmentInsuranceRate: 0.005
};

describe("bonus insurance limits", () => {
  it("caps pension at 1.5 million while health and employment use their own bases", () => {
    const result = calculateBonus(input);
    assert.equal(result.pensionInsurance, 137250);
    assert.equal(result.healthInsurance, 225000);
    assert.equal(result.employmentInsurance, 22500);
    assert.equal(result.totalDeduction, result.socialInsurance + result.employmentInsurance);
  });

  it("uses only the remaining annual health insurance allowance", () => {
    const result = calculateBonus({ ...input, priorStandardBonusAmount: 2000000 });
    assert.equal(result.healthInsurance, 186500);
    assert.equal(result.childCareSupport, 4290);
    assert.equal(result.pensionInsurance, 137250);
  });

  it("truncates the insurance base to thousands, including manual bases", () => {
    const result = calculateBonus({ ...input, socialInsuranceBaseAmount: 1000999 });
    assert.equal(result.healthInsurance, 50000);
    assert.equal(result.pensionInsurance, 91500);
  });

  it("charges no health insurance after the annual cap and respects unenrolled flags", () => {
    assert.equal(calculateBonus({ ...input, priorStandardBonusAmount: 5730000 }).healthInsurance, 0);
    const result = calculateBonus({ ...input, socialInsuranceEnrolled: false, employmentInsuranceEnrolled: false });
    assert.equal(result.socialInsurance, 0);
    assert.equal(result.employmentInsurance, 0);
  });
});
