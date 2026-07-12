import { createRequire } from "node:module";
import path from "node:path";
import type PDFKit from "pdfkit";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as typeof PDFKit;

type BonusPdfInput = {
  period: string;
  employeeNo: string;
  employeeName: string;
  bonusAmount: number;
  taxableIncome: number;
  incomeTax: number;
  healthInsurance: number;
  pensionInsurance: number;
  childCareSupport: number;
  socialInsurance: number;
  employmentInsurance: number;
  totalDeduction: number;
  netPay: number;
};

type Cell = {
  label: string;
  value?: string | number;
  highlight?: boolean;
  bold?: boolean;
  blank?: boolean;
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

function reiwaYear(year: number) {
  return year - 2018;
}

function bonusTitle(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (month === 4) return `令和${reiwaYear(year - 1)}年 下期ボーナス明細`;
  if (month === 10) return `令和${reiwaYear(year)}年 上期ボーナス明細`;
  return `令和${reiwaYear(year)}年 臨時ボーナス明細`;
}

function bonusPayDate(period: string) {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `令和${reiwaYear(year)}年${month}月${lastDay}日`;
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

  doc.font(cell.bold ? "NotoSansJPBold" : "NotoSansJP").fontSize(7.6).fillColor("#111111");
  drawText(doc, cell.label, x, y, width, 20, { align: "left" });

  if (cell.value !== undefined) {
    doc.font(cell.bold ? "NotoSansJPBold" : "NotoSansJP").fontSize(9);
    drawText(doc, String(cell.value), x, y + height - 21, width, 18, { align: "right" });
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
  const labelWidth = 22;
  const cellWidth = (tableWidth - labelWidth) / cols;
  const tableHeight = rows.length * rowHeight;

  doc.lineWidth(1.2).rect(x, y, labelWidth, tableHeight).stroke();
  doc.font("NotoSansJPBold").fontSize(10).fillColor("#111111");
  doc.text(title, x + 6, y + tableHeight / 2 - 14, { width: 10, lineGap: 2 });

  doc.lineWidth(0.7);
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      drawCell(doc, cell, x + labelWidth + colIndex * cellWidth, y + rowIndex * rowHeight, cellWidth, rowHeight);
    });
  });

  doc.lineWidth(1.2).rect(x, y, tableWidth, tableHeight).stroke();
}

function drawHeader(doc: PDFKit.PDFDocument, input: BonusPdfInput) {
  doc.font("NotoSansJPBold").fontSize(17).fillColor("#111111").text(bonusTitle(input.period), 0, 54, {
    width: 842,
    align: "center"
  });

  const x = 660;
  const y = 44;
  const w = 150;
  const h = 42;
  const half = w / 2;

  doc.font("NotoSansJPBold").fontSize(9.2).text(process.env.COMPANY_NAME || "アイウィル株式会社", x, y - 15, {
    width: w,
    align: "right"
  });
  doc.lineWidth(1).rect(x, y, w, h).stroke();
  doc.moveTo(x, y + 21).lineTo(x + w, y + 21).stroke();
  doc.moveTo(x + half, y).lineTo(x + half, y + h).stroke();
  doc.font("NotoSansJPBold").fontSize(8.2);
  doc.text("社員番号", x, y + 2, { width: half, align: "center" });
  doc.text("氏名", x + half, y + 2, { width: half, align: "center" });
  doc.font("NotoSansJP").fontSize(8.4);
  doc.text(input.employeeNo, x, y + 24, { width: half, align: "center" });
  doc.text(input.employeeName, x + half, y + 24, { width: half, align: "center" });

  doc.font("NotoSansJPBold").fontSize(8.8);
  doc.text("支給日", 690, 92, { width: 48, align: "right" });
  doc.text(bonusPayDate(input.period), 742, 92, { width: 70, align: "right" });
}

export async function createBonusPdf(input: BonusPdfInput) {
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
  drawHeader(doc, input);

  const tableX = 40;
  const tableW = 770;
  const cols = 8;
  const rowH = 40;

  const paymentRows: Cell[][] = [
    [
      { label: "基本給", value: "0" },
      { label: "固定残業手当", value: "0" },
      { label: "時間外労働手当", value: "0" },
      { label: "来日手当", value: "0" },
      { label: "ボーナス", value: formatYen(input.bonusAmount) },
      { label: "インフルエンザ補助", value: "0" },
      { label: "通勤手当", value: "0" },
      { label: "", blank: true }
    ],
    [
      { label: "立替交通費（非課税）", value: "0" },
      { label: "立替経費（非課税）", value: "0" },
      { label: "年末調整還付額", value: "0" },
      { label: "PCR検査手当", value: "0" },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "課税対象金額", value: formatYen(input.taxableIncome), highlight: true, bold: true },
      { label: "支給総額", value: formatYen(input.bonusAmount), highlight: true, bold: true }
    ]
  ];

  const deductionRows: Cell[][] = [
    [
      { label: "健康・介護保険料", value: formatYen(input.healthInsurance) },
      { label: "厚生年金保険料", value: formatYen(input.pensionInsurance) },
      { label: "雇用保険料", value: formatYen(input.employmentInsurance) },
      { label: "社会保険料合計", value: formatYen(input.socialInsurance + input.employmentInsurance), highlight: true },
      { label: "", blank: true },
      { label: "定額減税額", value: "0" },
      { label: "所得税", value: formatYen(input.incomeTax) },
      { label: "住民税", value: "0" }
    ],
    [
      { label: "寮費", value: "0" },
      { label: "年末調整不足額", value: "0" },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "", blank: true },
      { label: "控除総額", value: formatYen(input.totalDeduction), highlight: true, bold: true }
    ]
  ];

  drawSection(doc, "支\n給", tableX, 112, cols, rowH, paymentRows, tableW);
  drawSection(doc, "控\n除", tableX, 226, cols, rowH, deductionRows, tableW);

  const netX = tableX + tableW - 95;
  const netY = 360;
  doc.lineWidth(1.2).rect(netX, netY, 95, 42).stroke();
  doc.font("NotoSansJPBold").fontSize(9.2);
  drawText(doc, "差引支給額", netX, netY, 95, 20, { align: "left" });
  doc.rect(netX, netY + 21, 95, 21).fillAndStroke("#c9c9c9", "#111111");
  doc.fillColor("#111111").font("NotoSansJPBold").fontSize(9.2);
  drawText(doc, formatYen(input.netPay), netX, netY + 21, 95, 21, { align: "right" });

  doc.end();
  return done;
}
