import assert from "node:assert/strict";
import { auditJson, auditSummary } from "./auditLog.js";

assert.equal(
  auditSummary({ actorName: "管理者", targetType: "PAYROLL", action: "UPDATE", targetLabel: "2026-07 許 増旺" }),
  "管理者 が 給与 2026-07 許 増旺 を更新しました"
);
assert.equal(
  auditSummary({ actorName: "経理担当", targetType: "INVOICE", action: "DELETE", targetLabel: "2026-07 請求書001" }),
  "経理担当 が 請求書 2026-07 請求書001 を削除しました"
);
assert.deepEqual(
  auditJson({ createdAt: new Date("2026-08-17T00:00:00.000Z"), amount: 1000 }),
  { createdAt: "2026-08-17T00:00:00.000Z", amount: 1000 }
);
assert.equal(auditJson(undefined), undefined);

console.log("auditLog tests passed");
