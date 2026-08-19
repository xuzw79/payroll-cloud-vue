import { createRequire } from "node:module";
import path from "node:path";
import type PDFKit from "pdfkit";
import {
  contractReiwaPeriodText,
  formatReiwaDate,
  memberDisplayNames,
  purchaseOrderFeeLines,
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

function companyLines(input: ContractDocumentInput) {
  return [
    input.companyName || process.env.COMPANY_NAME || "アイウィル株式会社",
    input.companyPostalCode ? `〒${input.companyPostalCode}` : process.env.COMPANY_POSTAL_CODE ? `〒${process.env.COMPANY_POSTAL_CODE}` : "",
    input.companyAddress || process.env.COMPANY_ADDRESS || "",
    input.companyTel ? `Tel．${input.companyTel}` : process.env.COMPANY_TEL ? `Tel．${process.env.COMPANY_TEL}` : ""
  ].filter(Boolean);
}

function drawCompanyBlock(doc: PDFKit.PDFDocument, input: ContractDocumentInput, y: number, x = 330, width = 185) {
  const lines = companyLines(input);
  doc.font("NotoSansJPBold").fontSize(11);
  drawText(doc, lines[0] || "", x, y, width);
  doc.font("NotoSansJP").fontSize(9);
  lines.slice(1).forEach((line, index) => drawText(doc, line, x, y + 18 + index * 13, width));
}

function drawWrappedTableRow(doc: PDFKit.PDFDocument, label: string, value: string | string[], x: number, y: number, labelWidth: number, valueWidth: number, minHeight = 30) {
  const values = Array.isArray(value) ? value : [value];
  doc.font("NotoSansJP").fontSize(9);
  const textHeight = values.reduce((total, line) => total + doc.heightOfString(line, { width: valueWidth - 16 }) + 4, 0);
  const rowHeight = Math.max(minHeight, textHeight + 14);

  doc.rect(x, y, labelWidth, rowHeight).fillAndStroke("#f3f3f3", "#111");
  doc.rect(x + labelWidth, y, valueWidth, rowHeight).stroke();
  doc.fillColor("#111").font("NotoSansJPBold").fontSize(10);
  drawText(doc, label, x + 8, y + 9, labelWidth - 16, { align: "center" });
  doc.font("NotoSansJP").fontSize(9);
  let cursorY = y + 8;
  values.forEach((line) => {
    drawText(doc, line, x + labelWidth + 8, cursorY, valueWidth - 16);
    cursorY += doc.heightOfString(line, { width: valueWidth - 16 }) + 4;
  });
  return rowHeight;
}

function firstDocumentMember(input: ContractDocumentInput) {
  return input.members[0] || {
    source: "NONE",
    itemDescription: input.title,
    unitPrice: 0,
    billingType: "FIXED"
  };
}

function formatPurchaseOrderWork(input: ContractDocumentInput) {
  const member = firstDocumentMember(input);
  return member.itemDescription || input.title || "業務支援";
}

function defaultSpecialNotes() {
  return "御社もしくは御社の技術者の原因で、本注文書の関連作業ができない状態になる場合、双方話し合いを持って、双方が本注文書を解除することができるものとする。";
}

function drawArticle(doc: PDFKit.PDFDocument, title: string, body: string, y: number) {
  if (y > 745) {
    doc.addPage();
    y = 52;
  }
  doc.font("NotoSansJPBold").fontSize(9.5);
  drawText(doc, title, 56, y, 485);
  doc.font("NotoSansJP").fontSize(8.5);
  const bodyY = y + 15;
  drawText(doc, body, 56, bodyY, 485, { lineGap: 2 });
  return bodyY + doc.heightOfString(body, { width: 485, lineGap: 2 }) + 12;
}

function contractArticles(input: ContractDocumentInput) {
  return [
    ["第１条（目的）", `甲は乙に対し、${input.title}に関する業務を委託し、乙はこれを受託する。乙は善良なる管理者の注意をもって委託業務を遂行する。`],
    ["第２条（業務委託内容およびその他条件）", "業務委託内容およびその他条件については、個別契約書または注文書を参照すること。"],
    ["第３条（業務の遂行）", "乙は甲の指示、仕様、納期その他合意事項を遵守し、委託業務を誠実に遂行する。"],
    ["第４条（契約形態）", "本契約は業務委託契約であり、甲乙間に雇用、派遣、代理その他これに類する関係を生じさせるものではない。"],
    ["第５条（業務遂行能力、資格）", "乙は委託業務に必要な能力、資格、経験を有する者を配置し、成果物および作業品質を維持する。"],
    ["第６条（仕様書等の管理）", "乙は甲から開示または貸与された資料、仕様書、データ等を適切に管理し、委託業務以外の目的に使用してはならない。"],
    ["第７条（貸与品）", "甲が乙に貸与する物品または情報がある場合、乙はこれを善良なる管理者の注意をもって保管する。"],
    ["第８条（貸与品の管理）", "乙は貸与品の滅失、毀損、漏洩等を防止するため必要な措置を講じる。"],
    ["第９条（貸与品の複写、複製の禁止）", "乙は甲の事前承諾なく貸与品を複写、複製してはならない。"],
    ["第１０条（貸与品の目的外使用禁止）", "乙は貸与品を本契約の目的以外に使用してはならない。"],
    ["第１１条（貸与品の返還）", "乙は甲から請求があった場合または契約終了時、貸与品を速やかに返還または消去する。"],
    ["第１２条（納期変更）", "納期または作業期間の変更が必要となった場合、甲乙協議のうえ書面または電磁的方法により確認する。"],
    ["第１３条（納入前の乙による検証）", "乙は成果物を納入する場合、事前に必要な検証を行い、品質確保に努める。"],
    ["第１４条（検査・検収）", "甲は納入物を検査し、合格をもって検収完了とする。不合格の場合、乙は速やかに補修または再作業を行う。"],
    ["第１５条（不合格時の処理）", "検査不合格の原因が乙にある場合、乙は自己の責任と費用で必要な対応を行う。"],
    ["第１６条（知的財産権）", "成果物に関する権利の帰属は個別契約の定めに従い、定めがない場合は甲乙協議により決定する。"],
    ["第１７条（秘密保持）", "甲および乙は、本契約に関連して知り得た相手方の秘密情報を第三者に漏洩してはならない。"],
    ["第１８条（個人情報）", "乙は個人情報を取り扱う場合、関連法令および甲の指示を遵守し、必要な安全管理措置を講じる。"],
    ["第１９条（損害賠償）", "甲または乙が本契約に違反し相手方に損害を与えた場合、通常かつ直接の損害について賠償責任を負う。"],
    ["第２０条（再委託）", "乙は甲の事前承諾なく、委託業務の全部または主要な部分を第三者に再委託してはならない。"],
    ["第２１条（反社会的勢力の排除）", "甲および乙は、自己または関係者が反社会的勢力に該当しないことを表明し、将来にわたり保証する。"],
    ["第２２条（契約期間）", `本契約の期間は${contractReiwaPeriodText(input.startDate, input.endDate)}とする。ただし、個別契約に別段の定めがある場合はこれに従う。`],
    ["第２３条（解除）", "相手方が本契約に違反し、相当期間を定めた催告後も是正されない場合、契約を解除することができる。"],
    ["第２４条（管轄裁判所）", "本契約に関して訴訟の必要が生じた場合、甲の本店所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とする。"],
    ["第２５条（信義誠実の原則）", "本契約に定めのない事項または疑義が生じた場合、甲乙信義誠実の原則に従い協議のうえ解決する。"]
  ] as const;
}

function drawSignatureBlock(doc: PDFKit.PDFDocument, input: ContractDocumentInput, y: number) {
  if (y > 610) {
    doc.addPage();
    y = 70;
  }
  doc.font("NotoSansJP").fontSize(9);
  drawText(doc, "以上、本契約成立の証として本書を作成し、甲乙記名押印のうえ各自保管する。", 56, y, 485);
  drawText(doc, formatReiwaDate(input.issueDate), 70, y + 44, 200);
  drawText(doc, "甲", 70, y + 82, 24);
  drawText(doc, companyLines(input).slice(1, 3).join("\n"), 118, y + 82, 330);
  doc.font("NotoSansJPBold").fontSize(10);
  drawText(doc, companyLines(input)[0] || "", 118, y + 122, 250);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "代表取締役　　　　　　　　　　　㊞", 118, y + 144, 330);
  drawText(doc, "乙", 70, y + 198, 24);
  doc.font("NotoSansJPBold").fontSize(10);
  drawText(doc, input.partnerName, 118, y + 198, 300);
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "代表取締役　　　　　　　　　　　㊞", 118, y + 220, 330);
}

export async function createPurchaseOrderPdf(input: ContractDocumentInput) {
  const { doc, done } = setupDocument();
  const firstMember = firstDocumentMember(input);
  doc.font("NotoSansJPBold").fontSize(20).text("注文書", 0, 46, { align: "center" });
  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, formatReiwaDate(input.issueDate), 390, 82, 145);
  if (input.purchaseOrderNo) drawText(doc, `注文書番号：${input.purchaseOrderNo}`, 390, 100, 145);

  doc.font("NotoSansJPBold").fontSize(12);
  drawText(doc, `${input.partnerName}　御中`, 56, 130, 250);
  drawCompanyBlock(doc, input, 134, 342, 190);

  doc.font("NotoSansJP").fontSize(10);
  drawText(doc, "下記の通り注文致します。つきまして、品質の維持、納期の厳守にご尽力なさるようお願い致します。", 56, 232, 485);

  const tableX = 56;
  const labelWidth = 118;
  const valueWidth = 367;
  let y = 272;
  y += drawWrappedTableRow(doc, "業 務 名", input.title, tableX, y, labelWidth, valueWidth);
  y += drawWrappedTableRow(doc, "作 業 内 容", formatPurchaseOrderWork(input), tableX, y, labelWidth, valueWidth);
  y += drawWrappedTableRow(doc, "作 業 期 間", contractReiwaPeriodText(input.startDate, input.endDate), tableX, y, labelWidth, valueWidth);
  y += drawWrappedTableRow(doc, "作業者氏名", memberDisplayNames(input.members), tableX, y, labelWidth, valueWidth);
  y += drawWrappedTableRow(doc, "月額委託料金", purchaseOrderFeeLines(firstMember), tableX, y, labelWidth, valueWidth, 120);
  y += drawWrappedTableRow(doc, "作 業 場 所", "弊社指定場所", tableX, y, labelWidth, valueWidth);
  y += drawWrappedTableRow(doc, "作 業 条 件", "基本的に現場の就業規則に準じます。", tableX, y, labelWidth, valueWidth);
  y += drawWrappedTableRow(doc, "納 入 物 件", "作業時間表を月末日までに提出。", tableX, y, labelWidth, valueWidth);
  y += drawWrappedTableRow(doc, "支 払 条 件", "月末締め、翌々月末日に現金振込。", tableX, y, labelWidth, valueWidth);
  drawWrappedTableRow(doc, "特 記 事 項", input.memo || defaultSpecialNotes(), tableX, y, labelWidth, valueWidth, 56);
  doc.end();
  return done;
}

export async function createBusinessContractPdf(input: ContractDocumentInput) {
  const { doc, done } = setupDocument();
  doc.font("NotoSansJPBold").fontSize(18).text("業務委託契約書", 0, 54, { align: "center" });
  doc.font("NotoSansJP").fontSize(9);
  if (input.contractNo) drawText(doc, `契約番号：${input.contractNo}`, 56, 90, 210);

  const companyName = companyLines(input)[0] || "アイウィル株式会社";
  doc.font("NotoSansJP").fontSize(9.5);
  drawText(
    doc,
    `${companyName}（以下「甲」という）と${input.partnerName}（以下「乙」という）とは、甲の乙に対する情報システム業務の委託に関する取引条件について、次のとおり契約（以下「本契約」という）を締結する。`,
    56,
    128,
    485,
    { lineGap: 3 }
  );

  let y = 188;
  contractArticles(input).forEach(([title, body]) => {
    y = drawArticle(doc, title, body, y);
  });
  drawSignatureBlock(doc, input, y + 10);
  doc.end();
  return done;
}
