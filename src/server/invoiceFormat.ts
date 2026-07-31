export type TimeAdjustmentType = "EXCESS" | "DEDUCTION";

export function timeAdjustmentDescription(
  baseDescription: string,
  type: TimeAdjustmentType,
  workHours: number,
  limitLabel: string,
  limitHours: number
) {
  const label = type === "EXCESS" ? "超過時間" : "控除時間";
  return `${baseDescription} ${label}（${workHours}h / ${limitLabel}${limitHours}h）`;
}

export function safeInvoiceFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

export function invoiceFileName(customerName: string, period: string) {
  return `請求書_${safeInvoiceFilePart(customerName)}御中_${period.replace("-", "")}.pdf`;
}
