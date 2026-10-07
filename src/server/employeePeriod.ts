export type EmployeePeriodLike = {
  retirementDate?: string | null;
};

export function employeeActiveInPayrollPeriod(employee: EmployeePeriodLike, period: string) {
  const retirementPeriod = employee.retirementDate?.slice(0, 7);
  return !retirementPeriod || retirementPeriod >= period;
}
