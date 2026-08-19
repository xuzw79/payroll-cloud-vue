import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMonthlyChecklist } from "./monthlyChecklist.js";

describe("buildMonthlyChecklist", () => {
  it("detects missing monthly payroll and scheduled bonus only for target month", () => {
    const result = buildMonthlyChecklist({
      period: "2026-07",
      employees: [
        { id: "e1", employeeNo: "E001", name: "A", isActive: true, bonusEnabled: true, bonusSchedules: [{ month: 7, amount: 100000 }] },
        { id: "e2", employeeNo: "E002", name: "B", isActive: true, bonusEnabled: true, bonusSchedules: [{ month: 8, amount: 100000 }] }
      ],
      payrolls: [{ employeeId: "e2" }],
      bonuses: [],
      salesContracts: [],
      purchaseContracts: [],
      invoices: [],
      partnerCosts: [],
      confirmations: [],
      revenues: [],
      expenses: []
    });

    assert.deepEqual(result.items.find((item) => item.key === "PAYROLL_MISSING")?.details, ["E001 A"]);
    assert.deepEqual(result.items.find((item) => item.key === "BONUS_MISSING")?.details, ["E001 A"]);
  });

  it("detects missing invoices, missing invoice PDFs, and active purchase partner costs", () => {
    const result = buildMonthlyChecklist({
      period: "2026-07",
      employees: [],
      payrolls: [],
      bonuses: [],
      salesContracts: [
        { id: "sales1", title: "Sales One", contractNo: "S-001", customer: { name: "A社" }, members: [] },
        { id: "sales2", title: "Sales Two", contractNo: "S-002", customer: { name: "B社" }, members: [] }
      ],
      purchaseContracts: [
        {
          id: "purchase1",
          title: "Purchase One",
          contractNo: "P-001",
          customer: { name: "C社" },
          members: [
            { id: "m1", source: "EXTERNAL", externalMember: { name: "田中", customer: { name: "C社" } }, startDate: "2026-06-01", endDate: "2026-07-31" },
            { id: "m2", source: "EXTERNAL", externalMember: { name: "終了済", customer: { name: "C社" } }, startDate: "2026-06-01", endDate: "2026-06-30" }
          ]
        }
      ],
      invoices: [{ id: "i1", contractId: "sales1", invoiceNo: "202607-001", title: "Sales One", pdfDownloadedAt: null }],
      partnerCosts: [],
      confirmations: [],
      revenues: [],
      expenses: []
    });

    assert.deepEqual(result.items.find((item) => item.key === "INVOICE_MISSING")?.details, ["S-002 Sales Two / B社"]);
    assert.deepEqual(result.items.find((item) => item.key === "INVOICE_PDF_MISSING")?.details, ["202607-001 Sales One"]);
    assert.deepEqual(result.items.find((item) => item.key === "PARTNER_COST_MISSING")?.details, ["P-001 Purchase One / C社 田中"]);
  });

  it("marks individual revenue and expense check as ok when confirmed", () => {
    const result = buildMonthlyChecklist({
      period: "2026-07",
      employees: [],
      payrolls: [],
      bonuses: [],
      salesContracts: [],
      purchaseContracts: [],
      invoices: [],
      partnerCosts: [],
      confirmations: [{ checkKey: "INDIVIDUAL_REVENUE_EXPENSE", confirmedAt: "2026-08-01T00:00:00.000Z", confirmedByName: "Admin" }],
      revenues: [{ id: "r1" }],
      expenses: [{ id: "x1" }]
    });

    const item = result.items.find((value) => value.key === "INDIVIDUAL_REVENUE_EXPENSE");
    assert.equal(item?.status, "OK");
    assert.equal(item?.count, 2);
    assert.equal(item?.confirmedByName, "Admin");
  });
});
