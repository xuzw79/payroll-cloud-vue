import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { employeeActiveInPayrollPeriod } from "./employeePeriod.js";

describe("employeeActiveInPayrollPeriod", () => {
  it("keeps an employee in the retirement month", () => {
    assert.equal(employeeActiveInPayrollPeriod({ retirementDate: "2026-06-30" }, "2026-06"), true);
  });

  it("excludes an employee after the retirement month", () => {
    assert.equal(employeeActiveInPayrollPeriod({ retirementDate: "2026-06-30" }, "2026-07"), false);
  });

  it("keeps an employee without retirement date", () => {
    assert.equal(employeeActiveInPayrollPeriod({ retirementDate: null }, "2026-07"), true);
  });
});
