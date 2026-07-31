import assert from "node:assert/strict";
import { refreshKeysForSesSubMenu } from "./sesRefreshPlan.js";

assert.deepEqual(refreshKeysForSesSubMenu("customers"), ["customers"]);
assert.deepEqual(refreshKeysForSesSubMenu("projects"), ["customers", "contracts", "masterData"]);
assert.deepEqual(refreshKeysForSesSubMenu("invoices"), ["customers", "contracts", "invoices"]);
assert.deepEqual(refreshKeysForSesSubMenu("partnerCosts"), ["partnerCosts"]);
assert.deepEqual(refreshKeysForSesSubMenu("revenue"), ["customers", "contracts", "masterData", "revenues"]);
assert.deepEqual(refreshKeysForSesSubMenu("profit"), ["revenues"]);
assert.deepEqual(refreshKeysForSesSubMenu("masters"), []);

console.log("sesRefreshPlan tests passed");
