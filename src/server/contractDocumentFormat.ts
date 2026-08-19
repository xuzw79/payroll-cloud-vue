export type ContractPartnerInput = {
  customer?: { name?: string | null } | null;
  manualCustomerName?: string | null;
};

export type ContractMemberDocumentInput = {
  source: string;
  itemDescription?: string | null;
  unitPrice: number;
  billingType: string;
  lowerLimitHours?: unknown;
  upperLimitHours?: unknown;
  deductionHourlyRate?: number | null;
  excessHourlyRate?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  employee?: { name?: string | null } | null;
  externalMember?: { name?: string | null; customer?: { name?: string | null } | null } | null;
};

export function safeContractFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

export function contractPartnerName(input: ContractPartnerInput) {
  return input.customer?.name || input.manualCustomerName || "取引先未設定";
}

export function contractDocumentFileName(partnerName: string, contractNo?: string | null) {
  return `契約書_${safeContractFilePart(partnerName)}_${safeContractFilePart(contractNo || "契約番号なし")}.pdf`;
}

export function purchaseOrderFileName(partnerName: string, period: string) {
  return `発注書_${safeContractFilePart(partnerName)}_${period.replace("-", "")}.pdf`;
}

export function formatJapaneseDate(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function contractPeriodText(startDate?: string | null, endDate?: string | null) {
  const start = formatJapaneseDate(startDate);
  const end = formatJapaneseDate(endDate);
  return end ? `${start} ～ ${end}` : `${start} ～`;
}

export function memberDocumentName(member: ContractMemberDocumentInput) {
  if (member.itemDescription) return member.itemDescription;
  if (member.source === "EMPLOYEE") return member.employee?.name || "社員未設定";
  if (member.source === "EXTERNAL") {
    const company = member.externalMember?.customer?.name;
    const name = member.externalMember?.name || "外部メンバー未設定";
    return company ? `${company} / ${name}` : name;
  }
  return "指定なし";
}

export function billingTypeLabel(value: string) {
  if (value === "TIME_RANGE") return "精算時間範囲";
  if (value === "HOURLY") return "時給";
  return "定額";
}

export function memberConditionText(member: ContractMemberDocumentInput) {
  const conditions = [`単価: ${Number(member.unitPrice || 0).toLocaleString("ja-JP")}円`];
  if (member.billingType === "TIME_RANGE") {
    conditions.push(`精算: ${member.lowerLimitHours ?? "-"}h ～ ${member.upperLimitHours ?? "-"}h`);
    conditions.push(`控除時給: ${Number(member.deductionHourlyRate || 0).toLocaleString("ja-JP")}円`);
    conditions.push(`超過時給: ${Number(member.excessHourlyRate || 0).toLocaleString("ja-JP")}円`);
  }
  if (member.billingType === "HOURLY") {
    conditions.push(`営業時間: ${member.upperLimitHours ?? "-"}h`);
    conditions.push(`超過時給: ${Number(member.excessHourlyRate || member.unitPrice || 0).toLocaleString("ja-JP")}円`);
  }
  const period = contractPeriodText(member.startDate, member.endDate);
  if (period.trim() !== "～") conditions.push(`期間: ${period}`);
  return conditions.join(" / ");
}
