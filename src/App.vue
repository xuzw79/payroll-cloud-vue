<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Download, LogOut, Mail, Plus, RefreshCw, Save, Search, Trash2, Upload } from "lucide-vue-next";
import SesManagement from "./components/SesManagement.vue";

type PayType = "MONTHLY" | "HOURLY";
type UserRole = "ADMIN" | "ACCOUNTING" | "VIEWER" | "EMPLOYEE";
type PermissionMenu =
  | "PAYROLL"
  | "PAYROLL_EMPLOYEES"
  | "PAYROLL_INPUT"
  | "BONUS_INPUT"
  | "RATES"
  | "TAX_IMPORT"
  | "PAYSLIP"
  | "BONUS_SLIP"
  | "SES"
  | "SES_CUSTOMERS"
  | "SES_PROJECTS"
  | "SES_INVOICES"
  | "SES_PARTNER_COSTS"
  | "SES_REVENUE"
  | "SES_MASTERS"
  | "SES_PROFIT"
  | "USERS"
  | "PERMISSIONS";

type Employee = {
  id: string;
  employeeNo: string;
  name: string;
  position?: string | null;
  email?: string | null;
  defaultDependentCount: number;
  employmentInsuranceEnrolled: boolean;
  payType: PayType;
  basePay: number;
  fixedOvertimeAllowance: number;
  memo?: string | null;
};

type Payroll = {
  id: string;
  period: string;
  employeeId: string;
  workDays: string;
  workHours: string;
  overtimeHours: string;
  allowance: number;
  fixedDeduction: number;
  residentTax: number;
  dormitoryFee: number;
  dependentCount: number;
  socialInsuranceEnrolled: boolean;
  socialInsuranceBaseAmount?: number | null;
  taxableIncome?: number | null;
  grossPay: number;
  totalDeduction: number;
  netPay: number;
  regularPay: number;
  overtimePay: number;
  fixedOvertimeAllowance: number;
  incomeTax: number;
  healthInsurance: number;
  pensionInsurance: number;
  childCareSupport: number;
  socialInsurance: number;
  employmentInsurance: number;
  employmentInsuranceEnrolled: boolean;
  note?: string | null;
  emailedAt?: string | null;
  employee: Employee;
};

type Bonus = {
  id: string;
  period: string;
  employeeId: string;
  bonusAmount: number;
  incomeTaxRate: string | number;
  socialInsuranceEnrolled: boolean;
  socialInsuranceBaseAmount?: number | null;
  taxableIncome: number;
  incomeTax: number;
  healthInsurance: number;
  pensionInsurance: number;
  childCareSupport: number;
  socialInsurance: number;
  employmentInsurance: number;
  employmentInsuranceEnrolled: boolean;
  totalDeduction: number;
  netPay: number;
  note?: string | null;
  employee: Employee;
};

type FiscalRate = {
  id?: string;
  fiscalYear: number;
  overtimeRate: string | number;
  incomeTaxRate: string | number;
  socialInsuranceRate: string | number;
  healthInsuranceRate: string | number;
  pensionInsuranceRate: string | number;
  childCareSupportRate: string | number;
  employmentInsuranceRate: string | number;
  memo?: string | null;
};

type IncomeTaxBracket = {
  id: string;
  fiscalYear: number;
  dependentCount: number;
  minTaxable: number;
  maxTaxable?: number | null;
  taxAmount: number;
};

type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissionRoleId?: string | null;
  employeeId?: string | null;
  isActive: boolean;
  employee?: { id: string; employeeNo: string; name: string } | null;
  permissions?: RolePermission[];
};

type PermissionRoleMaster = {
  id: string;
  code: string;
  name: string;
  baseRole: UserRole;
  isActive: boolean;
};

type PublicSettings = {
  systemName?: string | null;
};

type RolePermission = {
  id?: string;
  role: UserRole;
  menu: PermissionMenu;
  canShow: boolean;
  canView: boolean;
  canEdit: boolean;
  canViewAll: boolean;
};
type PermissionFlag = "canShow" | "canView" | "canEdit" | "canViewAll";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function tokyoDateParts() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day")
  };
}

function currentTokyoPeriod() {
  const { year, month } = tokyoDateParts();
  return formatYearMonth(year, month);
}

function initialPayrollPeriod() {
  const { year, month, day } = tokyoDateParts();
  if (day > 25) {
    return formatYearMonth(year, month);
  }
  return month === 1 ? formatYearMonth(year - 1, 12) : formatYearMonth(year, month - 1);
}

function isPayrollLockedPeriod(value: string) {
  return tokyoDateParts().day >= 28 && value < currentTokyoPeriod();
}

function monthFromPeriod(value: string) {
  return Number(value.split("-")[1] || 0);
}

const today = initialPayrollPeriod();
const bonusPaymentMonths = [4, 10];
const thisFiscalYear = new Date().getMonth() + 1 >= 4 ? new Date().getFullYear() : new Date().getFullYear() - 1;
const roleLabels: Record<UserRole, string> = {
  ADMIN: "管理者",
  ACCOUNTING: "経理担当",
  VIEWER: "閲覧のみ",
  EMPLOYEE: "社員本人"
};
const permissionRoles: UserRole[] = ["ADMIN", "ACCOUNTING", "VIEWER", "EMPLOYEE"];
const permissionMenus: PermissionMenu[] = [
  "PAYROLL",
  "PAYROLL_EMPLOYEES",
  "PAYROLL_INPUT",
  "BONUS_INPUT",
  "RATES",
  "TAX_IMPORT",
  "PAYSLIP",
  "BONUS_SLIP",
  "SES",
  "SES_CUSTOMERS",
  "SES_PROJECTS",
  "SES_INVOICES",
  "SES_PARTNER_COSTS",
  "SES_REVENUE",
  "SES_MASTERS",
  "SES_PROFIT",
  "USERS",
  "PERMISSIONS"
];
const menuLabels: Record<PermissionMenu, string> = {
  PAYROLL: "\u7d66\u4e0e\u7ba1\u7406",
  PAYROLL_EMPLOYEES: "\u793e\u54e1\u4e00\u89a7",
  PAYROLL_INPUT: "\u7d66\u4e0e\u5165\u529b",
  BONUS_INPUT: "\u8cde\u4e0e\u5165\u529b",
  RATES: "\u5e74\u5ea6\u6599\u7387",
  TAX_IMPORT: "\u6240\u5f97\u7a0e\u8868\u30a4\u30f3\u30dd\u30fc\u30c8",
  PAYSLIP: "\u7d66\u4e0e\u660e\u7d30",
  BONUS_SLIP: "\u8cde\u4e0e\u660e\u7d30",
  SES: "SES\u7ba1\u7406",
  SES_CUSTOMERS: "\u53d6\u5f15\u5148\u7ba1\u7406",
  SES_PROJECTS: "\u6848\u4ef6\u30fb\u5951\u7d04\u7ba1\u7406",
  SES_INVOICES: "\u8acb\u6c42\u7ba1\u7406",
  SES_PARTNER_COSTS: "\u5916\u6ce8\u8cbb\u5165\u529b",
  SES_REVENUE: "\u5e74\u9593\u58f2\u4e0a",
  SES_MASTERS: "\u30de\u30b9\u30bf\u7ba1\u7406",
  SES_PROFIT: "\u500b\u4eba\u5225\u5229\u76ca",
  USERS: "\u30e6\u30fc\u30b6\u30fc\u7ba1\u7406",
  PERMISSIONS: "\u6a29\u9650\u7ba1\u7406"
};
const payrollPermissionMenus = permissionMenus.filter((item) => item === "PAYROLL" || item.startsWith("PAYROLL_") || ["BONUS_INPUT", "RATES", "TAX_IMPORT", "PAYSLIP", "BONUS_SLIP"].includes(item));
const sesPermissionMenus = permissionMenus.filter((item) => item === "SES" || item.startsWith("SES_"));
const adminPermissionMenus: PermissionMenu[] = ["USERS", "PERMISSIONS"];
const loggedIn = ref(false);
const loading = ref(false);
const message = ref("");
const loginMessage = ref("");
const sesMessage = ref("");
const permissionMessage = ref("");
const systemName = ref("給与管理クラウド");
const me = ref<AppUser | null>(null);
const activeMenu = ref<"payroll" | "ses" | "users" | "permissions">("payroll");
const query = ref("");
const period = ref(today);
const pdfRangeStart = ref(today);
const pdfRangeEnd = ref(today);
const pdfOutputMode = ref<"zip" | "single">("zip");
const pdfIncludeBonus = ref(false);
const employees = ref<Employee[]>([]);
const payrolls = ref<Payroll[]>([]);
const bonuses = ref<Bonus[]>([]);
const users = ref<AppUser[]>([]);
const permissionRoleMasters = ref<PermissionRoleMaster[]>([]);
const rolePermissions = ref<RolePermission[]>([]);
const userPermissions = ref<RolePermission[]>([]);
const selectedPermissionRoleId = ref("");
const fiscalRates = ref<FiscalRate[]>([]);
const incomeTaxBrackets = ref<IncomeTaxBracket[]>([]);
const selectedEmployeeId = ref("");
const collapsedSections = reactive<Record<string, boolean>>({});

const loginForm = reactive({ email: "admin@example.com", password: "" });
const userForm = reactive({
  id: "",
  email: "",
  name: "",
  role: "VIEWER" as UserRole,
  permissionRoleId: "",
  employeeId: "",
  password: "",
  isActive: true
});
const permissionRoleForm = reactive({
  id: "",
  code: "",
  name: "",
  baseRole: "VIEWER" as UserRole,
  isActive: true
});
const employeeForm = reactive({
  id: "",
  employeeNo: "",
  name: "",
  position: "",
  email: "",
  defaultDependentCount: 0,
  employmentInsuranceEnrolled: true,
  payType: "MONTHLY" as PayType,
  basePay: 0,
  fixedOvertimeAllowance: 0,
  memo: ""
});
const payrollForm = reactive({
  workDays: 20,
  workHours: 160,
  overtimeHours: 0,
  allowance: 0,
  fixedDeduction: 0,
  residentTax: 0,
  dormitoryFee: 0,
  dependentCount: 0,
  socialInsuranceEnrolled: true,
  socialInsuranceBaseAmount: 0,
  note: ""
});
const bonusForm = reactive({
  bonusAmount: 0,
  socialInsuranceEnrolled: true,
  socialInsuranceBaseAmount: 0,
  note: ""
});
const rateForm = reactive<FiscalRate>({
  fiscalYear: thisFiscalYear,
  overtimeRate: 1.25,
  incomeTaxRate: 0.03,
  socialInsuranceRate: 0.15,
  healthInsuranceRate: 0.05,
  pensionInsuranceRate: 0.1,
  childCareSupportRate: 0,
  employmentInsuranceRate: 0.006,
  memo: ""
});
const taxImport = reactive({
  csv: "fiscalYear,dependentCount,minTaxable,maxTaxable,taxAmount\n2026,0,0,88000,0\n2026,0,88001,99000,130\n2026,1,0,99000,0\n"
});
const roleRank: Record<UserRole, number> = { EMPLOYEE: 0, VIEWER: 1, ACCOUNTING: 2, ADMIN: 3 };
function defaultPermission(role: UserRole, menu: PermissionMenu): RolePermission {
  if (role === "ADMIN") return { role, menu, canShow: true, canView: true, canEdit: true, canViewAll: true };
  if (menu === "USERS" || menu === "PERMISSIONS") return { role, menu, canShow: false, canView: false, canEdit: false, canViewAll: false };
  if (role === "ACCOUNTING") return { role, menu, canShow: true, canView: true, canEdit: true, canViewAll: true };
  if (role === "VIEWER") return { role, menu, canShow: true, canView: true, canEdit: false, canViewAll: true };
  const canUse = menu.startsWith("PAYROLL") || menu === "BONUS_INPUT" || menu === "RATES" || menu === "TAX_IMPORT" || menu === "PAYSLIP" || menu === "BONUS_SLIP";
  return { role, menu, canShow: canUse, canView: canUse, canEdit: false, canViewAll: false };
}

function permissionFor(menu: PermissionMenu) {
  const role = me.value?.role || "EMPLOYEE";
  return me.value?.permissions?.find((permission) => permission.menu === menu)
    || rolePermissions.value.find((permission) => permission.role === role && permission.menu === menu)
    || defaultPermission(role, menu);
}

function canShowMenu(menu: PermissionMenu) {
  return permissionFor(menu).canShow;
}

const canManageUsers = computed(() => me.value?.role === "ADMIN");
const canShowPayroll = computed(() => !!me.value && permissionFor("PAYROLL").canShow);
const canViewPayroll = computed(() => !!me.value && permissionFor("PAYROLL").canView);
const canEditPayroll = computed(() => !!me.value && permissionFor("PAYROLL").canEdit);
const canViewAll = computed(() => !!me.value && permissionFor("PAYROLL").canViewAll);
const canShowSes = computed(() => !!me.value && permissionFor("SES").canShow);
const canViewSes = computed(() => !!me.value && permissionFor("SES").canView);
const canEditSes = computed(() => !!me.value && permissionFor("SES").canEdit);
const canShowUsers = computed(() => !!me.value && permissionFor("USERS").canShow);
const canViewUsers = computed(() => !!me.value && permissionFor("USERS").canView);
const canEditUsers = computed(() => !!me.value && permissionFor("USERS").canEdit);
const canShowPermissions = computed(() => !!me.value && permissionFor("PERMISSIONS").canShow);
const canViewPermissions = computed(() => !!me.value && permissionFor("PERMISSIONS").canView);
const canEditPermissions = computed(() => !!me.value && permissionFor("PERMISSIONS").canEdit);
const selectedEmployee = computed(() => employees.value.find((employee) => employee.id === selectedEmployeeId.value));
const selectedPayroll = computed(() => payrolls.value.find((payroll) => payroll.employeeId === selectedEmployeeId.value));
const selectedBonus = computed(() => bonuses.value.find((bonus) => bonus.employeeId === selectedEmployeeId.value));
const activeRate = computed(() => fiscalRates.value.find((rate) => rate.fiscalYear === fiscalYearFromPeriod(period.value)));
const isPayrollLocked = computed(() => isPayrollLockedPeriod(period.value));
const payrollLockMessage = computed(() => `${period.value}の給与データは28日以降ロックされています。変更する場合は「強制変更して保存」を押してください。`);
const bonusLockMessage = computed(() => `${period.value}の賞与データは28日以降ロックされています。変更する場合は「強制変更して保存」を押してください。`);
const isBonusPaymentMonth = computed(() => bonusPaymentMonths.includes(monthFromPeriod(period.value)));
const bonusPaymentMessage = computed(() => isBonusPaymentMonth.value
  ? `${period.value}は通常の賞与支給月です。`
  : "通常の賞与支給月は4月末・10月末です。臨時賞与がある場合のみ入力してください。"
);
const totals = computed(() => payrolls.value.reduce(
  (acc, payroll) => {
    acc.gross += payroll.grossPay;
    acc.deduction += payroll.totalDeduction;
    acc.net += payroll.netPay;
    return acc;
  },
  { gross: 0, deduction: 0, net: 0 }
));
const bonusTotals = computed(() => bonuses.value.reduce(
  (acc, bonus) => {
    acc.gross += bonus.bonusAmount;
    acc.deduction += bonus.totalDeduction;
    acc.net += bonus.netPay;
    return acc;
  },
  { gross: 0, deduction: 0, net: 0 }
));

function fiscalYearFromPeriod(value: string) {
  const [year, month] = value.split("-").map(Number);
  return month >= 4 ? year : year - 1;
}

function safeFilePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function periodForFile(value: string) {
  return value.replace("-", "");
}

function resetPayrollForm(employee: Employee) {
  Object.assign(payrollForm, {
    workDays: 20,
    workHours: 160,
    overtimeHours: 0,
    allowance: 0,
    fixedDeduction: 0,
    residentTax: 0,
    dormitoryFee: 0,
    dependentCount: employee.defaultDependentCount || 0,
    socialInsuranceEnrolled: true,
    socialInsuranceBaseAmount: 0,
    note: ""
  });
}

function resetBonusForm() {
  Object.assign(bonusForm, {
    bonusAmount: 0,
    socialInsuranceEnrolled: true,
    socialInsuranceBaseAmount: 0,
    note: ""
  });
}

function resetUserForm() {
  Object.assign(userForm, {
    id: "",
    email: "",
    name: "",
    role: "VIEWER" as UserRole,
    permissionRoleId: "",
    employeeId: "",
    password: "",
    isActive: true
  });
  userPermissions.value = permissionMenus.map((menu) => ({ ...permissionRow("VIEWER", menu), role: "VIEWER" }));
}

function resetPermissionRoleForm() {
  Object.assign(permissionRoleForm, {
    id: "",
    code: "",
    name: "",
    baseRole: "VIEWER" as UserRole,
    isActive: true
  });
  selectedPermissionRoleId.value = "";
  rolePermissions.value = permissionMenus.map((menu) => ({ ...permissionRow("VIEWER", menu), role: "VIEWER" }));
}

function permissionRow(role: UserRole, menu: PermissionMenu) {
  let permission = rolePermissions.value.find((item) => item.menu === menu);
  if (!permission) {
    permission = defaultPermission(role, menu);
    rolePermissions.value.push(permission);
  }
  return permission;
}

function userPermissionRow(menu: PermissionMenu) {
  let permission = userPermissions.value.find((item) => item.menu === menu);
  if (!permission) {
    permission = { ...permissionRow(userForm.role, menu), role: userForm.role };
    userPermissions.value.push(permission);
  }
  return permission;
}

function isPermissionGroupChecked(menus: PermissionMenu[], flag: PermissionFlag) {
  return menus.every((menu) => !!permissionRow(permissionRoleForm.baseRole, menu)[flag]);
}

function setPermissionGroup(menus: PermissionMenu[], flag: PermissionFlag, checked: boolean) {
  menus.forEach((menu) => {
    permissionRow(permissionRoleForm.baseRole, menu)[flag] = checked;
  });
}

function normalizeActiveMenu() {
  if (activeMenu.value === "payroll" && !canShowPayroll.value && canShowSes.value) activeMenu.value = "ses";
  if (activeMenu.value === "ses" && !canShowSes.value && canShowPayroll.value) activeMenu.value = "payroll";
  if (activeMenu.value === "users" && !canShowUsers.value && canShowPayroll.value) activeMenu.value = "payroll";
  if (activeMenu.value === "permissions" && !canShowPermissions.value && canShowPayroll.value) activeMenu.value = "payroll";
}

async function refreshRolePermissions() {
  if (!canManageUsers.value) {
    rolePermissions.value = [];
    permissionRoleMasters.value = [];
    return;
  }
  permissionRoleMasters.value = await request<PermissionRoleMaster[]>("/permission-roles");
  if (selectedPermissionRoleId.value) {
    rolePermissions.value = await request<RolePermission[]>(`/role-permissions?permissionRoleId=${encodeURIComponent(selectedPermissionRoleId.value)}`);
  } else {
    rolePermissions.value = permissionMenus.map((menu) => ({ ...permissionRow(permissionRoleForm.baseRole, menu), role: permissionRoleForm.baseRole }));
  }
}

async function refreshUserPermissions() {
  if (!canManageUsers.value || !userForm.id) {
    userPermissions.value = permissionMenus.map((menu) => ({ ...permissionRow(userForm.role, menu), role: userForm.role }));
    return;
  }
  userPermissions.value = await request<RolePermission[]>(`/users/${userForm.id}/permissions`);
}

function onUserRoleChange() {
  userPermissions.value = permissionMenus.map((menu) => ({ ...permissionRow(userForm.role, menu), role: userForm.role }));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include",
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "通信に失敗しました" }));
    throw new Error(error.message || "通信に失敗しました");
  }
  return response.json();
}

async function refreshPublicSettings() {
  const settings = await request<PublicSettings>("/public-settings");
  systemName.value = settings.systemName || "給与管理クラウド";
  document.title = systemName.value;
}

function applyEmployee(employee?: Employee) {
  const target = employee || {
    id: "",
    employeeNo: nextEmployeeNo(),
    name: "",
    position: "",
    email: "",
    defaultDependentCount: 0,
    employmentInsuranceEnrolled: true,
    payType: "MONTHLY" as PayType,
    basePay: 0,
    fixedOvertimeAllowance: 0,
    memo: ""
  };
  employeeForm.id = target.id;
  employeeForm.employeeNo = target.employeeNo;
  employeeForm.name = target.name;
  employeeForm.position = target.position || "";
  employeeForm.email = target.email || "";
  employeeForm.defaultDependentCount = target.defaultDependentCount || 0;
  employeeForm.employmentInsuranceEnrolled = target.employmentInsuranceEnrolled ?? true;
  employeeForm.payType = target.payType;
  employeeForm.basePay = target.basePay;
  employeeForm.fixedOvertimeAllowance = target.fixedOvertimeAllowance || 0;
  employeeForm.memo = target.memo || "";
  selectedEmployeeId.value = target.id;

  const payroll = payrolls.value.find((item) => item.employeeId === target.id);
  if (payroll) {
    applyPayrollInput(payroll);
  } else {
    resetPayrollForm(target);
  }

  const bonus = bonuses.value.find((item) => item.employeeId === target.id);
  if (bonus) {
    applyBonusInput(bonus);
  } else {
    resetBonusForm();
  }
}

function applyUser(user?: AppUser) {
  if (!user) {
    resetUserForm();
    return;
  }
  Object.assign(userForm, {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissionRoleId: user.permissionRoleId || "",
    employeeId: user.employeeId || "",
    password: "",
    isActive: user.isActive
  });
  void refreshUserPermissions();
}

async function applyPermissionRole(role?: PermissionRoleMaster) {
  permissionMessage.value = "";
  if (!role) {
    resetPermissionRoleForm();
    return;
  }
  Object.assign(permissionRoleForm, {
    id: role.id,
    code: role.code,
    name: role.name,
    baseRole: role.baseRole,
    isActive: role.isActive
  });
  selectedPermissionRoleId.value = role.id;
  rolePermissions.value = await request<RolePermission[]>(`/role-permissions?permissionRoleId=${encodeURIComponent(role.id)}`);
}

function applyRate(rate: FiscalRate) {
  const fallbackSocialInsuranceRate = Number(rate.socialInsuranceRate || 0);
  const healthInsuranceRate = Number(rate.healthInsuranceRate ?? fallbackSocialInsuranceRate / 2);
  const pensionInsuranceRate = Number(rate.pensionInsuranceRate ?? fallbackSocialInsuranceRate - healthInsuranceRate);
  const childCareSupportRate = Number(rate.childCareSupportRate || 0);
  Object.assign(rateForm, {
    fiscalYear: rate.fiscalYear,
    overtimeRate: Number(rate.overtimeRate),
    incomeTaxRate: Number(rate.incomeTaxRate),
    socialInsuranceRate: healthInsuranceRate + pensionInsuranceRate + childCareSupportRate,
    healthInsuranceRate,
    pensionInsuranceRate,
    childCareSupportRate,
    employmentInsuranceRate: Number(rate.employmentInsuranceRate),
    memo: rate.memo || ""
  });
}

function nextEmployeeNo() {
  return `E${String(employees.value.length + 1).padStart(3, "0")}`;
}

function applyPayrollInput(payroll: Payroll) {
  payrollForm.dependentCount = payroll.dependentCount;
  payrollForm.socialInsuranceEnrolled = payroll.socialInsuranceEnrolled;
  payrollForm.socialInsuranceBaseAmount = payroll.socialInsuranceBaseAmount || 0;
  payrollForm.workDays = Number(payroll.workDays);
  payrollForm.workHours = Number(payroll.workHours);
  payrollForm.overtimeHours = Number(payroll.overtimeHours);
  payrollForm.allowance = payroll.allowance;
  payrollForm.fixedDeduction = payroll.fixedDeduction;
  payrollForm.residentTax = payroll.residentTax || 0;
  payrollForm.dormitoryFee = payroll.dormitoryFee || 0;
  payrollForm.note = payroll.note || "";
}

function applyBonusInput(bonus: Bonus) {
  bonusForm.bonusAmount = bonus.bonusAmount;
  bonusForm.socialInsuranceEnrolled = bonus.socialInsuranceEnrolled;
  bonusForm.socialInsuranceBaseAmount = bonus.socialInsuranceBaseAmount || 0;
  bonusForm.note = bonus.note || "";
}

async function login() {
  loading.value = true;
  loginMessage.value = "";
  message.value = "";
  try {
    me.value = await request<AppUser>("/login", { method: "POST", body: JSON.stringify(loginForm) });
    loggedIn.value = true;
    await refresh();
  } catch (error) {
    loginMessage.value = error instanceof Error ? error.message : "ログインできません";
  } finally {
    loading.value = false;
  }
}

async function logout() {
  await request("/logout", { method: "POST" });
  loggedIn.value = false;
  me.value = null;
  message.value = "";
  loginMessage.value = "";
}

async function refresh() {
  loading.value = true;
  try {
    const fiscalYear = fiscalYearFromPeriod(period.value);
    const q = encodeURIComponent(query.value);
    const [employeeData, payrollData, bonusData, fiscalRateData, taxData] = await Promise.all([
      request<Employee[]>(`/employees?q=${q}`),
      request<Payroll[]>(`/payrolls?period=${encodeURIComponent(period.value)}&q=${q}`),
      request<Bonus[]>(`/bonuses?period=${encodeURIComponent(period.value)}&q=${q}`),
      request<FiscalRate[]>("/fiscal-rates"),
      request<IncomeTaxBracket[]>(`/income-tax-brackets?fiscalYear=${fiscalYear}`)
    ]);
    employees.value = employeeData;
    payrolls.value = payrollData;
    bonuses.value = bonusData;
    fiscalRates.value = fiscalRateData;
    incomeTaxBrackets.value = taxData;
    users.value = canManageUsers.value ? await request<AppUser[]>("/users") : [];
    await refreshRolePermissions();
    normalizeActiveMenu();
    if (!selectedEmployeeId.value && employees.value[0]) applyEmployee(employees.value[0]);
    const current = fiscalRateData.find((rate) => rate.fiscalYear === fiscalYear);
    if (current) applyRate(current);
  } finally {
    loading.value = false;
  }
}

async function saveRate() {
  if (!canEditPayroll.value) return;
  const healthInsuranceRate = Number(rateForm.healthInsuranceRate || 0);
  const pensionInsuranceRate = Number(rateForm.pensionInsuranceRate || 0);
  const childCareSupportRate = Number(rateForm.childCareSupportRate || 0);
  await request("/fiscal-rates", {
    method: "POST",
    body: JSON.stringify({
      ...rateForm,
      healthInsuranceRate,
      pensionInsuranceRate,
      childCareSupportRate,
      socialInsuranceRate: healthInsuranceRate + pensionInsuranceRate + childCareSupportRate
    })
  });
  message.value = "年度料率を保存しました";
  await refresh();
}

async function importIncomeTaxTable() {
  if (!canEditPayroll.value) return;
  const result = await request<{ imported: number; fiscalYears: number[] }>("/income-tax-brackets/import", {
    method: "POST",
    body: JSON.stringify({ csv: taxImport.csv })
  });
  message.value = `所得税表を取り込みました: ${result.imported}件`;
  await refresh();
}

async function saveEmployee() {
  if (!canEditPayroll.value) return;
  const method = employeeForm.id ? "PUT" : "POST";
  const path = employeeForm.id ? `/employees/${employeeForm.id}` : "/employees";
  const employee = await request<Employee>(path, { method, body: JSON.stringify(employeeForm) });
  message.value = "社員情報を保存しました";
  await refresh();
  applyEmployee(employee);
  payrollForm.dependentCount = employee.defaultDependentCount || 0;
}

async function deleteEmployee() {
  if (!canEditPayroll.value) return;
  if (!employeeForm.id || !confirm("この社員を非表示にしますか？")) return;
  await request(`/employees/${employeeForm.id}`, { method: "DELETE" });
  selectedEmployeeId.value = "";
  message.value = "社員を非表示にしました";
  await refresh();
}

async function saveUser() {
  if (!canManageUsers.value) return;
  if (!userForm.id && !userForm.password) {
    message.value = "新規ユーザーはパスワードが必要です";
    return;
  }
  const method = userForm.id ? "PUT" : "POST";
  const path = userForm.id ? `/users/${userForm.id}` : "/users";
  const saved = await request<AppUser>(path, {
    method,
    body: JSON.stringify({
      ...userForm,
      employeeId: userForm.employeeId || null,
      password: userForm.password || undefined
    })
  });
  message.value = "ユーザーを保存しました";
  await refresh();
  applyUser(saved);
}

async function saveRolePermissions() {
  if (!canManageUsers.value) return;
  if (!permissionRoleForm.id) {
    permissionMessage.value = "\u5148\u306b\u30ed\u30fc\u30eb\u3092\u4fdd\u5b58\u3057\u3066\u304f\u3060\u3055\u3044";
    return;
  }
  permissionMessage.value = "";
  try {
    const permissions = permissionMenus.map((menu) => permissionRow(permissionRoleForm.baseRole, menu));
    const saved = await request<RolePermission[]>("/role-permissions", {
      method: "PUT",
      body: JSON.stringify({ permissionRoleId: permissionRoleForm.id, permissions })
    });
    rolePermissions.value = saved;
    if (me.value) {
      me.value.permissions = saved.filter((permission) => permission.role === me.value?.role);
    }
    permissionMessage.value = "\u6a29\u9650\u8a2d\u5b9a\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f";
  } catch (error) {
    permissionMessage.value = error instanceof Error ? error.message : "\u6a29\u9650\u8a2d\u5b9a\u3092\u4fdd\u5b58\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f";
  }
}

async function savePermissionRole() {
  if (!canManageUsers.value) return;
  permissionMessage.value = "";
  try {
    const method = permissionRoleForm.id ? "PUT" : "POST";
    const path = permissionRoleForm.id ? `/permission-roles/${permissionRoleForm.id}` : "/permission-roles";
    const saved = await request<PermissionRoleMaster>(path, { method, body: JSON.stringify(permissionRoleForm) });
    await refreshRolePermissions();
    await applyPermissionRole(saved);
    permissionMessage.value = "\u30ed\u30fc\u30eb\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f";
  } catch (error) {
    permissionMessage.value = error instanceof Error ? error.message : "\u30ed\u30fc\u30eb\u3092\u4fdd\u5b58\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f";
  }
}

async function deletePermissionRole() {
  if (!canManageUsers.value || !permissionRoleForm.id || !confirm("\u3053\u306e\u30ed\u30fc\u30eb\u3092\u975e\u8868\u793a\u306b\u3057\u307e\u3059\u304b\uff1f")) return;
  permissionMessage.value = "";
  try {
    await request(`/permission-roles/${permissionRoleForm.id}`, { method: "DELETE" });
    resetPermissionRoleForm();
    await refreshRolePermissions();
    permissionMessage.value = "\u30ed\u30fc\u30eb\u3092\u975e\u8868\u793a\u306b\u3057\u307e\u3057\u305f";
  } catch (error) {
    permissionMessage.value = error instanceof Error ? error.message : "\u30ed\u30fc\u30eb\u3092\u975e\u8868\u793a\u306b\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f";
  }
}

async function saveUserPermissions() {
  if (!canManageUsers.value || !userForm.id) return;
  const saved = await request<RolePermission[]>(`/users/${userForm.id}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permissions: permissionMenus.map((menu) => userPermissionRow(menu)) })
  });
  userPermissions.value = saved;
  if (me.value?.id === userForm.id) {
    me.value.permissions = saved;
  }
  message.value = "\u30e6\u30fc\u30b6\u30fc\u500b\u5225\u6a29\u9650\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f";
}

async function deactivateUser() {
  if (!canManageUsers.value || !userForm.id || !confirm("このユーザーを停止しますか？")) return;
  await request(`/users/${userForm.id}`, { method: "DELETE" });
  message.value = "ユーザーを停止しました";
  resetUserForm();
  await refresh();
}

async function savePayroll(forceUpdate = false) {
  if (!canEditPayroll.value) return;
  if (!selectedEmployee.value) {
    message.value = "社員を選択してください";
    return;
  }
  if (isPayrollLocked.value && !forceUpdate) {
    message.value = payrollLockMessage.value;
    return;
  }
  try {
    await request("/payrolls", {
      method: "POST",
      body: JSON.stringify({ employeeId: selectedEmployee.value.id, period: period.value, forceUpdate, ...payrollForm })
    });
    message.value = forceUpdate
      ? "給与を強制変更して保存しました。"
      : "給与を保存しました。所得税は年度表から自動で参照されます。";
    await refresh();
  } catch (error) {
    message.value = error instanceof Error ? error.message : "給与を保存できませんでした";
  }
}

async function saveBonus(forceUpdate = false) {
  if (!canEditPayroll.value) return;
  if (!selectedEmployee.value) {
    message.value = "社員を選択してください";
    return;
  }
  if (isPayrollLocked.value && !forceUpdate) {
    message.value = bonusLockMessage.value;
    return;
  }
  try {
    await request("/bonuses", {
      method: "POST",
      body: JSON.stringify({
        employeeId: selectedEmployee.value.id,
        period: period.value,
        forceUpdate,
        incomeTaxRate: rateForm.incomeTaxRate,
        ...bonusForm
      })
    });
    message.value = forceUpdate ? "賞与を強制変更して保存しました。" : "賞与を保存しました。";
    await refresh();
  } catch (error) {
    message.value = error instanceof Error ? error.message : "賞与を保存できませんでした";
  }
}

async function usePreviousPayrollInput() {
  if (!canEditPayroll.value) return;
  const currentEmployeeId = employeeForm.id || selectedEmployeeId.value;
  if (!currentEmployeeId || !selectedEmployee.value) {
    message.value = "社員を選択してください";
    return;
  }

  const params = new URLSearchParams({
    employeeId: currentEmployeeId,
    beforePeriod: period.value
  });
  try {
    const payroll = await request<Payroll>(`/payrolls/latest-template?${params.toString()}`);
    if (payroll.employeeId !== currentEmployeeId) {
      message.value = "選択中の社員と異なる過去入力のため利用しませんでした";
      return;
    }
    applyPayrollInput(payroll);
    message.value = `${payroll.employee.name}さんの${payroll.period}の給与入力を利用しました`;
  } catch (error) {
    message.value = error instanceof Error ? error.message : "過去入力を利用できませんでした";
  }
}

async function sendPayslipEmail() {
  if (!canEditPayroll.value) return;
  if (!selectedPayroll.value) {
    message.value = "先に給与を保存してください";
    return;
  }
  await request<Payroll>(`/payrolls/${selectedPayroll.value.id}/email`, { method: "POST" });
  message.value = "給与明細PDFをメール送信しました";
  await refresh();
}

async function downloadPayslipPdf() {
  if (!selectedPayroll.value) {
    message.value = "先に給与を保存してください";
    return;
  }

  const payroll = selectedPayroll.value;
  const response = await fetch(`/api/payrolls/${payroll.id}/pdf`, { credentials: "include" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "PDFダウンロードに失敗しました" }));
    throw new Error(error.message || "PDFダウンロードに失敗しました");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `給与明細_${periodForFile(payroll.period)}_${safeFilePart(payroll.employee.name)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  message.value = "給与明細PDFをダウンロードしました";
}

async function downloadBonusPdf() {
  if (!selectedBonus.value) {
    message.value = "先に賞与を保存してください";
    return;
  }

  const bonus = selectedBonus.value;
  const response = await fetch(`/api/bonuses/${bonus.id}/pdf`, { credentials: "include" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "賞与明細PDFダウンロードに失敗しました" }));
    throw new Error(error.message || "賞与明細PDFダウンロードに失敗しました");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `賞与明細_${periodForFile(bonus.period)}_${safeFilePart(bonus.employee.name)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  message.value = "賞与明細PDFをダウンロードしました";
}

async function downloadPayslipPdfRange() {
  if (pdfRangeStart.value > pdfRangeEnd.value) {
    message.value = "開始月は終了月以前を指定してください";
    return;
  }

  const params = new URLSearchParams({
    startPeriod: pdfRangeStart.value,
    endPeriod: pdfRangeEnd.value,
    mode: pdfOutputMode.value
  });
  if (pdfIncludeBonus.value) params.set("includeBonus", "true");
  if (query.value.trim()) params.set("q", query.value.trim());
  const response = await fetch(`/api/payrolls/pdf-range?${params.toString()}`, { credentials: "include" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "給与明細PDF一括ダウンロードに失敗しました" }));
    message.value = error.message || "給与明細PDF一括ダウンロードに失敗しました";
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const extension = pdfOutputMode.value === "single" ? "pdf" : "zip";
  const prefix = pdfIncludeBonus.value ? "給与賞与明細" : "給与明細";
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}_${periodForFile(pdfRangeStart.value)}_${periodForFile(pdfRangeEnd.value)}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  message.value = pdfOutputMode.value === "single"
    ? `${prefix}PDFを1つのPDFでダウンロードしました`
    : `${prefix}PDFをZIPで一括ダウンロードしました`;
}

function exportCsv() {
  const header = ["支給月", "社員番号", "氏名", "給与区分", "扶養人数", "社会保険加入", "社会保険適用金額", "課税対象額", "所得税", "健康・介護保険", "厚生年金保険", "子ども・子育て支援金", "社会保険合計", "雇用保険適用", "雇用保険", "住民税", "寮使用料", "固定残業手当", "総支給額", "控除合計", "差引支給額", "メール送信日時"];
  const rows = payrolls.value.map((payroll) => [
    payroll.period,
    payroll.employee.employeeNo,
    payroll.employee.name,
    payroll.employee.payType === "MONTHLY" ? "月給" : "時給",
    payroll.dependentCount,
    payroll.socialInsuranceEnrolled ? "加入" : "未加入",
    payroll.socialInsuranceBaseAmount || "",
    payroll.taxableIncome || "",
    payroll.incomeTax,
    payroll.healthInsurance,
    payroll.pensionInsurance,
    payroll.childCareSupport,
    payroll.socialInsurance,
    payroll.employmentInsuranceEnrolled ? "適用" : "対象外",
    payroll.employmentInsurance,
    payroll.residentTax,
    payroll.dormitoryFee,
    payroll.fixedOvertimeAllowance,
    payroll.grossPay,
    payroll.totalDeduction,
    payroll.netPay,
    payroll.emailedAt || ""
  ]);
  const csv = "\ufeff" + [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `payroll-${period.value}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportBonusCsv() {
  const header = ["支給月", "社員番号", "氏名", "賞与額", "課税対象額", "賞与所得税", "健康・介護保険", "厚生年金保険", "子ども・子育て支援金", "社会保険合計", "雇用保険適用", "雇用保険", "控除合計", "差引支給額", "備考"];
  const rows = bonuses.value.map((bonus) => [
    bonus.period,
    bonus.employee.employeeNo,
    bonus.employee.name,
    bonus.bonusAmount,
    bonus.taxableIncome,
    bonus.incomeTax,
    bonus.healthInsurance,
    bonus.pensionInsurance,
    bonus.childCareSupport,
    bonus.socialInsurance,
    bonus.employmentInsuranceEnrolled ? "適用" : "対象外",
    bonus.employmentInsurance,
    bonus.totalDeduction,
    bonus.netPay,
    bonus.note || ""
  ]);
  const csv = "\ufeff" + [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `bonus-${period.value}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function toggleSection(id: string) {
  collapsedSections[id] = !collapsedSections[id];
}

function sectionHeadClass(id: string) {
  return { collapsed: collapsedSections[id] };
}

onMounted(async () => {
  await refreshPublicSettings().catch(() => {
    document.title = systemName.value;
  });
  try {
    me.value = await request<AppUser>("/me");
    loggedIn.value = true;
    await refresh();
  } catch {
    loggedIn.value = false;
    me.value = null;
  }
});
</script>

<template>
  <main v-if="!loggedIn" class="login-page">
    <form class="login-panel" @submit.prevent="login">
      <div class="login-brand">
        <img src="/logo_rcloud.png" alt="R Cloud" />
        <h1>{{ systemName }}</h1>
      </div>
      <label>メールアドレス<input v-model="loginForm.email" type="email" autocomplete="username" required /></label>
      <label>パスワード<input v-model="loginForm.password" type="password" autocomplete="current-password" required /></label>
      <button class="primary" :disabled="loading">ログイン</button>
      <p v-if="loginMessage" class="message">{{ loginMessage }}</p>
    </form>
  </main>

  <main v-else class="app-shell">
    <header class="topbar">
      <div class="brand">
        <img src="/logo_rcloud.png" alt="R Cloud" />
        <div>
        <h1>{{ systemName }}</h1>
        <p>{{ me ? `${me.name} / ${roleLabels[me.role]}` : "Vue + Hono + PostgreSQL / Railway" }}</p>
        </div>
      </div>
      <div class="actions">
        <button @click="refresh"><RefreshCw :size="16" />更新</button>
        <button v-if="canViewAll" @click="exportCsv"><Download :size="16" />CSV出力</button>
        <button v-if="canViewAll" @click="exportBonusCsv"><Download :size="16" />賞与CSV出力</button>
        <button @click="logout"><LogOut :size="16" />ログアウト</button>
      </div>
    </header>

    <nav class="main-menu">
      <button v-if="canShowPayroll" :class="{ active: activeMenu === 'payroll' }" @click="activeMenu = 'payroll'">給与管理</button>
      <button v-if="canShowSes" :class="{ active: activeMenu === 'ses' }" @click="activeMenu = 'ses'">SES管理</button>
      <button v-if="canShowUsers" :class="{ active: activeMenu === 'users' }" @click="activeMenu = 'users'">ユーザー管理</button>
      <button v-if="canShowPermissions" :class="{ active: activeMenu === 'permissions' }" @click="activeMenu = 'permissions'">権限管理</button>
    </nav>

    <div v-if="message" class="message operation-message">{{ message }}</div>

    <section v-if="activeMenu === 'payroll' && canViewPayroll" class="filters">
      <div class="filter-row search-row">
        <label>支給月<input v-model="period" type="month" @change="refresh" /></label>
        <label v-if="canViewAll">社員検索<input v-model="query" placeholder="氏名・社員番号" @keyup.enter="refresh" /></label>
        <button v-if="canViewAll" class="primary" @click="refresh"><Search :size="16" />検索</button>
      </div>
      <div v-if="canViewAll" class="filter-row download-row">
        <label>PDF開始月<input v-model="pdfRangeStart" type="month" /></label>
        <label>PDF終了月<input v-model="pdfRangeEnd" type="month" /></label>
        <label>PDF出力形式<select v-model="pdfOutputMode"><option value="zip">個別PDFをZIP</option><option value="single">1つのPDF</option></select></label>
        <label class="inline-check"><input v-model="pdfIncludeBonus" type="checkbox" />賞与含み</label>
        <button @click="downloadPayslipPdfRange"><Download :size="16" />PDF一括DL</button>
      </div>
    </section>

    <section v-if="activeMenu === 'payroll' && canViewPayroll" class="summary">
      <div><span>社員数</span><strong>{{ employees.length }}名</strong></div>
      <div><span>総支給額</span><strong>{{ yen.format(totals.gross) }}</strong></div>
      <div><span>控除合計</span><strong>{{ yen.format(totals.deduction) }}</strong></div>
      <div><span>差引支給額</span><strong>{{ yen.format(totals.net) }}</strong></div>
      <div><span>賞与支給額</span><strong>{{ yen.format(bonusTotals.gross) }}</strong></div>
      <div><span>賞与差引額</span><strong>{{ yen.format(bonusTotals.net) }}</strong></div>
    </section>

    <div v-if="activeMenu === 'payroll' && canViewPayroll" class="workspace">
      <section v-if="canShowMenu('PAYROLL_EMPLOYEES')" class="panel employee-list">
        <div class="panel-head" :class="sectionHeadClass('employees')" @click="toggleSection('employees')">
          <h2>社員</h2>
          <button v-if="canEditPayroll" @click.stop="applyEmployee()"><Plus :size="16" />追加</button>
        </div>
        <button
          v-for="employee in employees"
          :key="employee.id"
          v-show="!collapsedSections.employees"
          class="employee-item"
          :class="{ active: employee.id === selectedEmployeeId }"
          @click="applyEmployee(employee)"
        >
          <strong>{{ employee.name }}</strong>
          <span>{{ employee.employeeNo }} / 扶養人数: {{ employee.defaultDependentCount }}</span>
        </button>
      </section>

      <section class="panel">
        <div v-if="canShowMenu('PAYROLL_INPUT')" class="panel-head" :class="sectionHeadClass('employeePayroll')" @click="toggleSection('employeePayroll')"><h2>社員・給与入力</h2></div>
        <div v-if="canEditPayroll && canShowMenu('PAYROLL_INPUT')" v-show="!collapsedSections.employeePayroll" class="form-grid">
          <label>社員番号<input v-model="employeeForm.employeeNo" /></label>
          <label>氏名<input v-model="employeeForm.name" /></label>
          <label>職位<input v-model="employeeForm.position" /></label>
          <label>メール<input v-model="employeeForm.email" type="email" /></label>
          <label>既定の扶養人数<input v-model.number="employeeForm.defaultDependentCount" type="number" min="0" /></label>
          <label>雇用保険適用<select v-model="employeeForm.employmentInsuranceEnrolled"><option :value="true">適用</option><option :value="false">対象外</option></select></label>
          <label>給与区分<select v-model="employeeForm.payType"><option value="MONTHLY">月給</option><option value="HOURLY">時給</option></select></label>
          <label>基本給・時給<input v-model.number="employeeForm.basePay" type="number" min="0" /></label>
          <label>固定残業手当<input v-model.number="employeeForm.fixedOvertimeAllowance" type="number" min="0" /></label>
          <label class="wide">メモ<input v-model="employeeForm.memo" /></label>
          <div class="form-actions full">
            <button @click="deleteEmployee"><Trash2 :size="16" />非表示</button>
            <button class="primary" @click="saveEmployee"><Save :size="16" />社員保存</button>
          </div>
        </div>

        <div v-if="false && canManageUsers" class="divider"></div>
        <div v-if="false && canManageUsers" class="panel-head" :class="sectionHeadClass('users')" @click="toggleSection('users')">
          <h2>ユーザー権限管理</h2>
          <button @click.stop="applyUser()"><Plus :size="16" />ユーザー追加</button>
        </div>
        <div v-if="false && canManageUsers" v-show="!collapsedSections.users" class="form-grid">
          <label>メール<input v-model="userForm.email" type="email" /></label>
          <label>氏名<input v-model="userForm.name" /></label>
          <label>ロール<select v-model="userForm.role">
            <option value="ADMIN">管理者</option>
            <option value="ACCOUNTING">経理担当</option>
            <option value="VIEWER">閲覧のみ</option>
            <option value="EMPLOYEE">社員本人</option>
          </select></label>
          <label>紐付け社員<select v-model="userForm.employeeId">
            <option value="">なし</option>
            <option v-for="employee in employees" :key="employee.id" :value="employee.id">{{ employee.employeeNo }} / {{ employee.name }}</option>
          </select></label>
          <label>パスワード<input v-model="userForm.password" type="password" placeholder="更新時は空欄で変更なし" /></label>
          <label>状態<select v-model="userForm.isActive"><option :value="true">有効</option><option :value="false">停止</option></select></label>
          <div class="form-actions full">
            <button @click="deactivateUser"><Trash2 :size="16" />停止</button>
            <button class="primary" @click="saveUser"><Save :size="16" />ユーザー保存</button>
          </div>
        </div>
        <div v-if="false && canManageUsers" v-show="!collapsedSections.users" class="user-list">
          <button v-for="user in users" :key="user.id" class="user-item" @click="applyUser(user)">
            <strong>{{ user.name }}</strong>
            <span>{{ user.email }} / {{ roleLabels[user.role] }}{{ user.employee ? ` / ${user.employee.name}` : "" }} / {{ user.isActive ? "有効" : "停止" }}</span>
          </button>
        </div>

        <div v-if="false && canManageUsers" v-show="!collapsedSections.users" class="permission-table">
          <div class="permission-head">
            <strong>権限設定</strong>
            <button class="primary" @click="saveRolePermissions"><Save :size="16" />権限保存</button>
          </div>
          <div class="permission-row header">
            <span>権限</span>
            <span>メニュー</span>
            <span>表示</span>
            <span>閲覧</span>
            <span>更新</span>
            <span>全件</span>
          </div>
          <div v-for="role in permissionRoles" :key="role" class="permission-group">
            <div v-for="menu in permissionMenus" :key="`${role}-${menu}`" class="permission-row">
              <span>{{ roleLabels[role] }}</span>
              <span>{{ menuLabels[menu] }}</span>
              <label class="check-cell"><input v-model="permissionRow(role, menu).canShow" type="checkbox" /></label>
              <label class="check-cell"><input v-model="permissionRow(role, menu).canView" type="checkbox" /></label>
              <label class="check-cell"><input v-model="permissionRow(role, menu).canEdit" type="checkbox" /></label>
              <label class="check-cell"><input v-model="permissionRow(role, menu).canViewAll" type="checkbox" /></label>
            </div>
          </div>
        </div>

        <div v-if="!canEditPayroll && canShowMenu('PAYROLL_INPUT')" v-show="!collapsedSections.employeePayroll" class="empty">閲覧権限です。給与・賞与の保存操作はできません。</div>

        <div v-if="canEditPayroll && canShowMenu('PAYROLL_INPUT')" v-show="!collapsedSections.employeePayroll" class="divider"></div>
        <div v-if="canEditPayroll && canShowMenu('PAYROLL_INPUT')" v-show="!collapsedSections.employeePayroll" class="form-grid">
          <label>所定労働日数<input v-model.number="payrollForm.workDays" type="number" min="0" step="0.5" /></label>
          <label>実働時間<input v-model.number="payrollForm.workHours" type="number" min="0" step="0.25" /></label>
          <label>残業時間<input v-model.number="payrollForm.overtimeHours" type="number" min="0" step="0.25" /></label>
          <label>扶養人数<input v-model.number="payrollForm.dependentCount" type="number" min="0" /></label>
          <label>社会保険加入<select v-model="payrollForm.socialInsuranceEnrolled"><option :value="true">加入</option><option :value="false">未加入</option></select></label>
          <label v-if="payrollForm.socialInsuranceEnrolled">社会保険適用金額<input v-model.number="payrollForm.socialInsuranceBaseAmount" type="number" min="0" placeholder="未入力時は総支給額" /></label>
          <label>手当<input v-model.number="payrollForm.allowance" type="number" min="0" /></label>
          <label>住民税<input v-model.number="payrollForm.residentTax" type="number" min="0" /></label>
          <label>寮使用料<input v-model.number="payrollForm.dormitoryFee" type="number" min="0" /></label>
          <label>固定控除<input v-model.number="payrollForm.fixedDeduction" type="number" min="0" /></label>
          <label class="wide">備考<input v-model="payrollForm.note" /></label>
          <div v-if="isPayrollLocked" class="lock-warning full">{{ payrollLockMessage }}</div>
          <div class="form-actions full">
            <button @click="usePreviousPayrollInput"><RefreshCw :size="16" />この社員の前回入力を利用</button>
            <button class="primary" @click="savePayroll()"><Save :size="16" />給与保存</button>
            <button v-if="isPayrollLocked" class="warning" @click="savePayroll(true)"><Save :size="16" />強制変更して保存</button>
            <button @click="downloadPayslipPdf"><Download :size="16" />PDFダウンロード</button>
            <button @click="sendPayslipEmail"><Mail :size="16" />PDFメール送信</button>
          </div>
        </div>

        <div v-if="canEditPayroll && canShowMenu('BONUS_INPUT')" class="divider"></div>
        <div v-if="canEditPayroll && canShowMenu('BONUS_INPUT')" class="panel-head" :class="sectionHeadClass('bonusInput')" @click="toggleSection('bonusInput')"><h2>賞与入力</h2></div>
        <div v-if="canEditPayroll && canShowMenu('BONUS_INPUT')" v-show="!collapsedSections.bonusInput" class="form-grid">
          <div class="bonus-guidance full" :class="{ active: isBonusPaymentMonth }">{{ bonusPaymentMessage }}</div>
          <label>賞与額<input v-model.number="bonusForm.bonusAmount" type="number" min="0" /></label>
          <label>社会保険加入<select v-model="bonusForm.socialInsuranceEnrolled"><option :value="true">加入</option><option :value="false">未加入</option></select></label>
          <label v-if="bonusForm.socialInsuranceEnrolled">社会保険適用金額<input v-model.number="bonusForm.socialInsuranceBaseAmount" type="number" min="0" placeholder="未入力時は賞与額" /></label>
          <label class="wide">賞与備考<input v-model="bonusForm.note" /></label>
          <div v-if="isPayrollLocked" class="lock-warning full">{{ bonusLockMessage }}</div>
          <div class="form-actions full">
            <button class="primary" @click="saveBonus()"><Save :size="16" />賞与保存</button>
            <button v-if="isPayrollLocked" class="warning" @click="saveBonus(true)"><Save :size="16" />賞与を強制変更して保存</button>
            <button @click="downloadBonusPdf"><Download :size="16" />賞与PDFダウンロード</button>
          </div>
        </div>
      </section>

      <section class="panel payslip">
        <div v-if="canEditPayroll && canShowMenu('RATES')" class="panel-head" :class="sectionHeadClass('rates')" @click="toggleSection('rates')"><h2>年度料率</h2></div>
        <div v-if="canEditPayroll && canShowMenu('RATES')" v-show="!collapsedSections.rates" class="form-grid compact">
          <label>年度<input v-model.number="rateForm.fiscalYear" type="number" /></label>
          <label>残業割増率<input v-model.number="rateForm.overtimeRate" type="number" step="0.000001" /></label>
          <label>所得税率（表なし時）<input v-model.number="rateForm.incomeTaxRate" type="number" step="0.000001" /></label>
          <label>健康・介護保険率<input v-model.number="rateForm.healthInsuranceRate" type="number" step="0.000001" /></label>
          <label>厚生年金保険率<input v-model.number="rateForm.pensionInsuranceRate" type="number" step="0.000001" /></label>
          <label>子ども・子育て支援金率<input v-model.number="rateForm.childCareSupportRate" type="number" step="0.000001" /></label>
          <label>雇用保険率<input v-model.number="rateForm.employmentInsuranceRate" type="number" step="0.000001" /></label>
          <label class="wide">メモ<input v-model="rateForm.memo" /></label>
          <div class="form-actions full">
            <button class="primary" @click="saveRate"><Save :size="16" />年度料率保存</button>
          </div>
        </div>
        <div v-if="canEditPayroll && canShowMenu('RATES')" v-show="!collapsedSections.rates" class="rate-list">
          <button v-for="rate in fiscalRates" :key="rate.fiscalYear" @click="applyRate(rate)">
            {{ rate.fiscalYear }}年度
          </button>
        </div>

        <div v-if="canEditPayroll && canShowMenu('TAX_IMPORT')" class="divider"></div>
        <div v-if="canEditPayroll && canShowMenu('TAX_IMPORT')" class="panel-head" :class="sectionHeadClass('taxImport')" @click="toggleSection('taxImport')"><h2>所得税表インポート</h2></div>
        <div v-if="canEditPayroll && canShowMenu('TAX_IMPORT')" v-show="!collapsedSections.taxImport" class="tax-import">
          <p class="note">CSV列: fiscalYear, dependentCount, minTaxable, maxTaxable, taxAmount</p>
          <textarea v-model="taxImport.csv" rows="6"></textarea>
          <div class="form-actions">
            <button class="primary" @click="importIncomeTaxTable"><Upload :size="16" />所得税表を取り込む</button>
          </div>
          <p class="note">{{ fiscalYearFromPeriod(period) }}年度の読込行数: {{ incomeTaxBrackets.length }}件</p>
        </div>

        <div v-if="canShowMenu('PAYSLIP')" class="divider"></div>
        <div v-if="canShowMenu('PAYSLIP')" class="panel-head" :class="sectionHeadClass('payrollSlip')" @click="toggleSection('payrollSlip')"><h2>給与明細</h2></div>
        <div v-if="selectedPayroll && canShowMenu('PAYSLIP')" v-show="!collapsedSections.payrollSlip" class="slip">
          <h3>{{ selectedPayroll.employee.name }}</h3>
          <p class="message">適用年度: {{ activeRate?.fiscalYear || fiscalYearFromPeriod(period) }}年度</p>
          <dl>
            <dt>基本給</dt><dd>{{ yen.format(selectedPayroll.regularPay) }}</dd>
            <dt>固定残業手当</dt><dd>{{ yen.format(selectedPayroll.fixedOvertimeAllowance) }}</dd>
            <dt>残業代</dt><dd>{{ yen.format(selectedPayroll.overtimePay) }}</dd>
            <dt>総支給額</dt><dd>{{ yen.format(selectedPayroll.grossPay) }}</dd>
            <dt>扶養人数</dt><dd>{{ selectedPayroll.dependentCount }}</dd>
            <dt>課税対象額</dt><dd>{{ yen.format(selectedPayroll.taxableIncome || 0) }}</dd>
            <dt>所得税</dt><dd>{{ yen.format(selectedPayroll.incomeTax) }}</dd>
            <dt>社会保険加入</dt><dd>{{ selectedPayroll.socialInsuranceEnrolled ? "加入" : "未加入" }}</dd>
            <dt>社会保険適用金額</dt><dd>{{ selectedPayroll.socialInsuranceBaseAmount ? yen.format(selectedPayroll.socialInsuranceBaseAmount) : "総支給額" }}</dd>
            <dt>健康・介護保険</dt><dd>{{ yen.format(selectedPayroll.healthInsurance) }}</dd>
            <dt>厚生年金保険</dt><dd>{{ yen.format(selectedPayroll.pensionInsurance) }}</dd>
            <dt>子ども・子育て支援金</dt><dd>{{ yen.format(selectedPayroll.childCareSupport) }}</dd>
            <dt>社会保険合計</dt><dd>{{ yen.format(selectedPayroll.socialInsurance) }}</dd>
            <dt>雇用保険適用</dt><dd>{{ selectedPayroll.employmentInsuranceEnrolled ? "適用" : "対象外" }}</dd>
            <dt>雇用保険</dt><dd>{{ yen.format(selectedPayroll.employmentInsurance) }}</dd>
            <dt>住民税</dt><dd>{{ yen.format(selectedPayroll.residentTax) }}</dd>
            <dt>寮使用料</dt><dd>{{ yen.format(selectedPayroll.dormitoryFee) }}</dd>
            <dt>控除合計</dt><dd>{{ yen.format(selectedPayroll.totalDeduction) }}</dd>
          </dl>
          <div class="net"><span>差引支給額</span><strong>{{ yen.format(selectedPayroll.netPay) }}</strong></div>
          <p class="message">メール送信: {{ selectedPayroll.emailedAt ? new Date(selectedPayroll.emailedAt).toLocaleString("ja-JP") : "未送信" }}</p>
          <div class="form-actions">
            <button @click="downloadPayslipPdf"><Download :size="16" />給与PDFダウンロード</button>
          </div>
        </div>
        <div v-else-if="canShowMenu('PAYSLIP')" v-show="!collapsedSections.payrollSlip" class="empty">この社員の給与はまだ保存されていません。</div>

        <div v-if="canShowMenu('BONUS_SLIP')" class="divider"></div>
        <div v-if="canShowMenu('BONUS_SLIP')" class="panel-head" :class="sectionHeadClass('bonusSlip')" @click="toggleSection('bonusSlip')"><h2>賞与明細</h2></div>
        <div v-if="selectedBonus && canShowMenu('BONUS_SLIP')" v-show="!collapsedSections.bonusSlip" class="slip">
          <h3>{{ selectedBonus.employee.name }}</h3>
          <p class="message">所得税率: {{ Number(selectedBonus.incomeTaxRate).toFixed(6) }}</p>
          <dl>
            <dt>賞与額</dt><dd>{{ yen.format(selectedBonus.bonusAmount) }}</dd>
            <dt>課税対象額</dt><dd>{{ yen.format(selectedBonus.taxableIncome) }}</dd>
            <dt>賞与所得税</dt><dd>{{ yen.format(selectedBonus.incomeTax) }}</dd>
            <dt>社会保険加入</dt><dd>{{ selectedBonus.socialInsuranceEnrolled ? "加入" : "未加入" }}</dd>
            <dt>社会保険適用金額</dt><dd>{{ selectedBonus.socialInsuranceBaseAmount ? yen.format(selectedBonus.socialInsuranceBaseAmount) : "賞与額" }}</dd>
            <dt>健康・介護保険</dt><dd>{{ yen.format(selectedBonus.healthInsurance) }}</dd>
            <dt>厚生年金保険</dt><dd>{{ yen.format(selectedBonus.pensionInsurance) }}</dd>
            <dt>子ども・子育て支援金</dt><dd>{{ yen.format(selectedBonus.childCareSupport) }}</dd>
            <dt>社会保険合計</dt><dd>{{ yen.format(selectedBonus.socialInsurance) }}</dd>
            <dt>雇用保険適用</dt><dd>{{ selectedBonus.employmentInsuranceEnrolled ? "適用" : "対象外" }}</dd>
            <dt>雇用保険</dt><dd>{{ yen.format(selectedBonus.employmentInsurance) }}</dd>
            <dt>控除合計</dt><dd>{{ yen.format(selectedBonus.totalDeduction) }}</dd>
          </dl>
          <div class="net"><span>賞与差引支給額</span><strong>{{ yen.format(selectedBonus.netPay) }}</strong></div>
          <div class="form-actions">
            <button @click="downloadBonusPdf"><Download :size="16" />賞与PDFダウンロード</button>
          </div>
        </div>
        <div v-else-if="canShowMenu('BONUS_SLIP')" v-show="!collapsedSections.bonusSlip" class="empty">この社員の賞与はまだ保存されていません。</div>
      </section>
    </div>

    <section v-if="activeMenu === 'users' && canViewUsers" class="panel">
      <div class="panel-head" :class="sectionHeadClass('usersMenu')" @click="toggleSection('usersMenu')">
        <h2>ユーザー管理</h2>
        <button v-if="canEditUsers" @click.stop="applyUser()"><Plus :size="16" />ユーザー追加</button>
      </div>
      <div v-show="!collapsedSections.usersMenu" class="form-grid">
        <label>メール<input v-model="userForm.email" type="email" /></label>
        <label>氏名<input v-model="userForm.name" /></label>
        <label>ロール<select v-model="userForm.role" @change="onUserRoleChange">
          <option value="ADMIN">管理者</option>
          <option value="ACCOUNTING">経理担当</option>
          <option value="VIEWER">閲覧のみ</option>
          <option value="EMPLOYEE">社員本人</option>
        </select></label>
        <label>利用権限<select v-model="userForm.permissionRoleId" @change="refreshUserPermissions">
          <option value="">基本ロールを利用</option>
          <option v-for="role in permissionRoleMasters" :key="role.id" :value="role.id">{{ role.code }} / {{ role.name }}</option>
        </select></label>
        <label>紐付け社員<select v-model="userForm.employeeId">
          <option value="">なし</option>
          <option v-for="employee in employees" :key="employee.id" :value="employee.id">{{ employee.employeeNo }} / {{ employee.name }}</option>
        </select></label>
        <label>パスワード<input v-model="userForm.password" type="password" placeholder="更新時は空欄で変更なし" /></label>
        <label>状態<select v-model="userForm.isActive"><option :value="true">有効</option><option :value="false">停止</option></select></label>
        <div class="form-actions full">
          <button v-if="canEditUsers" @click="deactivateUser"><Trash2 :size="16" />停止</button>
          <button v-if="canEditUsers" class="primary" @click="saveUser"><Save :size="16" />ユーザー保存</button>
        </div>
      </div>
      <div v-show="!collapsedSections.usersMenu" class="user-list">
        <button v-for="user in users" :key="user.id" class="user-item" @click="applyUser(user)">
          <strong>{{ user.name }}</strong>
          <span>{{ user.email }} / {{ roleLabels[user.role] }}{{ user.employee ? ` / ${user.employee.name}` : "" }} / {{ user.isActive ? "有効" : "停止" }}</span>
        </button>
      </div>
      <div v-show="!collapsedSections.usersMenu" class="permission-table">
        <div class="permission-head">
          <strong>ユーザー個別権限設定</strong>
          <button v-if="canEditUsers" class="primary" :disabled="!userForm.id" @click="saveUserPermissions"><Save :size="16" />個別権限保存</button>
        </div>
        <div class="permission-context-title">
          <span>対象ユーザー</span>
          <strong>{{ userForm.name || userForm.email || "未選択" }}</strong>
        </div>
        <p v-if="!userForm.id" class="note">ユーザー保存後に個別権限を設定できます。現在は選択ロールの初期権限を表示しています。</p>
        <div class="permission-row header">
          <span></span>
          <span></span>
          <span>表示</span>
          <span>閲覧</span>
          <span>更新</span>
          <span>全件</span>
        </div>
        <div v-for="menu in permissionMenus" :key="`user-${menu}`" class="permission-row">
          <span>{{ menuLabels[menu] }}</span>
          <span>{{ menu.includes('_') ? '子メニュー' : '親メニュー' }}</span>
          <label class="check-cell"><input v-model="userPermissionRow(menu).canShow" :disabled="!userForm.id" type="checkbox" /></label>
          <label class="check-cell"><input v-model="userPermissionRow(menu).canView" :disabled="!userForm.id" type="checkbox" /></label>
          <label class="check-cell"><input v-model="userPermissionRow(menu).canEdit" :disabled="!userForm.id" type="checkbox" /></label>
          <label class="check-cell"><input v-model="userPermissionRow(menu).canViewAll" :disabled="!userForm.id" type="checkbox" /></label>
        </div>
      </div>
    </section>

    <section v-if="activeMenu === 'permissions' && canViewPermissions" class="panel">
      <div class="panel-head" :class="sectionHeadClass('permissionsMenu')" @click="toggleSection('permissionsMenu')">
        <h2>権限管理</h2>
        <button v-if="canEditPermissions" @click.stop="applyPermissionRole()"><Plus :size="16" />ロール追加</button>
      </div>
      <div v-show="!collapsedSections.permissionsMenu" class="ses-layout contract-layout">
        <div class="ses-list">
          <button
            v-for="role in permissionRoleMasters"
            :key="role.id"
            class="employee-item"
            :class="{ active: role.id === selectedPermissionRoleId }"
            @click="applyPermissionRole(role)"
          >
            <strong>{{ role.name }}</strong>
            <span>{{ role.code }} / {{ roleLabels[role.baseRole] }}</span>
          </button>
          <div v-if="!permissionRoleMasters.length" class="empty">ロールが登録されていません。</div>
        </div>

        <div class="contract-editor">
          <div class="form-grid">
            <label>ロールコード<input v-model="permissionRoleForm.code" /></label>
            <label>ロール名<input v-model="permissionRoleForm.name" /></label>
            <label>基本ロール<select v-model="permissionRoleForm.baseRole" @change="rolePermissions = permissionMenus.map((menu) => ({ ...defaultPermission(permissionRoleForm.baseRole, menu), role: permissionRoleForm.baseRole }))">
              <option value="ADMIN">管理者</option>
              <option value="ACCOUNTING">経理担当</option>
              <option value="VIEWER">閲覧のみ</option>
              <option value="EMPLOYEE">社員本人</option>
            </select></label>
            <label>状態<select v-model="permissionRoleForm.isActive"><option :value="true">有効</option><option :value="false">非表示</option></select></label>
            <div class="form-actions full">
              <button v-if="canEditPermissions && permissionRoleForm.id" @click="deletePermissionRole"><Trash2 :size="16" />非表示</button>
              <button v-if="canEditPermissions" class="primary" @click="savePermissionRole"><Save :size="16" />ロール保存</button>
              <button v-if="canEditPermissions" class="primary" :disabled="!permissionRoleForm.id" @click="saveRolePermissions"><Save :size="16" />権限保存</button>
            </div>
            <p v-if="permissionMessage" class="message full">{{ permissionMessage }}</p>
          </div>

          <div class="permission-table">
            <div class="permission-head">
              <strong>{{ permissionRoleForm.name || "新規ロール" }} の権限</strong>
            </div>
            <div class="permission-parent">
              <strong>{{ menuLabels.PAYROLL }}</strong>
              <div class="permission-bulk-row">
                <span>給与管理 一括</span>
                <label><input :checked="isPermissionGroupChecked(payrollPermissionMenus, 'canShow')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(payrollPermissionMenus, 'canShow', ($event.target as HTMLInputElement).checked)" />表示</label>
                <label><input :checked="isPermissionGroupChecked(payrollPermissionMenus, 'canView')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(payrollPermissionMenus, 'canView', ($event.target as HTMLInputElement).checked)" />閲覧</label>
                <label><input :checked="isPermissionGroupChecked(payrollPermissionMenus, 'canEdit')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(payrollPermissionMenus, 'canEdit', ($event.target as HTMLInputElement).checked)" />更新</label>
                <label><input :checked="isPermissionGroupChecked(payrollPermissionMenus, 'canViewAll')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(payrollPermissionMenus, 'canViewAll', ($event.target as HTMLInputElement).checked)" />全件</label>
              </div>
              <div class="permission-row header">
                <span></span><span></span><span>表示</span><span>閲覧</span><span>更新</span><span>全件</span>
              </div>
              <div v-for="menu in permissionMenus.filter((item) => item === 'PAYROLL' || item.startsWith('PAYROLL_') || ['BONUS_INPUT','RATES','TAX_IMPORT','PAYSLIP','BONUS_SLIP'].includes(item))" :key="`payroll-${menu}`" class="permission-row" :class="{ child: menu !== 'PAYROLL' }">
                <span>{{ menuLabels[menu] }}</span>
                <span>{{ menu === 'PAYROLL' ? '親メニュー' : '子メニュー' }}</span>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canShow" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canView" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canEdit" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canViewAll" :disabled="!canEditPermissions" type="checkbox" /></label>
              </div>
            </div>
            <div class="permission-parent">
              <strong>{{ menuLabels.SES }}</strong>
              <div class="permission-bulk-row">
                <span>SES管理 一括</span>
                <label><input :checked="isPermissionGroupChecked(sesPermissionMenus, 'canShow')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(sesPermissionMenus, 'canShow', ($event.target as HTMLInputElement).checked)" />表示</label>
                <label><input :checked="isPermissionGroupChecked(sesPermissionMenus, 'canView')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(sesPermissionMenus, 'canView', ($event.target as HTMLInputElement).checked)" />閲覧</label>
                <label><input :checked="isPermissionGroupChecked(sesPermissionMenus, 'canEdit')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(sesPermissionMenus, 'canEdit', ($event.target as HTMLInputElement).checked)" />更新</label>
                <label><input :checked="isPermissionGroupChecked(sesPermissionMenus, 'canViewAll')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(sesPermissionMenus, 'canViewAll', ($event.target as HTMLInputElement).checked)" />全件</label>
              </div>
              <div class="permission-row header">
                <span></span><span></span><span>表示</span><span>閲覧</span><span>更新</span><span>全件</span>
              </div>
              <div v-for="menu in permissionMenus.filter((item) => item === 'SES' || item.startsWith('SES_'))" :key="`ses-${menu}`" class="permission-row" :class="{ child: menu !== 'SES' }">
                <span>{{ menuLabels[menu] }}</span>
                <span>{{ menu === 'SES' ? '親メニュー' : '子メニュー' }}</span>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canShow" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canView" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canEdit" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canViewAll" :disabled="!canEditPermissions" type="checkbox" /></label>
              </div>
            </div>
            <div class="permission-parent">
              <strong>管理メニュー</strong>
              <div class="permission-row header">
                <span></span><span></span><span>表示</span><span>閲覧</span><span>更新</span><span>全件</span>
              </div>
              <div class="permission-bulk-row">
                <span>管理メニュー 一括</span>
                <label><input :checked="isPermissionGroupChecked(adminPermissionMenus, 'canShow')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(adminPermissionMenus, 'canShow', ($event.target as HTMLInputElement).checked)" />表示</label>
                <label><input :checked="isPermissionGroupChecked(adminPermissionMenus, 'canView')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(adminPermissionMenus, 'canView', ($event.target as HTMLInputElement).checked)" />閲覧</label>
                <label><input :checked="isPermissionGroupChecked(adminPermissionMenus, 'canEdit')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(adminPermissionMenus, 'canEdit', ($event.target as HTMLInputElement).checked)" />更新</label>
                <label><input :checked="isPermissionGroupChecked(adminPermissionMenus, 'canViewAll')" :disabled="!canEditPermissions" type="checkbox" @change="setPermissionGroup(adminPermissionMenus, 'canViewAll', ($event.target as HTMLInputElement).checked)" />全件</label>
              </div>
              <div v-for="menu in adminPermissionMenus" :key="`admin-${menu}`" class="permission-row">
                <span>{{ menuLabels[menu] }}</span>
                <span>親メニュー</span>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canShow" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canView" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canEdit" :disabled="!canEditPermissions" type="checkbox" /></label>
                <label class="check-cell"><input v-model="permissionRow(permissionRoleForm.baseRole, menu).canViewAll" :disabled="!canEditPermissions" type="checkbox" /></label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <SesManagement
      v-if="activeMenu === 'ses' && canViewSes"
      :can-edit-ses="canEditSes"
      :permissions="me?.permissions || []"
      :message="sesMessage"
      @message="sesMessage = $event"
      @settings-updated="refreshPublicSettings"
    />
  </main>
</template>
