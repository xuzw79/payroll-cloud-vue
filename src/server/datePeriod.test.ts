import assert from "node:assert/strict";
import { previousYearMonth, tokyoCurrentYearMonth, tokyoTodayIso } from "./datePeriod.js";

const earlyMorningTokyo = new Date("2026-07-31T15:30:00.000Z");

assert.equal(tokyoTodayIso(earlyMorningTokyo), "2026-08-01");
assert.equal(tokyoCurrentYearMonth(earlyMorningTokyo), "2026-08");
assert.equal(previousYearMonth("2026-08"), "2026-07");
assert.equal(previousYearMonth("2026-01"), "2025-12");

console.log("datePeriod tests passed");
