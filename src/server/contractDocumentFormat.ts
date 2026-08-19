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

export function formatReiwaDate(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return value;
  const [, rawYear, month, day] = match;
  const year = Number(rawYear);
  if (year < 2019) return formatJapaneseDate(value);
  const reiwaYear = year - 2018;
  return `令和${reiwaYear === 1 ? "元" : reiwaYear}年${Number(month)}月${Number(day)}日`;
}

export function contractReiwaPeriodText(startDate?: string | null, endDate?: string | null) {
  const start = formatReiwaDate(startDate);
  const end = formatReiwaDate(endDate);
  return end ? `${start}～${end}` : `${start}～`;
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

export function workerDocumentName(member: ContractMemberDocumentInput) {
  if (member.source === "EMPLOYEE") return member.employee?.name || "社員未設定";
  if (member.source === "EXTERNAL") return member.externalMember?.name || "外部メンバー未設定";
  return member.itemDescription || "指定なし";
}

export function memberDisplayNames(members: ContractMemberDocumentInput[]) {
  const names = members.map(workerDocumentName).filter(Boolean);
  return names.length ? names.join("、") : "指定なし";
}

export function billingTypeLabel(value: string) {
  if (value === "TIME_RANGE") return "精算時間範囲";
  if (value === "HOURLY") return "時給";
  return "定額";
}

function yenText(value?: number | null) {
  return `¥ ${Number(value || 0).toLocaleString("ja-JP")}`;
}

export function purchaseOrderFeeLines(member?: ContractMemberDocumentInput | null) {
  if (!member) return ["¥ 0"];
  const amount = yenText(member.unitPrice);
  if (member.billingType === "TIME_RANGE") {
    const lower = member.lowerLimitHours ?? "-";
    const upper = member.upperLimitHours ?? "-";
    return [
      amount,
      `${lower}h～${upper}hの範囲を基準時間とし超過控除精算します。`,
      `超過時間単価：　${yenText(member.excessHourlyRate)}-/h (月額単価${upper}h割)`,
      `控除時間単価：　${yenText(member.deductionHourlyRate)}-/h (月額単価${lower}h割)`,
      "10円未満の場合、切り捨て。",
      "月途中入退場または月3日以上休みの場合は、日割り精算とします。",
      "※作業場所までの交通費は月額委託金額に含むものとします。",
      "※業務上の都合による出張等に関する費用に別途精算致します。"
    ];
  }
  if (member.billingType === "HOURLY") {
    const upper = member.upperLimitHours ?? "-";
    return [
      `${amount} / h`,
      `営業時間${upper}hまでは上記時給を適用します。`,
      `超過時間単価：　${yenText(member.excessHourlyRate || member.unitPrice)}-/h`
    ];
  }
  return [amount];
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
