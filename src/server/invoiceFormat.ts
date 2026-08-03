export type TimeAdjustmentType = "EXCESS" | "DEDUCTION";

export function timeAdjustmentDescription(
  baseDescription: string,
  type: TimeAdjustmentType,
  _workHours: number,
  _limitLabel: string,
  _limitHours: number
) {
  const label = type === "EXCESS" ? "\u8d85\u904e\u6642\u9593" : "\u63a7\u9664\u6642\u9593";
  return `${baseDescription} ${label}`;
}

export function safeInvoiceFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

export function invoiceFileName(customerName: string, period: string) {
  return `\u8acb\u6c42\u66f8_${safeInvoiceFilePart(customerName)}\u5fa1\u4e2d_${period.replace("-", "")}.pdf`;
}

export type InvoiceBankInput = {
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccount?: string | null;
  bankHolder?: string | null;
};

function splitBankAccount(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw) return { accountType: "", accountNumber: "" };
  const ordinary = "\u666e\u901a";
  const checking = "\u5f53\u5ea7";
  const savings = "\u8caf\u84c4";
  const normalized = raw.replace(/[\uff0f/]/g, " ").replace(/\s+/g, " ");
  const match = normalized.match(new RegExp(`^(${ordinary}|${checking}|${savings})\\s*(.+)$`));
  if (match) return { accountType: match[1], accountNumber: match[2].trim() };
  return { accountType: ordinary, accountNumber: raw };
}

export function invoiceBankRows(input: InvoiceBankInput): Array<[string, string]> {
  const { accountType, accountNumber } = splitBankAccount(input.bankAccount);
  const rows: Array<[string, string]> = [
    ["\u9280\u884c\u540d\u79f0", input.bankName || process.env.INVOICE_BANK_NAME || "\u632f\u8fbc\u5148\u9280\u884c\u3092\u767b\u9332\u3057\u3066\u304f\u3060\u3055\u3044"],
    ["\u652f\u5e97\u540d\u79f0", input.bankBranch || process.env.INVOICE_BANK_BRANCH || ""],
    ["\u53e3\u5ea7\u7a2e\u5225", accountType],
    ["\u53e3\u5ea7\u756a\u53f7", accountNumber || process.env.INVOICE_BANK_ACCOUNT || ""],
    ["\u53e3\u5ea7\u540d\u7fa9", input.bankHolder || process.env.INVOICE_BANK_HOLDER || ""]
  ];
  return rows.filter(([, value]) => Boolean(value));
}
