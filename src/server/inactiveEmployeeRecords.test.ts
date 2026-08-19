import assert from "node:assert/strict";
import { inactiveEmployeeRecords } from "./inactiveEmployeeRecords.js";

const activeEmployee = { id: "e1", employeeNo: "E001", name: "Active", isActive: true };
const inactiveEmployee = { id: "e2", employeeNo: "E002", name: "Inactive", isActive: false };

const rows = inactiveEmployeeRecords({
  payrolls: [
    { id: "p1", period: "2026-07", netPay: 1000, employee: activeEmployee },
    { id: "p2", period: "2026-07", netPay: 2000, employee: inactiveEmployee }
  ],
  bonuses: [
    { id: "b1", period: "2026-07", netPay: 3000, employee: inactiveEmployee }
  ]
});

assert.deepEqual(rows.map((row) => `${row.kind}:${row.id}:${row.employeeName}:${row.amount}`), [
  "payroll:p2:Inactive:2000",
  "bonus:b1:Inactive:3000"
]);

console.log("inactiveEmployeeRecords tests passed");
