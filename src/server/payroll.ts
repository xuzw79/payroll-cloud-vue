import type { PayType } from "@prisma/client";

export type PayrollInput = {
  payType: PayType;
  basePay: number;
  workHours: number;
  overtimeHours: number;
  allowance: number;
  fixedDeduction: number;
  overtimeRate: number;
  incomeTaxRate: number;
  socialInsuranceRate: number;
  employmentInsuranceRate: number;
};

export function calculatePayroll(input: PayrollInput) {
  const regularPay = input.payType === "MONTHLY" ? input.basePay : input.basePay * input.workHours;
  const hourlyRate = input.payType === "MONTHLY" ? input.basePay / Math.max(input.workHours || 160, 1) : input.basePay;
  const overtimePay = hourlyRate * input.overtimeHours * input.overtimeRate;
  const grossPay = regularPay + overtimePay + input.allowance;
  const incomeTax = grossPay * input.incomeTaxRate;
  const socialInsurance = grossPay * input.socialInsuranceRate;
  const employmentInsurance = grossPay * input.employmentInsuranceRate;
  const totalDeduction = incomeTax + socialInsurance + employmentInsurance + input.fixedDeduction;

  return {
    regularPay: Math.round(regularPay),
    overtimePay: Math.round(overtimePay),
    grossPay: Math.round(grossPay),
    incomeTax: Math.round(incomeTax),
    socialInsurance: Math.round(socialInsurance),
    employmentInsurance: Math.round(employmentInsurance),
    totalDeduction: Math.round(totalDeduction),
    netPay: Math.round(grossPay - totalDeduction)
  };
}
