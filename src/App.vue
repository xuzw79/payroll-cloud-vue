<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Download, LogOut, Mail, Plus, RefreshCw, Save, Search, Trash2, Upload } from "lucide-vue-next";

type PayType = "MONTHLY" | "HOURLY";

type Employee = {
  id: string;
  employeeNo: string;
  name: string;
  email?: string | null;
  defaultDependentCount: number;
  payType: PayType;
  basePay: number;
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
  dependentCount: number;
  taxableIncome?: number | null;
  grossPay: number;
  totalDeduction: number;
  netPay: number;
  regularPay: number;
  overtimePay: number;
  incomeTax: number;
  socialInsurance: number;
  employmentInsurance: number;
  emailedAt?: string | null;
  employee: Employee;
};

type FiscalRate = {
  id?: string;
  fiscalYear: number;
  overtimeRate: string | number;
  incomeTaxRate: string | number;
  socialInsuranceRate: string | number;
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

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const today = new Date().toISOString().slice(0, 7);
const thisFiscalYear = new Date().getMonth() + 1 >= 4 ? new Date().getFullYear() : new Date().getFullYear() - 1;
const loggedIn = ref(false);
const loading = ref(false);
const message = ref("");
const query = ref("");
const period = ref(today);
const employees = ref<Employee[]>([]);
const payrolls = ref<Payroll[]>([]);
const fiscalRates = ref<FiscalRate[]>([]);
const incomeTaxBrackets = ref<IncomeTaxBracket[]>([]);
const selectedEmployeeId = ref("");

const loginForm = reactive({ email: "admin@example.com", password: "" });
const employeeForm = reactive({
  id: "",
  employeeNo: "",
  name: "",
  email: "",
  defaultDependentCount: 0,
  payType: "MONTHLY" as PayType,
  basePay: 0,
  memo: ""
});
const payrollForm = reactive({
  workDays: 20,
  workHours: 160,
  overtimeHours: 0,
  allowance: 0,
  fixedDeduction: 0,
  dependentCount: 0,
  note: ""
});
const rateForm = reactive<FiscalRate>({
  fiscalYear: thisFiscalYear,
  overtimeRate: 1.25,
  incomeTaxRate: 0.03,
  socialInsuranceRate: 0.15,
  employmentInsuranceRate: 0.006,
  memo: ""
});
const taxImport = reactive({
  fiscalYear: thisFiscalYear,
  csv: "fiscalYear,dependentCount,minTaxable,maxTaxable,taxAmount\n2026,0,0,88000,0\n2026,0,88001,99000,130\n2026,1,0,99000,0\n"
});

const selectedEmployee = computed(() => employees.value.find((employee) => employee.id === selectedEmployeeId.value));
const selectedPayroll = computed(() => payrolls.value.find((payroll) => payroll.employeeId === selectedEmployeeId.value));
const activeRate = computed(() => fiscalRates.value.find((rate) => rate.fiscalYear === fiscalYearFromPeriod(period.value)));
const totals = computed(() => payrolls.value.reduce(
  (acc, payroll) => {
    acc.gross += payroll.grossPay;
    acc.deduction += payroll.totalDeduction;
    acc.net += payroll.netPay;
    return acc;
  },
  { gross: 0, deduction: 0, net: 0 }
));

function fiscalYearFromPeriod(value: string) {
  const [year, month] = value.split("-").map(Number);
  return month >= 4 ? year : year - 1;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include",
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }
  return response.json();
}

function applyEmployee(employee?: Employee) {
  const target = employee || {
    id: "",
    employeeNo: nextEmployeeNo(),
    name: "",
    email: "",
    defaultDependentCount: 0,
    payType: "MONTHLY" as PayType,
    basePay: 0,
    memo: ""
  };
  employeeForm.id = target.id;
  employeeForm.employeeNo = target.employeeNo;
  employeeForm.name = target.name;
  employeeForm.email = target.email || "";
  employeeForm.defaultDependentCount = target.defaultDependentCount || 0;
  employeeForm.payType = target.payType;
  employeeForm.basePay = target.basePay;
  employeeForm.memo = target.memo || "";
  selectedEmployeeId.value = target.id;

  const payroll = payrolls.value.find((item) => item.employeeId === target.id);
  payrollForm.dependentCount = payroll?.dependentCount ?? employeeForm.defaultDependentCount;
  if (payroll) {
    payrollForm.workDays = Number(payroll.workDays);
    payrollForm.workHours = Number(payroll.workHours);
    payrollForm.overtimeHours = Number(payroll.overtimeHours);
    payrollForm.allowance = payroll.allowance;
    payrollForm.fixedDeduction = payroll.fixedDeduction;
  }
}

function applyRate(rate: FiscalRate) {
  Object.assign(rateForm, {
    fiscalYear: rate.fiscalYear,
    overtimeRate: Number(rate.overtimeRate),
    incomeTaxRate: Number(rate.incomeTaxRate),
    socialInsuranceRate: Number(rate.socialInsuranceRate),
    employmentInsuranceRate: Number(rate.employmentInsuranceRate),
    memo: rate.memo || ""
  });
  taxImport.fiscalYear = rate.fiscalYear;
}

function nextEmployeeNo() {
  return `E${String(employees.value.length + 1).padStart(3, "0")}`;
}

async function login() {
  loading.value = true;
  message.value = "";
  try {
    await request("/login", { method: "POST", body: JSON.stringify(loginForm) });
    loggedIn.value = true;
    await refresh();
  } catch (error) {
    message.value = error instanceof Error ? error.message : "Login failed";
  } finally {
    loading.value = false;
  }
}

async function logout() {
  await request("/logout", { method: "POST" });
  loggedIn.value = false;
}

async function refresh() {
  loading.value = true;
  try {
    const fiscalYear = fiscalYearFromPeriod(period.value);
    const [employeeData, payrollData, fiscalRateData, taxData] = await Promise.all([
      request<Employee[]>(`/employees?q=${encodeURIComponent(query.value)}`),
      request<Payroll[]>(`/payrolls?period=${encodeURIComponent(period.value)}`),
      request<FiscalRate[]>("/fiscal-rates"),
      request<IncomeTaxBracket[]>(`/income-tax-brackets?fiscalYear=${fiscalYear}`)
    ]);
    employees.value = employeeData;
    payrolls.value = payrollData;
    fiscalRates.value = fiscalRateData;
    incomeTaxBrackets.value = taxData;
    if (!selectedEmployeeId.value && employees.value[0]) applyEmployee(employees.value[0]);
    const current = fiscalRateData.find((rate) => rate.fiscalYear === fiscalYear);
    if (current) applyRate(current);
  } finally {
    loading.value = false;
  }
}

async function saveRate() {
  await request("/fiscal-rates", { method: "POST", body: JSON.stringify(rateForm) });
  message.value = "年度料率已保存";
  await refresh();
}

async function importIncomeTaxTable() {
  const result = await request<{ imported: number; fiscalYears: number[] }>("/income-tax-brackets/import", {
    method: "POST",
    body: JSON.stringify({ csv: taxImport.csv })
  });
  message.value = `所得税表导入完成: ${result.imported} rows`;
  await refresh();
}

async function saveEmployee() {
  const method = employeeForm.id ? "PUT" : "POST";
  const path = employeeForm.id ? `/employees/${employeeForm.id}` : "/employees";
  const employee = await request<Employee>(path, { method, body: JSON.stringify(employeeForm) });
  message.value = "社員情報已保存";
  await refresh();
  applyEmployee(employee);
}

async function deleteEmployee() {
  if (!employeeForm.id || !confirm("Hide this employee?")) return;
  await request(`/employees/${employeeForm.id}`, { method: "DELETE" });
  selectedEmployeeId.value = "";
  message.value = "社員已隐藏";
  await refresh();
}

async function savePayroll() {
  if (!selectedEmployee.value) {
    message.value = "请选择社員";
    return;
  }
  await request("/payrolls", {
    method: "POST",
    body: JSON.stringify({ employeeId: selectedEmployee.value.id, period: period.value, ...payrollForm })
  });
  message.value = "給与已保存。所得税会按年度表自动查表。";
  await refresh();
}

async function sendPayslipEmail() {
  if (!selectedPayroll.value) {
    message.value = "请先保存給与";
    return;
  }
  await request<Payroll>(`/payrolls/${selectedPayroll.value.id}/email`, { method: "POST" });
  message.value = "給与明細PDF已邮件发送";
  await refresh();
}

function exportCsv() {
  const header = ["period", "employeeNo", "name", "payType", "dependents", "taxableIncome", "incomeTax", "grossPay", "deduction", "netPay", "emailedAt"];
  const rows = payrolls.value.map((payroll) => [
    payroll.period,
    payroll.employee.employeeNo,
    payroll.employee.name,
    payroll.employee.payType,
    payroll.dependentCount,
    payroll.taxableIncome || "",
    payroll.incomeTax,
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

onMounted(async () => {
  try {
    await request("/me");
    loggedIn.value = true;
    await refresh();
  } catch {
    loggedIn.value = false;
  }
});
</script>

<template>
  <main v-if="!loggedIn" class="login-page">
    <form class="login-panel" @submit.prevent="login">
      <h1>Payroll Cloud</h1>
      <label>Email<input v-model="loginForm.email" type="email" autocomplete="username" required /></label>
      <label>Password<input v-model="loginForm.password" type="password" autocomplete="current-password" required /></label>
      <button class="primary" :disabled="loading">Login</button>
      <p v-if="message" class="message">{{ message }}</p>
    </form>
  </main>

  <main v-else class="app-shell">
    <header class="topbar">
      <div>
        <h1>Payroll Cloud</h1>
        <p>Vue + Hono + PostgreSQL / Railway</p>
      </div>
      <div class="actions">
        <button @click="refresh"><RefreshCw :size="16" />Refresh</button>
        <button @click="exportCsv"><Download :size="16" />CSV</button>
        <button @click="logout"><LogOut :size="16" />Logout</button>
      </div>
    </header>

    <section class="filters">
      <label>Pay period<input v-model="period" type="month" @change="refresh" /></label>
      <label>Search<input v-model="query" placeholder="name / employee no" @keyup.enter="refresh" /></label>
      <button class="primary" @click="refresh"><Search :size="16" />Search</button>
      <span v-if="message" class="message">{{ message }}</span>
    </section>

    <section class="summary">
      <div><span>Employees</span><strong>{{ employees.length }}</strong></div>
      <div><span>Gross pay</span><strong>{{ yen.format(totals.gross) }}</strong></div>
      <div><span>Deductions</span><strong>{{ yen.format(totals.deduction) }}</strong></div>
      <div><span>Net pay</span><strong>{{ yen.format(totals.net) }}</strong></div>
    </section>

    <div class="workspace">
      <section class="panel employee-list">
        <div class="panel-head">
          <h2>Employees</h2>
          <button @click="applyEmployee()"><Plus :size="16" />Add</button>
        </div>
        <button
          v-for="employee in employees"
          :key="employee.id"
          class="employee-item"
          :class="{ active: employee.id === selectedEmployeeId }"
          @click="applyEmployee(employee)"
        >
          <strong>{{ employee.name }}</strong>
          <span>{{ employee.employeeNo }} / dependents: {{ employee.defaultDependentCount }}</span>
        </button>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Employee / Payroll</h2></div>
        <div class="form-grid">
          <label>Employee No<input v-model="employeeForm.employeeNo" /></label>
          <label>Name<input v-model="employeeForm.name" /></label>
          <label>Email<input v-model="employeeForm.email" type="email" /></label>
          <label>Default dependents<input v-model.number="employeeForm.defaultDependentCount" type="number" min="0" /></label>
          <label>Pay type<select v-model="employeeForm.payType"><option value="MONTHLY">Monthly</option><option value="HOURLY">Hourly</option></select></label>
          <label>Base pay / hourly wage<input v-model.number="employeeForm.basePay" type="number" min="0" /></label>
          <label class="wide">Memo<input v-model="employeeForm.memo" /></label>
          <div class="form-actions full">
            <button @click="deleteEmployee"><Trash2 :size="16" />Hide</button>
            <button class="primary" @click="saveEmployee"><Save :size="16" />Save employee</button>
          </div>
        </div>

        <div class="divider"></div>
        <div class="form-grid">
          <label>Work days<input v-model.number="payrollForm.workDays" type="number" min="0" step="0.5" /></label>
          <label>Work hours<input v-model.number="payrollForm.workHours" type="number" min="0" step="0.25" /></label>
          <label>Overtime hours<input v-model.number="payrollForm.overtimeHours" type="number" min="0" step="0.25" /></label>
          <label>Dependents / 抚养人数<input v-model.number="payrollForm.dependentCount" type="number" min="0" /></label>
          <label>Allowance<input v-model.number="payrollForm.allowance" type="number" min="0" /></label>
          <label>Fixed deduction<input v-model.number="payrollForm.fixedDeduction" type="number" min="0" /></label>
          <label class="wide">Note<input v-model="payrollForm.note" /></label>
          <div class="form-actions full">
            <button class="primary" @click="savePayroll"><Save :size="16" />Save payroll</button>
            <button @click="sendPayslipEmail"><Mail :size="16" />Send PDF mail</button>
          </div>
        </div>
      </section>

      <section class="panel payslip">
        <div class="panel-head"><h2>Annual rates</h2></div>
        <div class="form-grid compact">
          <label>Fiscal year<input v-model.number="rateForm.fiscalYear" type="number" /></label>
          <label>Overtime rate<input v-model.number="rateForm.overtimeRate" type="number" step="0.001" /></label>
          <label>Fallback tax rate<input v-model.number="rateForm.incomeTaxRate" type="number" step="0.0001" /></label>
          <label>Social insurance<input v-model.number="rateForm.socialInsuranceRate" type="number" step="0.0001" /></label>
          <label>Employment insurance<input v-model.number="rateForm.employmentInsuranceRate" type="number" step="0.0001" /></label>
          <label class="wide">Memo<input v-model="rateForm.memo" /></label>
          <div class="form-actions full">
            <button class="primary" @click="saveRate"><Save :size="16" />Save rate</button>
          </div>
        </div>
        <div class="rate-list">
          <button v-for="rate in fiscalRates" :key="rate.fiscalYear" @click="applyRate(rate)">
            {{ rate.fiscalYear }}
          </button>
        </div>

        <div class="divider"></div>
        <div class="panel-head"><h2>所得税表导入</h2></div>
        <div class="tax-import">
          <p class="note">CSV columns: fiscalYear, dependentCount, minTaxable, maxTaxable, taxAmount</p>
          <textarea v-model="taxImport.csv" rows="6"></textarea>
          <div class="form-actions">
            <button class="primary" @click="importIncomeTaxTable"><Upload :size="16" />Import tax table</button>
          </div>
          <p class="note">Loaded rows for {{ fiscalYearFromPeriod(period) }}: {{ incomeTaxBrackets.length }}</p>
        </div>

        <div class="divider"></div>
        <div class="panel-head"><h2>Payslip</h2></div>
        <div v-if="selectedPayroll" class="slip">
          <h3>{{ selectedPayroll.employee.name }}</h3>
          <p class="message">Fiscal year: {{ activeRate?.fiscalYear || fiscalYearFromPeriod(period) }}</p>
          <dl>
            <dt>Base pay</dt><dd>{{ yen.format(selectedPayroll.regularPay) }}</dd>
            <dt>Overtime pay</dt><dd>{{ yen.format(selectedPayroll.overtimePay) }}</dd>
            <dt>Gross pay</dt><dd>{{ yen.format(selectedPayroll.grossPay) }}</dd>
            <dt>Dependents</dt><dd>{{ selectedPayroll.dependentCount }}</dd>
            <dt>Taxable income</dt><dd>{{ yen.format(selectedPayroll.taxableIncome || 0) }}</dd>
            <dt>Income tax</dt><dd>{{ yen.format(selectedPayroll.incomeTax) }}</dd>
            <dt>Social insurance</dt><dd>{{ yen.format(selectedPayroll.socialInsurance) }}</dd>
            <dt>Employment insurance</dt><dd>{{ yen.format(selectedPayroll.employmentInsurance) }}</dd>
            <dt>Total deduction</dt><dd>{{ yen.format(selectedPayroll.totalDeduction) }}</dd>
          </dl>
          <div class="net"><span>Net pay</span><strong>{{ yen.format(selectedPayroll.netPay) }}</strong></div>
          <p class="message">Email: {{ selectedPayroll.emailedAt ? new Date(selectedPayroll.emailedAt).toLocaleString("ja-JP") : "not sent" }}</p>
        </div>
        <div v-else class="empty">Payroll is not saved for this employee yet.</div>
      </section>
    </div>
  </main>
</template>
