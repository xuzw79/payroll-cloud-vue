import assert from "node:assert/strict";
import {
  activePartnerCostRows,
  filterActivePartnerCostsForOwnPeriod,
  partnerCostDefaultAmount,
  planPartnerCostRepair
} from "./partnerCostRules.js";

const contracts = [
  {
    id: "purchase-a",
    members: [
      { id: "june-only", unitPrice: 400000, startDate: "2026-06-01", endDate: "2026-06-30" },
      { id: "july-active", unitPrice: 440000, startDate: "2026-07-01", endDate: null },
      { id: "open", unitPrice: 200000, startDate: null, endDate: null }
    ]
  }
];

assert.deepEqual(
  activePartnerCostRows(contracts, "2026-07").map((row) => row.member.id),
  ["july-active", "open"]
);

assert.deepEqual(
  filterActivePartnerCostsForOwnPeriod([
    { id: "old-cost", period: "2026-07", amount: 400000, contractMember: contracts[0].members[0] },
    { id: "current-cost", period: "2026-07", amount: 440000, contractMember: contracts[0].members[1] },
    { id: "missing-member", period: "2026-07", amount: 100000, contractMember: null }
  ]).map((cost) => cost.id),
  ["current-cost"]
);

assert.equal(partnerCostDefaultAmount(400000, false), 440000);
assert.equal(partnerCostDefaultAmount(440000, true), 440000);

assert.deepEqual(
  planPartnerCostRepair([
    {
      id: "inactive-old-member",
      period: "2026-07",
      contractId: "purchase-a",
      contractMemberId: "june-only",
      employeeId: "employee-a",
      externalMemberId: null,
      title: "営業支援コンサル",
      updatedAt: "2026-08-01T00:00:00.000Z",
      contractMember: { id: "june-only", startDate: "2026-06-01", endDate: "2026-06-30" }
    },
    {
      id: "active-new-member",
      period: "2026-07",
      contractId: "purchase-a",
      contractMemberId: "july-active",
      employeeId: "employee-a",
      externalMemberId: null,
      title: "営業支援コンサル",
      updatedAt: "2026-08-02T00:00:00.000Z",
      contractMember: { id: "july-active", startDate: "2026-07-01", endDate: null }
    },
    {
      id: "target-month-outside",
      period: "2026-07",
      contractId: "purchase-b",
      contractMemberId: "ended",
      employeeId: null,
      externalMemberId: "external-a",
      title: "OUT開発支援",
      updatedAt: "2026-08-02T00:00:00.000Z",
      contractMember: { id: "ended", startDate: "2026-06-01", endDate: "2026-06-30" }
    }
  ]),
  {
    scannedCount: 3,
    keepIds: ["active-new-member"],
    deactivateIds: ["inactive-old-member", "target-month-outside"],
    changedGroupCount: 2
  }
);

assert.deepEqual(
  planPartnerCostRepair([
    {
      id: "old-contract-cost",
      period: "2026-06",
      contractId: "old-contract",
      contractMemberId: "old-member",
      employeeId: null,
      externalMemberId: "external-a",
      title: "OUT開発支援",
      updatedAt: "2026-07-01T00:00:00.000Z",
      contractMember: { id: "old-member", startDate: "2026-06-01", endDate: "2026-06-30" }
    },
    {
      id: "new-contract-cost",
      period: "2026-06",
      contractId: "new-contract",
      contractMemberId: "new-member",
      employeeId: null,
      externalMemberId: "external-a",
      title: "OUT開発支援",
      updatedAt: "2026-07-02T00:00:00.000Z",
      contractMember: { id: "new-member", startDate: "2026-06-01", endDate: "2026-06-30" }
    }
  ]),
  {
    scannedCount: 2,
    keepIds: ["new-contract-cost"],
    deactivateIds: ["old-contract-cost"],
    changedGroupCount: 1
  }
);

console.log("partnerCostRules tests passed");
