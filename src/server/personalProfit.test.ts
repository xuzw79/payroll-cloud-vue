import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPersonalProfit, resolveInvoicePerson } from "./personalProfit.js";

describe("personal profit", () => {
  it("separates employee and external IDs, uses net tax amounts and preserves negative adjustments", () => {
    const result = buildPersonalProfit([
      { source: "EMPLOYEE", id: "same", name: "Employee", category: "invoice", amount: 600000 },
      { source: "EMPLOYEE", id: "same", name: "Employee", category: "invoice", amount: -10000 },
      { source: "EMPLOYEE", id: "same", name: "Employee", category: "payroll", amount: 300000 },
      { source: "EMPLOYEE", id: "same", name: "Employee", category: "bonus", amount: 50000 },
      { source: "EXTERNAL", id: "same", name: "Partner", category: "partner", amount: 440000, taxMode: "INCLUSIVE", taxRate: 0.1 }
    ]);
    assert.equal(result.rows.length, 2);
    const employee = result.rows.find(row => row.source === "EMPLOYEE")!;
    assert.equal(employee.revenue, 590000);
    assert.equal(employee.cost, 350000);
    assert.equal(employee.profit, 240000);
    assert.equal(result.rows.find(row => row.source === "EXTERNAL")!.partner, 400000);
  });

  it("excludes unknown tax and unassigned records from individual profit and reports them", () => {
    const result = buildPersonalProfit([
      { source: "EMPLOYEE", id: "e1", name: "One", category: "expense", amount: 1100, taxMode: null, label: "tax unknown" },
      { category: "invoice", amount: 50000, label: "unassigned" },
      { source: "EMPLOYEE", id: "e1", name: "One", category: "revenue", amount: 2000, taxMode: "EXCLUSIVE" }
    ]);
    assert.equal(result.issues.length, 2);
    assert.equal(result.rows[0].profit, 2000);
  });

  it("does not allocate ambiguous historical invoices", () => {
    const members = [{ employeeId: "e1" }, { employeeId: "e2" }];
    assert.equal(resolveInvoicePerson({}, members), null);
    assert.deepEqual(resolveInvoicePerson({ employeeId: "e1" }, members), { source: "EMPLOYEE", id: "e1" });
    assert.deepEqual(resolveInvoicePerson({}, [{ externalMemberId: "x1" }]), { source: "EXTERNAL", id: "x1" });
  });
});
