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
  socialInsurance: number;
  employmentInsurance: number;
  fixedDeduction: number;
  totalDeduction: number;
  netPay: number;
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

function safePdfText(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
}

export async function createPayslipPdf(input: PayslipPdfInput) {
  const lines = [
    "Payroll Payslip",
    `Period: ${input.period}`,
    `Employee No: ${input.employeeNo}`,
    `Employee Name: ${input.employeeName}`,
    `Pay Type: ${input.payType}`,
    "",
    `Base Pay: ${yen.format(input.regularPay)}`,
    `Overtime Pay: ${yen.format(input.overtimePay)}`,
    `Allowance: ${yen.format(input.allowance)}`,
    `Gross Pay: ${yen.format(input.grossPay)}`,
    `Income Tax: -${yen.format(input.incomeTax)}`,
    `Social Insurance: -${yen.format(input.socialInsurance)}`,
    `Employment Insurance: -${yen.format(input.employmentInsurance)}`,
    `Fixed Deduction: -${yen.format(input.fixedDeduction)}`,
    `Total Deduction: -${yen.format(input.totalDeduction)}`,
    `Net Pay: ${yen.format(input.netPay)}`
  ];

  const textOps = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${760 - index * 24} Td (${safePdfText(line)}) Tj ET`)
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(textOps)} >>\nstream\n${textOps}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "binary");
}
