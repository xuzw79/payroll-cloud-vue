import { createRequire } from "node:module";
import path from "node:path";
import type PDFKit from "pdfkit";
import {
  billingTypeLabel,
  contractPeriodText,
  formatJapaneseDate,
  memberConditionText,
  memberDocumentName,
  type ContractMemberDocumentInput
} from "./contractDocumentFormat.js";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as typeof PDFKit;

export type ContractDocumentInput = {
  documentNo?: string | null;
  contractNo?: string | null;
  purchaseOrderNo?: string | null;
  issueDate: string;
  partnerName: string;
  companyName?: string | null;
  companyPostalCode?: string | null;
  companyAddress?: string | null;
  companyTel?: string | null;
  title: string;
  taxIncluded?: boolean | null;
  startDate?: string | null;
  endDate?: string | null;
  memo?: string | null;
  members: ContractMemberDocumentInput[];
};

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function fontPath(weight: "regular" | "bold") {
  const folder = weight === "bold" ? "700Bold" : "400Regular";
  const file = weight === "bold" ? "NotoSansJP_700Bold.ttf" : "NotoSansJP_400Regular.ttf";
  return path.join(process.cwd(), "node_modules", "@expo-google-fonts", "noto-sans-jp", folder, file);
}

function setupDocument() {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: false });
  doc.registerFont("NotoSansJP", fontPath("regular"));
  doc.registerFont("NotoSansJPBold", fontPath("bold"));
  doc.font("NotoSansJP").fillColor("#111").strokeColor("#111").lineWidth(0.8);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}

function drawText(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, options: PDFKit.Mixins.TextOptions = {}) {
  doc.text(text, x, y, { width, ...options });
}

function drawCompanyBlock(doc: PDFKit.PDFDocument, input: ContractDocumentInput, y: number) {
  const lines = [
    input.companyName || process.env.COMPANY_NAME || "アイウィル株式会社",
    input.companyPostalCode || process.env.COMPANY_POSTAL_CODE || "",
    input.companyAddress || process.env.COMPANY_ADDRESS || "",
    input.companyTel ? `TEL: ${input.companyTel}` : process.env.COMPANY_TEL ? `TEL: ${process.env.COMPANY_TEL}` : ""
  ].filter(Boolean);
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, lines[0] || "", 330, y, 185);
  doc.font("NotoSansJP").fontSize(9);
  lines.slice(1).forEach((line, index) => drawText(doc, line, 330, y + 18 + index * 13, 185));
}

function memberRows(input: ContractDocumentInput) {
  const rows = input.members.length ? input.members : [{
    source: "NONE",
    itemDescription: input.title,
    unitPrice: 0,
    billingType: "FIXED"
  }];
  return rows.map((member, index) => ({
    no: index + 1,
    name: memberDocumentName(member),
    type: billingTypeLabel(member.billingType),
    amount: Number(member.unitPrice || 0),
    condition: memberConditionText(member)
  }));
}

function drawMemberTable(doc: PDFKit.PDFDocument, input: ContractDocumentInput, y: number) {
  const x = 48;
  const widths = [28, 170, 70, 82, 170];
  const rowH = 24;
  doc.font("NotoSansJPBold").fontSize(9);
  const headers = ["No", "作業者・品名", "単価区分", "単価", "条件"];
  let cursorX = x;
  headers.forEach((header, index) => {
    doc.rect(cursorX, y, widths[index], rowH).fillAndStroke("#e5e5e5", "#111");
    doc.fillColor("#111");
    drawText(doc, header, cursorX + 3, y + 6, widths[index] - 6, { align: "center" });
    cursorX += widths[index];
  });
  doc.font("NotoSansJP").fontSize(8.5);
  memberRows(input).slice(0, 12).forEach((row, rowIndex) => {
    const rowY = y + rowH * (rowIndex + 1);
    cursorX = x;
    [String(row.no), row.name, row.type, `${yen.format(row.amount)}円`, row.condition].forEach((text, index) => {
      doc.rect(cursorX, rowY, widths[index], rowH).stroke();
      drawText(doc, text, cursorX + 3, rowY + 6, widths[index] - 6, { align: index === 0 ? "center" : index === 3 ? "right" : "left" });
      cursorX += widths[index];
    });
  });
}

export async function createPurchaseOrderPdf(input: ContractDocumentInput) {
  const { doc, done } = setupDocument();
  doc.font("NotoSansJPBold").fontSize(20).text("注文書", 0, 58, { align: "center" });
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, `発行日: ${formatJapaneseDate(input.issueDate)}`, 365, 45, 160);
  drawText(doc, `注文書番号: ${input.purchaseOrderNo || "-"}`, 365, 62, 160);

  doc.font("NotoSansJPBold").fontSize(12);
  drawText(doc, `${input.partnerName} 御中`, 48, 104, 240);
  drawCompanyBlock(doc, input, 98);

  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "下記の通り注文いたします。", 48, 162, 300);
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, `件名: ${input.title}`, 48, 190, 470);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, `契約期間: ${contractPeriodText(input.startDate, input.endDate)}`, 48, 214, 470);
  drawText(doc, `金額区分: ${input.taxIncluded ? "税込み" : "税抜き"}`, 48, 236, 200);

  drawMemberTable(doc, input, 272);
  if (input.memo) {
    doc.font("NotoSansJPBold").fontSize(10);
    drawText(doc, "備考", 48, 620, 80);
    doc.font("NotoSansJP").fontSize(9);
    drawText(doc, input.memo, 48, 638, 500);
  }
  doc.end();
  return done;
}

export async function createBusinessContractPdf(input: ContractDocumentInput) {
  const { doc, done } = setupDocument();
  doc.font("NotoSansJPBold").fontSize(18).text("業務委託契約書", 0, 54, { align: "center" });
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, `契約番号: ${input.contractNo || "-"}`, 48, 92, 220);
  drawText(doc, `作成日: ${formatJapaneseDate(input.issueDate)}`, 365, 92, 160);

  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, `${input.companyName || process.env.COMPANY_NAME || "アイウィル株式会社"}（以下「甲」という。）と、${input.partnerName}（以下「乙」という。）は、次の通り業務委託契約を締結する。`, 48, 128, 500, { lineGap: 4 });

  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "第1条（委託業務）", 48, 190, 500);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, `甲は乙に対し、${input.title} に関する業務を委託し、乙はこれを受託する。`, 48, 210, 500, { lineGap: 3 });
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "第2条（契約期間）", 48, 252, 500);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, contractPeriodText(input.startDate, input.endDate), 48, 272, 500);
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "第3条（委託料および条件）", 48, 310, 500);
  drawMemberTable(doc, input, 334);
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "第4条（支払条件）", 48, 650, 500);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "委託料の請求および支払条件は、個別契約または注文書の定めに従う。", 48, 670, 500);
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "第5条（秘密保持）", 48, 706, 500);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "甲および乙は、本契約に関連して知り得た相手方の秘密情報を第三者に漏洩してはならない。", 48, 726, 500);

  doc.addPage();
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "第6条（再委託・権利義務の譲渡）", 48, 54, 500);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "乙は、甲の事前承諾なく、本契約上の地位または権利義務を第三者に譲渡してはならない。", 48, 76, 500);
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "第7条（協議）", 48, 116, 500);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "本契約に定めのない事項または疑義が生じた場合、甲乙協議のうえ誠実に解決する。", 48, 138, 500);

  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "以上、本契約成立の証として本書を作成し、甲乙記名押印のうえ各自保管する。", 48, 200, 500);
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, "甲", 72, 284, 30);
  drawCompanyBlock(doc, input, 276);
  drawText(doc, "乙", 72, 390, 30);
  drawText(doc, input.partnerName, 120, 390, 250);
  doc.end();
  return done;
}
