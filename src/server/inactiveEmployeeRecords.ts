type EmployeeLike = {
  employeeNo: string;
  name: string;
  isActive?: boolean;
};

type PayrollLike = {
  id: string;
  period: string;
  netPay: number;
  employee: EmployeeLike;
};

type BonusLike = {
  id: string;
  period: string;
  netPay: number;
  employee: EmployeeLike;
};

export type InactiveEmployeeRecord = {
  kind: "payroll" | "bonus";
  id: string;
  period: string;
  employeeNo: string;
  employeeName: string;
  amount: number;
};

export function inactiveEmployeeRecords(input: { payrolls: PayrollLike[]; bonuses: BonusLike[] }): InactiveEmployeeRecord[] {
  return [
    ...input.payrolls
      .filter((payroll) => payroll.employee.isActive === false)
      .map((payroll) => ({
        kind: "payroll" as const,
        id: payroll.id,
        period: payroll.period,
        employeeNo: payroll.employee.employeeNo,
        employeeName: payroll.employee.name,
        amount: payroll.netPay
      })),
    ...input.bonuses
      .filter((bonus) => bonus.employee.isActive === false)
      .map((bonus) => ({
        kind: "bonus" as const,
        id: bonus.id,
        period: bonus.period,
        employeeNo: bonus.employee.employeeNo,
        employeeName: bonus.employee.name,
        amount: bonus.netPay
      }))
  ];
}
