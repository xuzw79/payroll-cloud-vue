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
  childCareSupportRate: number;
  employmentInsuranceRate: number;
  incomeTaxAmount?: number;
  socialInsuranceEnrolled?: boolean;
  employmentInsuranceEnrolled?: boolean;
  socialInsuranceBaseAmount?: number;
  residentTax?: number;
  dormitoryFee?: number;
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
  const childCareSupport = input.socialInsuranceEnrolled === false ? 0 : socialInsuranceBase * input.childCareSupportRate;
  const socialInsurance = healthInsurance + pensionInsurance + childCareSupport;
  const employmentInsurance = input.employmentInsuranceEnrolled === false ? 0 : grossPay * input.employmentInsuranceRate;
  const incomeTax = input.incomeTaxAmount ?? grossPay * input.incomeTaxRate;
  const residentTax = input.residentTax || 0;
  const dormitoryFee = input.dormitoryFee || 0;
  const totalDeduction = incomeTax + socialInsurance + employmentInsurance + residentTax + dormitoryFee + input.fixedDeduction;

  return {
    regularPay: Math.round(regularPay),
    overtimePay: Math.round(overtimePay),
    grossPay: Math.round(grossPay),
    incomeTax: Math.round(incomeTax),
    healthInsurance: Math.round(healthInsurance),
    pensionInsurance: Math.round(pensionInsurance),
    childCareSupport: Math.round(childCareSupport),
    socialInsurance: Math.round(socialInsurance),
    employmentInsurance: Math.round(employmentInsurance),
    residentTax: Math.round(residentTax),
    dormitoryFee: Math.round(dormitoryFee),
    totalDeduction: Math.round(totalDeduction),
    netPay: Math.round(grossPay - totalDeduction)
  };
}
