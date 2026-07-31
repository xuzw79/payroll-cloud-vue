import assert from "node:assert/strict";
import { filterActiveMembersForPeriod, memberActiveInPeriod } from "./sesPeriod.js";

const members = [
  { id: "june", startDate: "2026-06-01", endDate: "2026-06-30" },
  { id: "july", startDate: "2026-07-01", endDate: null },
  { id: "range", startDate: "2026-06-01", endDate: "2026-07-31" },
  { id: "open", startDate: null, endDate: null }
];

assert.equal(memberActiveInPeriod(members[0], "2026-06"), true);
assert.equal(memberActiveInPeriod(members[0], "2026-07"), false);
assert.equal(memberActiveInPeriod({ startDate: "2026-08-01", endDate: null }, "2026-07"), false);
assert.deepEqual(filterActiveMembersForPeriod(members, "2026-07").map((member) => member.id), ["july", "range", "open"]);

console.log("sesPeriod tests passed");
