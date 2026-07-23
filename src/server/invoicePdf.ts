import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type PDFKit from "pdfkit";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as typeof PDFKit;

type InvoicePdfItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
};

export type InvoicePdfInput = {
  invoiceNo?: string | null;
  period: string;
  issueDate: string;
  dueDate?: string | null;
  title: string;
  customerName: string;
  customerAddress?: string | null;
  customerInvoiceNumber?: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  note?: string | null;
  companyName?: string | null;
  companyPostalCode?: string | null;
  companyAddress?: string | null;
  companyTel?: string | null;
  companyRegistrationNo?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccount?: string | null;
  bankHolder?: string | null;
  items: InvoicePdfItem[];
};

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function formatYen(value?: number | null) {
  return yen.format(Math.round(value || 0));
}

function formatJapaneseDate(value?: string | null) {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function fontPath(weight: "regular" | "bold") {
  const folder = weight === "bold" ? "700Bold" : "400Regular";
  const file = weight === "bold" ? "NotoSansJP_700Bold.ttf" : "NotoSansJP_400Regular.ttf";
  return path.join(process.cwd(), "node_modules", "@expo-google-fonts", "noto-sans-jp", folder, file);
}

function companyLines(input: InvoicePdfInput) {
  const tel = input.companyTel || process.env.COMPANY_TEL || "";
  return [
    input.companyName || process.env.COMPANY_NAME || "アイウィル株式会社",
    input.companyPostalCode || process.env.COMPANY_POSTAL_CODE || "",
    input.companyAddress || process.env.COMPANY_ADDRESS || "",
    tel ? `TEL: ${tel}` : ""
  ]
    .flatMap((line) => line.split(/\r?\n/))
    .filter(Boolean);
}

function bankLines(input: InvoicePdfInput) {
  return [
    input.bankName || process.env.INVOICE_BANK_NAME || "振込先銀行を登録してください",
    input.bankBranch || process.env.INVOICE_BANK_BRANCH || "",
    input.bankAccount || process.env.INVOICE_BANK_ACCOUNT || "",
    input.bankHolder || process.env.INVOICE_BANK_HOLDER || ""
  ].filter(Boolean);
}

function drawSeal(doc: PDFKit.PDFDocument, x: number, y: number) {
  const sealPath = process.env.COMPANY_SEAL_PATH || path.join(process.cwd(), "public", "company-seal.jpg");
  if (fs.existsSync(sealPath)) {
    doc.save();
    doc.opacity(0.82);
    doc.image(sealPath, x - 28, y - 28, { width: 56, height: 56 });
    doc.restore();
    return;
  }

  doc.save();
  doc.opacity(0.82).lineWidth(1.4).strokeColor("#d12b2b").fillColor("#d12b2b");
  doc.circle(x, y, 24).stroke();
  doc.font("NotoSansJPBold").fontSize(8).text("アイウィル", x - 20, y - 12, { width: 40, align: "center" });
  doc.fontSize(10).text("社印", x - 20, y + 2, { width: 40, align: "center" });
  doc.restore();
}

function drawBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, fill?: string) {
  if (fill) doc.rect(x, y, w, h).fillAndStroke(fill, "#111111");
  else doc.rect(x, y, w, h).stroke();
}

function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  w: number,
  options: PDFKit.Mixins.TextOptions = {}
) {
  doc.text(text, x, y, { width: w, ...options });
}

export async function createInvoicePdf(input: InvoicePdfInput) {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: false });
  doc.registerFont("NotoSansJP", fontPath("regular"));
  doc.registerFont("NotoSansJPBold", fontPath("bold"));

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fillColor("#111111").strokeColor("#111111").lineWidth(0.8);

  const leftX = 52;
  const pageW = 595;
  const tableX = 52;
  const tableW = 500;
  const companyX = 286;
  const companyTextW = 145;
  const rightInfoX = 372;

  doc.font("NotoSansJPBold").fontSize(13);
  drawText(doc, `${input.customerName}　御中`, leftX, 70, 250);
  doc.font("NotoSansJP").fontSize(9);
  if (input.customerAddress) drawText(doc, input.customerAddress, leftX, 96, 250);
  if (input.customerInvoiceNumber) drawText(doc, `登録番号: ${input.customerInvoiceNumber}`, leftX, 116, 250);

  doc.font("NotoSansJPBold").fontSize(22);
  drawText(doc, "御　請　求　書", 0, 124, pageW, { align: "center" });

  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, `発　行　日： ${formatJapaneseDate(input.issueDate)}`, rightInfoX, 72, 170);
  drawText(doc, `請求書番号： ${input.invoiceNo || "-"}`, rightInfoX, 89, 170);
  drawText(doc, `登録番号： ${input.companyRegistrationNo || process.env.COMPANY_INVOICE_NUMBER || "-"}`, rightInfoX, 106, 170);

  const lines = companyLines(input);
  doc.font("NotoSansJPBold").fontSize(13);
  drawText(doc, lines[0] || "", companyX, 170, companyTextW);
  doc.font("NotoSansJP").fontSize(10);
  lines.slice(1).forEach((line, index) => drawText(doc, line, companyX, 205 + index * 15, 225));
  drawSeal(doc, 450, 176);

  doc.font("NotoSansJP").fontSize(11);
  drawText(doc, "毎度ありがとうございます。", leftX, 224, 230);
  drawText(doc, "下記の通りご請求申し上げます。", leftX, 242, 250);

  doc.font("NotoSansJPBold").fontSize(16);
  drawText(doc, "ご 請 求 金 額：", leftX, 286, 130);
  drawText(doc, `￥${formatYen(input.totalAmount)}`, leftX + 128, 284, 132, { align: "right" });
  doc.moveTo(leftX, 309).lineTo(leftX + 260, 309).stroke();
  doc.font("NotoSansJPBold").fontSize(12);
  drawText(doc, "お　支　払　日：", leftX, 314, 130);
  drawText(doc, formatJapaneseDate(input.dueDate), leftX + 128, 314, 132, { align: "right" });
  doc.moveTo(leftX, 334).lineTo(leftX + 260, 334).stroke();

  const approvalX = 355;
  const approvalY = 278;
  const approvalW = 178;
  const approvalH = 84;
  drawBox(doc, approvalX, approvalY, approvalW, approvalH);
  doc.moveTo(approvalX, approvalY + 18).lineTo(approvalX + approvalW, approvalY + 18).stroke();
  doc.moveTo(approvalX + approvalW / 2, approvalY).lineTo(approvalX + approvalW / 2, approvalY + approvalH).stroke();
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "承認", approvalX, approvalY + 2, approvalW / 2, { align: "center" });
  drawText(doc, "担当", approvalX + approvalW / 2, approvalY + 2, approvalW / 2, { align: "center" });

  const tableY = 380;
  const widths = [36, 220, 75, 84, 85];
  const headers = ["No", "内容", "数量(人月)", "単価", "金額"];
  const rowHeight = 15;
  const rowCount = 15;
  const totalTableH = 20 + rowCount * rowHeight + 51;
  let x = tableX;
  doc.lineWidth(1.2);
  doc.rect(tableX, tableY, tableW, totalTableH).stroke();
  doc.lineWidth(0.8);
  doc.font("NotoSansJPBold").fontSize(10);
  headers.forEach((header, index) => {
    drawText(doc, header, x + 2, tableY + 5, widths[index] - 4, { align: "center" });
    if (index > 0) doc.moveTo(x, tableY).lineTo(x, tableY + totalTableH).stroke();
    x += widths[index];
  });
  doc.moveTo(tableX, tableY + 20).lineTo(tableX + tableW, tableY + 20).stroke();

  doc.font("NotoSansJP").fontSize(9);
  const visibleItems = input.items.slice(0, rowCount);
  for (let row = 0; row < rowCount; row++) {
    const y = tableY + 20 + row * rowHeight;
    doc.save().dash(2, { space: 2 }).moveTo(tableX, y + rowHeight).lineTo(tableX + tableW, y + rowHeight).stroke().undash().restore();
    const item = visibleItems[row];
    if (!item) continue;
    drawText(doc, String(row + 1), tableX + 2, y + 3, widths[0] - 4, { align: "center" });
    drawText(doc, item.description, tableX + widths[0] + 3, y + 3, widths[1] - 6, { lineBreak: false });
    drawText(doc, formatYen(item.quantity), tableX + widths[0] + widths[1] + 3, y + 3, widths[2] - 6, { align: "right" });
    drawText(doc, `￥${formatYen(item.unitPrice)}`, tableX + widths[0] + widths[1] + widths[2] + 3, y + 3, widths[3] - 6, {
      align: "right"
    });
    drawText(doc, `￥${formatYen(item.amount)}`, tableX + widths[0] + widths[1] + widths[2] + widths[3] + 3, y + 3, widths[4] - 6, {
      align: "right"
    });
  }

  const sumStartY = tableY + 20 + rowCount * rowHeight;
  const sumLabelX = tableX + widths[0] + widths[1] + widths[2];
  const sumValueX = sumLabelX + widths[3];
  const sumRows: Array<[string, number, boolean]> = [
    ["小計", input.subtotal, false],
    ["消費税(10%)", input.taxAmount, false],
    ["合計金額", input.totalAmount, true]
  ];
  sumRows.forEach(([label, amount, bold], index) => {
    const y = sumStartY + index * 17;
    doc.moveTo(sumLabelX, y).lineTo(tableX + tableW, y).stroke();
    doc.font(bold ? "NotoSansJPBold" : "NotoSansJP").fontSize(9.5);
    drawText(doc, label, sumLabelX + 3, y + 2, widths[3] - 6, { align: "right" });
    drawText(doc, `￥${formatYen(amount)}`, sumValueX + 3, y + 2, widths[4] - 6, { align: "right" });
  });

  const bankY = tableY + totalTableH;
  drawBox(doc, tableX, bankY, tableW, 102);
  doc.font("NotoSansJPBold").fontSize(10);
  drawText(doc, "【振込先】", tableX + 38, bankY + 18, 110);
  doc.font("NotoSansJP").fontSize(10);
  const transferLines = bankLines(input);
  const transferLabels = ["銀行名称", "支店名称", "口座情報", "口座名義"];
  transferLines.forEach((line, index) => {
    const label = transferLabels[index] || "備考";
    drawText(doc, `${label}： ${line}`, tableX + 68, bankY + 36 + index * 15, 360);
  });
  if (input.note) {
    doc.font("NotoSansJPBold").fontSize(9).text("備考：", tableX + 330, bankY + 18, { width: 45 });
    doc.font("NotoSansJP").fontSize(8.5).text(input.note, tableX + 372, bankY + 18, { width: 160, height: 62 });
  }

  doc.end();
  return done;
}
