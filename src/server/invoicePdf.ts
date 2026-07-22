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
  items: InvoicePdfItem[];
};

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function formatYen(value?: number | null) {
  return yen.format(Math.round(value || 0));
}

function fontPath(weight: "regular" | "bold") {
  const folder = weight === "bold" ? "700Bold" : "400Regular";
  const file = weight === "bold" ? "NotoSansJP_700Bold.ttf" : "NotoSansJP_400Regular.ttf";
  return path.join(process.cwd(), "node_modules", "@expo-google-fonts", "noto-sans-jp", folder, file);
}

function companyLines() {
  return [
    process.env.COMPANY_NAME || "アイウィル株式会社",
    process.env.COMPANY_POSTAL_CODE || "",
    process.env.COMPANY_ADDRESS || "",
    process.env.COMPANY_TEL ? `TEL ${process.env.COMPANY_TEL}` : "",
    process.env.COMPANY_INVOICE_NUMBER ? `登録番号 ${process.env.COMPANY_INVOICE_NUMBER}` : ""
  ].filter(Boolean);
}

function bankLines() {
  return [
    process.env.INVOICE_BANK_NAME || "振込先銀行を環境変数 INVOICE_BANK_NAME に設定してください",
    process.env.INVOICE_BANK_BRANCH || "",
    process.env.INVOICE_BANK_ACCOUNT || "",
    process.env.INVOICE_BANK_HOLDER || ""
  ].filter(Boolean);
}

function drawSeal(doc: PDFKit.PDFDocument, x: number, y: number) {
  const sealPath = process.env.COMPANY_SEAL_PATH || path.join(process.cwd(), "public", "company-seal.jpg");
  if (fs.existsSync(sealPath)) {
    doc.image(sealPath, x - 24, y - 24, { width: 48, height: 48 });
    return;
  }

  doc.save();
  doc.lineWidth(1.4).strokeColor("#d12b2b").fillColor("#d12b2b");
  doc.circle(x, y, 22).stroke();
  doc.font("NotoSansJPBold").fontSize(8).text("アイウィル", x - 18, y - 12, { width: 36, align: "center" });
  doc.fontSize(10).text("社印", x - 18, y + 1, { width: 36, align: "center" });
  doc.restore();
}

function drawBox(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, fill?: string) {
  if (fill) doc.rect(x, y, w, h).fillAndStroke(fill, "#111111");
  else doc.rect(x, y, w, h).stroke();
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
  doc.font("NotoSansJPBold").fontSize(22).text("請求書", 0, 42, { width: 595, align: "center" });

  doc.font("NotoSansJP").fontSize(9);
  doc.text(`請求書番号: ${input.invoiceNo || "-"}`, 380, 82, { width: 160, align: "left" });
  doc.text(`発行日: ${input.issueDate}`, 380, 100, { width: 160, align: "left" });
  if (input.dueDate) doc.text(`お支払期限: ${input.dueDate}`, 380, 118, { width: 160, align: "left" });

  doc.font("NotoSansJPBold").fontSize(12).text(`${input.customerName} 御中`, 56, 96, { width: 250 });
  doc.font("NotoSansJP").fontSize(8.5);
  if (input.customerAddress) doc.text(input.customerAddress, 56, 120, { width: 250 });
  if (input.customerInvoiceNumber) doc.text(`登録番号: ${input.customerInvoiceNumber}`, 56, 144, { width: 250 });

  const lines = companyLines();
  doc.font("NotoSansJPBold").fontSize(10).text(lines[0] || "", 360, 146, { width: 155, align: "left" });
  doc.font("NotoSansJP").fontSize(8.2);
  lines.slice(1).forEach((line, index) => doc.text(line, 360, 164 + index * 13, { width: 155 }));
  drawSeal(doc, 525, 168);

  doc.font("NotoSansJP").fontSize(10).text("下記の通りご請求申し上げます。", 56, 185, { width: 240 });
  drawBox(doc, 56, 218, 250, 42, "#eeeeee");
  doc.fillColor("#111111");
  doc.font("NotoSansJPBold").fontSize(12).text("ご請求金額", 68, 231, { width: 90 });
  doc.font("NotoSansJPBold").fontSize(16).text(`${formatYen(input.totalAmount)} 円`, 160, 226, { width: 130, align: "right" });

  const tableX = 56;
  const tableY = 292;
  const widths = [250, 55, 45, 85, 85];
  const headers = ["品名・摘要", "数量", "単位", "単価", "金額"];
  let x = tableX;
  doc.font("NotoSansJPBold").fontSize(8.5);
  headers.forEach((header, index) => {
    drawBox(doc, x, tableY, widths[index], 26, "#d9d9d9");
    doc.fillColor("#111111").text(header, x + 4, tableY + 7, { width: widths[index] - 8, align: index === 0 ? "left" : "center" });
    x += widths[index];
  });

  doc.font("NotoSansJP").fontSize(8.2);
  const rowHeight = 28;
  const visibleItems = input.items.slice(0, 12);
  for (let row = 0; row < 12; row++) {
    const item = visibleItems[row];
    let colX = tableX;
    const y = tableY + 26 + row * rowHeight;
    widths.forEach((w) => {
      drawBox(doc, colX, y, w, rowHeight);
      colX += w;
    });
    if (!item) continue;
    doc.text(item.description, tableX + 4, y + 7, { width: widths[0] - 8, lineBreak: false });
    doc.text(String(item.quantity), tableX + widths[0] + 4, y + 7, { width: widths[1] - 8, align: "right" });
    doc.text(item.unit, tableX + widths[0] + widths[1] + 4, y + 7, { width: widths[2] - 8, align: "center" });
    doc.text(formatYen(item.unitPrice), tableX + widths[0] + widths[1] + widths[2] + 4, y + 7, { width: widths[3] - 8, align: "right" });
    doc.text(formatYen(item.amount), tableX + widths[0] + widths[1] + widths[2] + widths[3] + 4, y + 7, { width: widths[4] - 8, align: "right" });
  }

  const sumX = 351;
  const sumY = tableY + 26 + 12 * rowHeight + 16;
  const labelW = 95;
  const valueW = 85;
  [
    ["小計", input.subtotal],
    ["消費税", input.taxAmount],
    ["合計", input.totalAmount]
  ].forEach(([label, amount], index) => {
    const y = sumY + index * 26;
    drawBox(doc, sumX, y, labelW, 26, index === 2 ? "#d9d9d9" : undefined);
    drawBox(doc, sumX + labelW, y, valueW, 26, index === 2 ? "#d9d9d9" : undefined);
    doc.font(index === 2 ? "NotoSansJPBold" : "NotoSansJP").fontSize(9).fillColor("#111111");
    doc.text(String(label), sumX + 5, y + 8, { width: labelW - 10 });
    doc.text(formatYen(Number(amount)), sumX + labelW + 5, y + 8, { width: valueW - 10, align: "right" });
  });

  doc.font("NotoSansJPBold").fontSize(9).text("振込先", 56, sumY, { width: 80 });
  doc.font("NotoSansJP").fontSize(8.2);
  bankLines().forEach((line, index) => doc.text(line, 56, sumY + 18 + index * 13, { width: 260 }));
  if (input.note) {
    doc.font("NotoSansJPBold").fontSize(9).text("備考", 56, 720, { width: 50 });
    doc.font("NotoSansJP").fontSize(8.2).text(input.note, 92, 720, { width: 390 });
  }

  doc.end();
  return done;
}
