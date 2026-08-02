import assert from "node:assert/strict";
import {
  activePartnerCostRows,
  filterActivePartnerCostsForOwnPeriod,
  partnerCostDefaultAmount
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

console.log("partnerCostRules tests passed");
