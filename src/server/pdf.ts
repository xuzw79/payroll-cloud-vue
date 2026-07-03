import { createRequire } from "node:module";
import path from "node:path";
import type PDFKit from "pdfkit";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as typeof PDFKit;

type PayslipPdfInput = {
  period: string;
  employeeNo: string;
  employeeName: string;
  payType: string;
  regularPay: number;
  overtimePay: number;
  allowance: number;
  grossPay: number;
  incomeTax: number;
  healthInsurance: number;
  pensionInsurance: number;
  childCareSupport: number;
  socialInsurance: number;
  employmentInsurance: number;
  residentTax: number;
  dormitoryFee: number;
  fixedDeduction: number;
  totalDeduction: number;
  netPay: number;
  taxableIncome?: number | null;
};

type Cell = {
  label: string;
  value?: string | number;
  highlight?: boolean;
  bold?: boolean;
  blank?: boolean;
};

const yen = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0
});

function formatYen(value?: number | null) {
  return yen.format(Math.round(value || 0));
}

function periodTitle(period: string) {
  const [year, month] = period.split("-").map(Number);
  return `令和${year - 2018}年${month}月分給与明細書`;
}

function payDate(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month, 25);
  return `令和${date.getFullYear() - 2018}年${date.getMonth() + 1}月25日`;
}

function fontPath(weight: "regular" | "bold") {
  const folder = weight === "bold" ? "700Bold" : "400Regular";
  const file = weight === "bold" ? "NotoSansJP_700Bold.ttf" : "NotoSansJP_400Regular.ttf";
  return path.join(process.cwd(), "node_modules", "@expo-google-fonts", "noto-sans-jp", folder, file);
}

function drawText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PDFKit.Mixins.TextOptions = {}
) {
  doc.text(text, x + 3, y + 4, {
    width: width - 6,
    height: height - 8,
    lineBreak: false,
    ...options
  });
}

function drawCell(doc: PDFKit.PDFDocument, cell: Cell, x: number, y: number, width: number, height: number) {
  if (cell.highlight) {
    doc.rect(x, y, width, height).fill("#c9c9c9");
  }
  doc.rect(x, y, width, height).stroke();
  if (cell.blank) return;

  doc.font(cell.bold ? "NotoSansJPBold" : "NotoSansJP").fontSize(7.8).fillColor("#111111");
  drawText(doc, cell.label, x, y, width, 22, { align: "left" });

  if (cell.value !== undefined) {
    doc.font(cell.bold ? "NotoSansJPBold" : "NotoSansJP").fontSize(9);
    drawText(doc, String(cell.value), x, y + height - 22, width, 18, { align: "right" });
  }
}

function drawSection(
  doc: PDFKit.PDFDocument,
  title: string,
  x: number,
  y: number,
  cols: number,
  rowHeight: number,
  rows: Cell[][],
  tableWidth: number
) {
  const labelWidth = 20;
  const cellWidth = (tableWidth - labelWidth) / cols;
  const tableHeight = rows.length * rowHeight;

  doc.lineWidth(1.2).rect(x, y, labelWidth, tableHeight).stroke();
  doc.font("NotoSansJPBold").fontSize(10).fillColor("#111111");
  doc.text(title, x + 5, y + tableHeight / 2 - 14, { width: 10, lineGap: 2 });

  doc.lineWidth(0.7);
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      drawCell(doc, cell, x + labelWidth + colIndex * cellWidth, y + rowIndex * rowHeight, cellWidth, rowHeight);
    });
  });

  doc.lineWidth(1.2).rect(x, y, tableWidth, tableHeight).stroke();
}

function drawEmployeeBox(doc: PDFKit.PDFDocument, input: PayslipPdfInput) {
  const x = 620;
  const y = 76;
  const w = 170;
  const h = 42;
  const half = w / 2;

  doc.font("NotoSansJPBold").fontSize(10).text(process.env.COMPANY_NAME || "アイウィル株式会社", x + 45, y - 16, {
    width: 125,
    align: "right"
  });
  doc.lineWidth(1).rect(x, y, w, h).stroke();
  doc.moveTo(x, y + 21).lineTo(x + w, y + 21).stroke();
  doc.moveTo(x + half, y).lineTo(x + half, y + h).stroke();
  doc.font("NotoSansJPBold").fontSize(8.2);
  doc.text("職位", x, y + 2, { width: half, align: "center" });
  doc.text("氏名", x + half, y + 2, { width: half, align: "center" });
  doc.font("NotoSansJP").fontSize(8.4);
  doc.text(input.payType === "MONTHLY" ? "月給" : "時給", x, y + 24, { width: half, align: "center" });
  doc.text(input.employeeName, x + half, y + 24, { width: half, align: "center" });

  doc.font("NotoSansJPBold").fontSize(8.8);
  doc.text("支給日", x + 58, y + 44, { width: 45, align: "right" });
  doc.text(payDate(input.period), x + 108, y + 44, { width: 70, align: "right" });
}

export async function createPayslipPdf(input: PayslipPdfInput) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0, bufferPages: false });
  doc.registerFont("NotoSansJP", fontPath("regular"));
  doc.registerFont("NotoSansJPBold", fontPath("bold"));

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fillColor("#111111").strokeColor("#111111");
  doc.font("NotoSansJPBold").fontSize(17).text(periodTitle(input.period), 0, 78, {
    width: 842,
    align: "center"
  });
  drawEmployeeBox(doc, input);

  const tableX = 90;
  const tableW = 700;
  const cols = 8;
  const rowH = 36;

  const paymentRows: Cell[][] = [
    [
      { label: "基本給", value: formatYen(input.regularPay) },
      { label: "固定残業手当", value: formatYen(input.overtimePay) },
      { label: "時間外労働手当", value: "0" },
      { label: "深夜労働手当", value: "0" },
      { label: "休日労働手当", value: "0" },
      { label: "帰省手当", value: "0" },
      { label: "通勤手当（非課税）", value: "0" },
      { label: "", blank: true }
    ],
    [
      { label: "立替交通費（非課税）", value: "0" },
      { label: "立替経費（非課税）", value: "0" },
      { label: "年末調整還付額", value: "0" },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "課税対象金額", value: formatYen(input.taxableIncome ?? input.grossPay), highlight: true, bold: true },
      { label: "支給総額", value: formatYen(input.grossPay), highlight: true, bold: true }
    ]
  ];

  const deductionRows: Cell[][] = [
    [
      { label: "健康・介護保険料", value: formatYen(input.healthInsurance) },
      { label: "厚生年金保険料", value: formatYen(input.pensionInsurance) },
      { label: "雇用保険料", value: formatYen(input.employmentInsurance) },
      { label: "社会保険料合計", value: formatYen(input.socialInsurance + input.employmentInsurance), highlight: true },
      { label: "子ども・子育て支援金", value: formatYen(input.childCareSupport) },
      { label: "定額減税額", value: "0" },
      { label: "所得税", value: formatYen(input.incomeTax) },
      { label: "住民税", value: formatYen(input.residentTax) }
    ],
    [
      { label: "寮使用料", value: formatYen(input.dormitoryFee) },
      { label: "年末調整不足額", value: "0" },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "控除総額", value: formatYen(input.totalDeduction), highlight: true, bold: true }
    ]
  ];

  drawSection(doc, "支\n給", tableX, 132, cols, rowH, paymentRows, tableW);
  drawSection(doc, "控\n除", tableX, 212, cols, rowH, deductionRows, tableW);

  const netX = tableX + tableW - 85;
  const netY = 294;
  doc.lineWidth(1.2).rect(netX, netY, 85, 36).stroke();
  doc.font("NotoSansJPBold").fontSize(9.2);
  drawText(doc, "差引支給額", netX, netY, 85, 18, { align: "left" });
  doc.rect(netX, netY + 18, 85, 18).fillAndStroke("#c9c9c9", "#111111");
  doc.fillColor("#111111").font("NotoSansJP").fontSize(9.2);
  drawText(doc, formatYen(input.netPay), netX, netY + 18, 85, 18, { align: "right" });

  doc.end();
  return done;
}
