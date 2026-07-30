import assert from "node:assert/strict";
import {
  initialPayrollPeriod,
  isPayrollLockedPeriod,
  payrollLockMessage,
  type PayrollPeriodSettings
} from "./payrollPeriod.js";

const defaultSettings: PayrollPeriodSettings = {
  payrollPeriodType: "PREVIOUS_MONTH",
  payrollPayDay: 25,
  payrollClosingDay: 31,
  payrollInitialSwitchDay: 25,
  payrollLockDay: 28,
  payrollLockEnabled: true,
  payrollForceUpdateEnabled: true,
  payrollLockTarget: "PAYROLL_AND_BONUS"
};

assert.equal(initialPayrollPeriod({ year: 2026, month: 7, day: 25 }, defaultSettings), "2026-06");
assert.equal(initialPayrollPeriod({ year: 2026, month: 7, day: 26 }, defaultSettings), "2026-07");
assert.equal(initialPayrollPeriod({ year: 2026, month: 1, day: 25 }, defaultSettings), "2025-12");

assert.equal(isPayrollLockedPeriod("2026-06", { year: 2026, month: 7, day: 28 }, defaultSettings, "PAYROLL"), true);
assert.equal(isPayrollLockedPeriod("2026-07", { year: 2026, month: 7, day: 28 }, defaultSettings, "PAYROLL"), false);
assert.equal(isPayrollLockedPeriod("2026-06", { year: 2026, month: 7, day: 27 }, defaultSettings, "PAYROLL"), false);
assert.equal(isPayrollLockedPeriod("2026-06", { year: 2026, month: 7, day: 28 }, { ...defaultSettings, payrollLockEnabled: false }, "PAYROLL"), false);
assert.equal(isPayrollLockedPeriod("2026-06", { year: 2026, month: 7, day: 28 }, { ...defaultSettings, payrollLockTarget: "BONUS" }, "PAYROLL"), false);

assert.equal(
  payrollLockMessage("2026-06", defaultSettings, "PAYROLL"),
  "2026-06の給与データは28日以降ロックされています。変更する場合は「強制変更して保存」を押してください。"
);
assert.equal(
  payrollLockMessage("2026-06", { ...defaultSettings, payrollForceUpdateEnabled: false }, "BONUS"),
  "2026-06の賞与データは28日以降ロックされています。"
);

console.log("payrollPeriod tests passed");
