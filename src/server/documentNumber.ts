export type DocumentNumberResetType = "MONTHLY" | "YEARLY" | "NONE";

export type DocumentNumberSettings = {
  invoiceNoPattern?: string | null;
  contractNoPattern?: string | null;
  purchaseOrderNoPattern?: string | null;
  documentNumberResetType?: string | null;
  documentNumberSeqDigits?: number | null;
};

export type NormalizedDocumentNumberSettings = {
  invoiceNoPattern: string;
  contractNoPattern: string;
  purchaseOrderNoPattern: string;
  documentNumberResetType: DocumentNumberResetType;
  documentNumberSeqDigits: number;
};

export function normalizeDocumentNumberSettings(settings: DocumentNumberSettings): NormalizedDocumentNumberSettings {
  const resetType = settings.documentNumberResetType === "YEARLY" || settings.documentNumberResetType === "NONE"
    ? settings.documentNumberResetType
    : "MONTHLY";
  const seqDigits = Math.min(8, Math.max(1, Math.trunc(Number(settings.documentNumberSeqDigits || 3))));
  return {
    invoiceNoPattern: settings.invoiceNoPattern || "{YYYYMM}-{SEQ3}",
    contractNoPattern: settings.contractNoPattern || "CON-{YYYY}-{SEQ3}",
    purchaseOrderNoPattern: settings.purchaseOrderNoPattern || "PO-{YYYYMM}-{SEQ3}",
    documentNumberResetType: resetType,
    documentNumberSeqDigits: seqDigits
  };
}

export function documentNumberPeriodKey(resetType: DocumentNumberResetType, period: string) {
  const [year, month] = period.split("-");
  if (resetType === "NONE") return "ALL";
  if (resetType === "YEARLY") return year;
  return `${year}${month}`;
}

export function formatDocumentNumber(pattern: string, period: string, seq: number, defaultSeqDigits = 3) {
  const [year, month] = period.split("-");
  const yy = year.slice(-2);
  return pattern
    .replaceAll("{YYYYMM}", `${year}${month}`)
    .replaceAll("{YYYY}", year)
    .replaceAll("{YY}", yy)
    .replaceAll("{MM}", month)
    .replaceAll("{SEQ}", String(seq).padStart(defaultSeqDigits, "0"))
    .replace(/\{SEQ(\d+)\}/g, (_match, digits) => String(seq).padStart(Number(digits), "0"));
}
