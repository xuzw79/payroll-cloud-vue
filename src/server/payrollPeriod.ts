export type PayrollPeriodType = "CURRENT_MONTH" | "PREVIOUS_MONTH";
export type PayrollLockTarget = "PAYROLL" | "BONUS" | "PAYROLL_AND_BONUS";

export type DateParts = {
  year: number;
  month: number;
  day: number;
};

export type PayrollPeriodSettings = {
  payrollPeriodType?: string | null;
  payrollPayDay?: number | null;
  payrollClosingDay?: number | null;
  payrollInitialSwitchDay?: number | null;
  payrollLockDay?: number | null;
  payrollLockEnabled?: boolean | null;
  payrollForceUpdateEnabled?: boolean | null;
  payrollLockTarget?: string | null;
};

export const defaultPayrollPeriodSettings = {
  payrollPeriodType: "PREVIOUS_MONTH",
  payrollPayDay: 25,
  payrollClosingDay: 31,
  payrollInitialSwitchDay: 25,
  payrollLockDay: 28,
  payrollLockEnabled: true,
  payrollForceUpdateEnabled: true,
  payrollLockTarget: "PAYROLL_AND_BONUS"
} satisfies Required<Record<keyof PayrollPeriodSettings, string | number | boolean>>;

function clampDay(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(31, Math.max(1, Math.trunc(parsed)));
}

export function normalizePayrollPeriodSettings(settings: PayrollPeriodSettings = {}) {
  const payrollPeriodType = settings.payrollPeriodType === "CURRENT_MONTH" ? "CURRENT_MONTH" : "PREVIOUS_MONTH";
  const payrollLockTarget = ["PAYROLL", "BONUS", "PAYROLL_AND_BONUS"].includes(String(settings.payrollLockTarget))
    ? String(settings.payrollLockTarget) as PayrollLockTarget
    : "PAYROLL_AND_BONUS";
  return {
    payrollPeriodType,
    payrollPayDay: clampDay(settings.payrollPayDay, defaultPayrollPeriodSettings.payrollPayDay),
    payrollClosingDay: clampDay(settings.payrollClosingDay, defaultPayrollPeriodSettings.payrollClosingDay),
    payrollInitialSwitchDay: clampDay(settings.payrollInitialSwitchDay, defaultPayrollPeriodSettings.payrollInitialSwitchDay),
    payrollLockDay: clampDay(settings.payrollLockDay, defaultPayrollPeriodSettings.payrollLockDay),
    payrollLockEnabled: settings.payrollLockEnabled !== false,
    payrollForceUpdateEnabled: settings.payrollForceUpdateEnabled !== false,
    payrollLockTarget
  };
}

export function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function previousMonthPeriod(parts: DateParts) {
  return parts.month === 1 ? formatYearMonth(parts.year - 1, 12) : formatYearMonth(parts.year, parts.month - 1);
}

export function currentPeriod(parts: DateParts) {
  return formatYearMonth(parts.year, parts.month);
}

export function initialPayrollPeriod(parts: DateParts, settings: PayrollPeriodSettings = {}) {
  const normalized = normalizePayrollPeriodSettings(settings);
  if (normalized.payrollPeriodType === "CURRENT_MONTH") return currentPeriod(parts);
  return parts.day <= normalized.payrollInitialSwitchDay ? previousMonthPeriod(parts) : currentPeriod(parts);
}

export function isPayrollLockedPeriod(
  period: string,
  parts: DateParts,
  settings: PayrollPeriodSettings = {},
  target: "PAYROLL" | "BONUS" = "PAYROLL"
) {
  const normalized = normalizePayrollPeriodSettings(settings);
  if (!normalized.payrollLockEnabled) return false;
  if (normalized.payrollLockTarget !== "PAYROLL_AND_BONUS" && normalized.payrollLockTarget !== target) return false;
  return parts.day >= normalized.payrollLockDay && period < currentPeriod(parts);
}

export function payrollLockMessage(period: string, settings: PayrollPeriodSettings = {}, target: "PAYROLL" | "BONUS" = "PAYROLL") {
  const normalized = normalizePayrollPeriodSettings(settings);
  const label = target === "BONUS" ? "\u8cde\u4e0e" : "\u7d66\u4e0e";
  const base = `${period}\u306e${label}\u30c7\u30fc\u30bf\u306f${normalized.payrollLockDay}\u65e5\u4ee5\u964d\u30ed\u30c3\u30af\u3055\u308c\u3066\u3044\u307e\u3059\u3002`;
  return normalized.payrollForceUpdateEnabled
    ? `${base}\u5909\u66f4\u3059\u308b\u5834\u5408\u306f\u300c\u5f37\u5236\u5909\u66f4\u3057\u3066\u4fdd\u5b58\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002`
    : base;
}
