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
  healthInsuranceRate: number;
  pensionInsuranceRate: number;
  employmentInsuranceRate: number;
  incomeTaxAmount?: number;
  socialInsuranceEnrolled?: boolean;
  socialInsuranceBaseAmount?: number;
};

export function calculatePayroll(input: PayrollInput) {
  const regularPay = input.payType === "MONTHLY" ? input.basePay : input.basePay * input.workHours;
  const hourlyRate = input.payType === "MONTHLY" ? input.basePay / Math.max(input.workHours || 160, 1) : input.basePay;
  const overtimePay = hourlyRate * input.overtimeHours * input.overtimeRate;
  const grossPay = regularPay + overtimePay + input.allowance;
  const socialInsuranceBase = input.socialInsuranceBaseAmount && input.socialInsuranceBaseAmount > 0
    ? input.socialInsuranceBaseAmount
    : grossPay;
  const healthInsurance = input.socialInsuranceEnrolled === false ? 0 : socialInsuranceBase * input.healthInsuranceRate;
  const pensionInsurance = input.socialInsuranceEnrolled === false ? 0 : socialInsuranceBase * input.pensionInsuranceRate;
  const socialInsurance = healthInsurance + pensionInsurance;
  const employmentInsurance = grossPay * input.employmentInsuranceRate;
  const incomeTax = input.incomeTaxAmount ?? grossPay * input.incomeTaxRate;
  const totalDeduction = incomeTax + socialInsurance + employmentInsurance + input.fixedDeduction;

  return {
    regularPay: Math.round(regularPay),
    overtimePay: Math.round(overtimePay),
    grossPay: Math.round(grossPay),
    incomeTax: Math.round(incomeTax),
    healthInsurance: Math.round(healthInsurance),
    pensionInsurance: Math.round(pensionInsurance),
    socialInsurance: Math.round(socialInsurance),
    employmentInsurance: Math.round(employmentInsurance),
    totalDeduction: Math.round(totalDeduction),
    netPay: Math.round(grossPay - totalDeduction)
  };
}
