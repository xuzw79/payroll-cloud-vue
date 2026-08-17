import type { AuditAction, AuditTargetType, PrismaClient } from "@prisma/client";
import type { SessionUser } from "./auth.js";

const targetLabels: Record<AuditTargetType, string> = {
  EMPLOYEE: "社員",
  PAYROLL: "給与",
  BONUS: "賞与",
  INVOICE: "請求書",
  PARTNER_COST: "外注費"
};

const actionLabels: Record<AuditAction, string> = {
  CREATE: "登録",
  UPDATE: "更新",
  DELETE: "削除",
  RESTORE: "復元"
};

export function auditSummary(input: {
  actorName: string;
  targetType: AuditTargetType;
  action: AuditAction;
  targetLabel: string;
}) {
  return `${input.actorName} が ${targetLabels[input.targetType]} ${input.targetLabel} を${actionLabels[input.action]}しました`;
}

export function auditJson(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as object;
}

export async function writeAuditLog(
  prisma: PrismaClient,
  input: {
    user: SessionUser;
    targetType: AuditTargetType;
    targetId: string;
    targetLabel: string;
    action: AuditAction;
    before?: unknown;
    after?: unknown;
  }
) {
  const summary = auditSummary({
    actorName: input.user.name,
    targetType: input.targetType,
    action: input.action,
    targetLabel: input.targetLabel
  });
  await prisma.auditLog.create({
    data: {
      actorUserId: input.user.id,
      actorName: input.user.name,
      actorEmail: input.user.email,
      targetType: input.targetType,
      targetId: input.targetId,
      targetLabel: input.targetLabel,
      action: input.action,
      summary,
      beforeData: auditJson(input.before),
      afterData: auditJson(input.after)
    }
  });
}
