type EmployeeLike = {
  id: string;
  employeeNo: string;
  name: string;
  isActive?: boolean | null;
  bonusEnabled?: boolean | null;
  bonusSchedules?: unknown;
};

type PayrollLike = {
  employeeId: string;
};

type BonusLike = {
  employeeId: string;
};

type NamedCustomer = {
  name?: string | null;
};

type ContractMemberLike = {
  id: string;
  source?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  employee?: { name?: string | null } | null;
  externalMember?: { name?: string | null; customer?: NamedCustomer | null } | null;
};

type ContractLike = {
  id: string;
  title: string;
  contractNo?: string | null;
  customer?: NamedCustomer | null;
  manualCustomerName?: string | null;
  members?: ContractMemberLike[];
};

type InvoiceLike = {
  id: string;
  contractId?: string | null;
  invoiceNo?: string | null;
  title: string;
  pdfDownloadedAt?: string | Date | null;
};

type PartnerCostLike = {
  contractMemberId?: string | null;
};

type ConfirmationLike = {
  checkKey: string;
  confirmedAt?: string | Date | null;
  confirmedByName?: string | null;
};

export type MonthlyChecklistItem = {
  key: string;
  label: string;
  status: "OK" | "NG";
  count: number;
  details: string[];
  confirmable?: boolean;
  confirmedAt?: string | null;
  confirmedByName?: string | null;
};

export type MonthlyChecklistResult = {
  period: string;
  okCount: number;
  ngCount: number;
  items: MonthlyChecklistItem[];
};

export const individualRevenueExpenseCheckKey = "INDIVIDUAL_REVENUE_EXPENSE";

type BuildMonthlyChecklistInput = {
  period: string;
  employees: EmployeeLike[];
  payrolls: PayrollLike[];
  bonuses: BonusLike[];
  salesContracts: ContractLike[];
  purchaseContracts: ContractLike[];
  invoices: InvoiceLike[];
  partnerCosts: PartnerCostLike[];
  confirmations: ConfirmationLike[];
  revenues: unknown[];
  expenses: unknown[];
};

function activeInPeriod(value: { startDate?: string | null; endDate?: string | null }, period: string) {
  const startPeriod = value.startDate?.slice(0, 7);
  const endPeriod = value.endDate?.slice(0, 7);
  return (!startPeriod || startPeriod <= period) && (!endPeriod || endPeriod >= period);
}

function employeeLabel(employee: EmployeeLike) {
  return `${employee.employeeNo} ${employee.name}`;
}

function contractLabel(contract: ContractLike) {
  const customerName = contract.customer?.name || contract.manualCustomerName || "";
  const prefix = contract.contractNo ? `${contract.contractNo} ` : "";
  return customerName ? `${prefix}${contract.title} / ${customerName}` : `${prefix}${contract.title}`;
}

function memberLabel(member: ContractMemberLike) {
  if (member.source === "EMPLOYEE") return member.employee?.name || "社員未設定";
  return member.externalMember?.name || "外部メンバー未設定";
}

function item(key: string, label: string, details: string[], extra: Partial<MonthlyChecklistItem> = {}): MonthlyChecklistItem {
  return {
    key,
    label,
    status: details.length ? "NG" : "OK",
    count: details.length,
    details,
    ...extra
  };
}

function scheduleAmountForPeriod(employee: EmployeeLike, period: string) {
  if (employee.bonusEnabled === false) return 0;
  const targetMonth = Number(period.slice(5, 7));
  const schedules = Array.isArray(employee.bonusSchedules) ? employee.bonusSchedules : [];
  return schedules.reduce((sum, schedule) => {
    if (!schedule || typeof schedule !== "object") return sum;
    const record = schedule as { month?: unknown; amount?: unknown };
    const month = Number(record.month || 0);
    const amount = Number(record.amount || 0);
    return month === targetMonth && amount > 0 ? sum + amount : sum;
  }, 0);
}

function invoiceLabel(invoice: InvoiceLike) {
  return `${invoice.invoiceNo || invoice.id} ${invoice.title}`;
}

export function buildMonthlyChecklist(input: BuildMonthlyChecklistInput): MonthlyChecklistResult {
  const activeEmployees = input.employees.filter((employee) => employee.isActive !== false);
  const payrollEmployeeIds = new Set(input.payrolls.map((payroll) => payroll.employeeId));
  const bonusEmployeeIds = new Set(input.bonuses.map((bonus) => bonus.employeeId));
  const invoiceContractIds = new Set(input.invoices.map((invoice) => invoice.contractId).filter(Boolean));
  const partnerCostMemberIds = new Set(input.partnerCosts.map((cost) => cost.contractMemberId).filter(Boolean));
  const confirmation = input.confirmations.find((value) => value.checkKey === individualRevenueExpenseCheckKey);

  const payrollMissing = activeEmployees
    .filter((employee) => !payrollEmployeeIds.has(employee.id))
    .map(employeeLabel);
  const bonusMissing = activeEmployees
    .filter((employee) => scheduleAmountForPeriod(employee, input.period) > 0 && !bonusEmployeeIds.has(employee.id))
    .map(employeeLabel);
  const invoiceMissing = input.salesContracts
    .filter((contract) => !invoiceContractIds.has(contract.id))
    .map(contractLabel);
  const partnerCostMissing = input.purchaseContracts.flatMap((contract) =>
    (contract.members || [])
      .filter((member) => activeInPeriod(member, input.period))
      .filter((member) => !partnerCostMemberIds.has(member.id))
      .map((member) => `${contractLabel(contract)} ${memberLabel(member)}`)
  );
  const invoicePdfMissing = input.invoices
    .filter((invoice) => !invoice.pdfDownloadedAt)
    .map(invoiceLabel);

  const manualDetails = [`個別売上 ${input.revenues.length}件 / 個別支出 ${input.expenses.length}件`];
  const manualItem: MonthlyChecklistItem = {
    key: individualRevenueExpenseCheckKey,
    label: "個別売上/支出未確認",
    status: confirmation ? "OK" : "NG",
    count: input.revenues.length + input.expenses.length,
    details: manualDetails,
    confirmable: true,
    confirmedAt: confirmation?.confirmedAt ? new Date(confirmation.confirmedAt).toISOString() : null,
    confirmedByName: confirmation?.confirmedByName || null
  };

  const items = [
    item("PAYROLL_MISSING", "給与未登録社員", payrollMissing),
    item("BONUS_MISSING", "賞与予定あり未登録", bonusMissing),
    item("PARTNER_COST_MISSING", "外注費未登録", partnerCostMissing),
    item("INVOICE_MISSING", "請求書未作成", invoiceMissing),
    item("INVOICE_PDF_MISSING", "請求書PDF未出力", invoicePdfMissing),
    manualItem
  ];

  return {
    period: input.period,
    okCount: items.filter((value) => value.status === "OK").length,
    ngCount: items.filter((value) => value.status === "NG").length,
    items
  };
}
