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
  socialInsuranceEnrolled: boolean;
  socialInsuranceBaseAmount?: number | null;
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
  socialInsuranceEnrolled: true,
  socialInsuranceBaseAmount: 0,
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
    const error = await response.json().catch(() => ({ message: "通信に失敗しました" }));
    throw new Error(error.message || "通信に失敗しました");
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
  payrollForm.socialInsuranceEnrolled = payroll?.socialInsuranceEnrolled ?? true;
  payrollForm.socialInsuranceBaseAmount = payroll?.socialInsuranceBaseAmount || 0;
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
    message.value = error instanceof Error ? error.message : "ログインできません";
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
  message.value = "年度料率を保存しました";
  await refresh();
}

async function importIncomeTaxTable() {
  const result = await request<{ imported: number; fiscalYears: number[] }>("/income-tax-brackets/import", {
    method: "POST",
    body: JSON.stringify({ csv: taxImport.csv })
  });
  message.value = `所得税表を取り込みました: ${result.imported}件`;
  await refresh();
}

async function saveEmployee() {
  const method = employeeForm.id ? "PUT" : "POST";
  const path = employeeForm.id ? `/employees/${employeeForm.id}` : "/employees";
  const employee = await request<Employee>(path, { method, body: JSON.stringify(employeeForm) });
  message.value = "社員情報を保存しました";
  await refresh();
  applyEmployee(employee);
}

async function deleteEmployee() {
  if (!employeeForm.id || !confirm("この社員を非表示にしますか？")) return;
  await request(`/employees/${employeeForm.id}`, { method: "DELETE" });
  selectedEmployeeId.value = "";
  message.value = "社員を非表示にしました";
  await refresh();
}

async function savePayroll() {
  if (!selectedEmployee.value) {
    message.value = "社員を選択してください";
    return;
  }
  await request("/payrolls", {
    method: "POST",
    body: JSON.stringify({ employeeId: selectedEmployee.value.id, period: period.value, ...payrollForm })
  });
  message.value = "給与を保存しました。所得税は年度表から自動で参照されます。";
  await refresh();
}

async function sendPayslipEmail() {
  if (!selectedPayroll.value) {
    message.value = "先に給与を保存してください";
    return;
  }
  await request<Payroll>(`/payrolls/${selectedPayroll.value.id}/email`, { method: "POST" });
  message.value = "給与明細PDFをメール送信しました";
  await refresh();
}

function exportCsv() {
  const header = ["支給月", "社員番号", "氏名", "給与区分", "扶養人数", "社会保険加入", "社会保険適用金額", "課税対象額", "所得税", "総支給額", "控除合計", "差引支給額", "メール送信日時"];
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
      <h1>給与管理クラウド</h1>
      <label>メールアドレス<input v-model="loginForm.email" type="email" autocomplete="username" required /></label>
      <label>パスワード<input v-model="loginForm.password" type="password" autocomplete="current-password" required /></label>
      <button class="primary" :disabled="loading">ログイン</button>
      <p v-if="message" class="message">{{ message }}</p>
    </form>
  </main>

  <main v-else class="app-shell">
    <header class="topbar">
      <div>
        <h1>給与管理クラウド</h1>
        <p>Vue + Hono + PostgreSQL / Railway</p>
      </div>
      <div class="actions">
        <button @click="refresh"><RefreshCw :size="16" />更新</button>
        <button @click="exportCsv"><Download :size="16" />CSV出力</button>
        <button @click="logout"><LogOut :size="16" />ログアウト</button>
      </div>
    </header>

    <section class="filters">
      <label>支給月<input v-model="period" type="month" @change="refresh" /></label>
      <label>社員検索<input v-model="query" placeholder="氏名・社員番号" @keyup.enter="refresh" /></label>
      <button class="primary" @click="refresh"><Search :size="16" />検索</button>
      <span v-if="message" class="message">{{ message }}</span>
    </section>

    <section class="summary">
      <div><span>社員数</span><strong>{{ employees.length }}名</strong></div>
      <div><span>総支給額</span><strong>{{ yen.format(totals.gross) }}</strong></div>
      <div><span>控除合計</span><strong>{{ yen.format(totals.deduction) }}</strong></div>
      <div><span>差引支給額</span><strong>{{ yen.format(totals.net) }}</strong></div>
    </section>

    <div class="workspace">
      <section class="panel employee-list">
        <div class="panel-head">
          <h2>社員</h2>
          <button @click="applyEmployee()"><Plus :size="16" />追加</button>
        </div>
        <button
          v-for="employee in employees"
          :key="employee.id"
          class="employee-item"
          :class="{ active: employee.id === selectedEmployeeId }"
          @click="applyEmployee(employee)"
        >
          <strong>{{ employee.name }}</strong>
          <span>{{ employee.employeeNo }} / 扶養人数: {{ employee.defaultDependentCount }}</span>
        </button>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>社員・給与入力</h2></div>
        <div class="form-grid">
          <label>社員番号<input v-model="employeeForm.employeeNo" /></label>
          <label>氏名<input v-model="employeeForm.name" /></label>
          <label>メール<input v-model="employeeForm.email" type="email" /></label>
          <label>既定の扶養人数<input v-model.number="employeeForm.defaultDependentCount" type="number" min="0" /></label>
          <label>給与区分<select v-model="employeeForm.payType"><option value="MONTHLY">月給</option><option value="HOURLY">時給</option></select></label>
          <label>基本給・時給<input v-model.number="employeeForm.basePay" type="number" min="0" /></label>
          <label class="wide">メモ<input v-model="employeeForm.memo" /></label>
          <div class="form-actions full">
            <button @click="deleteEmployee"><Trash2 :size="16" />非表示</button>
            <button class="primary" @click="saveEmployee"><Save :size="16" />社員保存</button>
          </div>
        </div>

        <div class="divider"></div>
        <div class="form-grid">
          <label>所定労働日数<input v-model.number="payrollForm.workDays" type="number" min="0" step="0.5" /></label>
          <label>実働時間<input v-model.number="payrollForm.workHours" type="number" min="0" step="0.25" /></label>
          <label>残業時間<input v-model.number="payrollForm.overtimeHours" type="number" min="0" step="0.25" /></label>
          <label>扶養人数<input v-model.number="payrollForm.dependentCount" type="number" min="0" /></label>
          <label>社会保険加入<select v-model="payrollForm.socialInsuranceEnrolled"><option :value="true">加入</option><option :value="false">未加入</option></select></label>
          <label v-if="payrollForm.socialInsuranceEnrolled">社会保険適用金額<input v-model.number="payrollForm.socialInsuranceBaseAmount" type="number" min="0" placeholder="未入力時は総支給額" /></label>
          <label>手当<input v-model.number="payrollForm.allowance" type="number" min="0" /></label>
          <label>固定控除<input v-model.number="payrollForm.fixedDeduction" type="number" min="0" /></label>
          <label class="wide">備考<input v-model="payrollForm.note" /></label>
          <div class="form-actions full">
            <button class="primary" @click="savePayroll"><Save :size="16" />給与保存</button>
            <button @click="sendPayslipEmail"><Mail :size="16" />PDFメール送信</button>
          </div>
        </div>
      </section>

      <section class="panel payslip">
        <div class="panel-head"><h2>年度料率</h2></div>
        <div class="form-grid compact">
          <label>年度<input v-model.number="rateForm.fiscalYear" type="number" /></label>
          <label>残業割増率<input v-model.number="rateForm.overtimeRate" type="number" step="0.001" /></label>
          <label>所得税率（表なし時）<input v-model.number="rateForm.incomeTaxRate" type="number" step="0.0001" /></label>
          <label>社会保険率<input v-model.number="rateForm.socialInsuranceRate" type="number" step="0.0001" /></label>
          <label>雇用保険率<input v-model.number="rateForm.employmentInsuranceRate" type="number" step="0.0001" /></label>
          <label class="wide">メモ<input v-model="rateForm.memo" /></label>
          <div class="form-actions full">
            <button class="primary" @click="saveRate"><Save :size="16" />年度料率保存</button>
          </div>
        </div>
        <div class="rate-list">
          <button v-for="rate in fiscalRates" :key="rate.fiscalYear" @click="applyRate(rate)">
            {{ rate.fiscalYear }}年度
          </button>
        </div>

        <div class="divider"></div>
        <div class="panel-head"><h2>所得税表インポート</h2></div>
        <div class="tax-import">
          <p class="note">CSV列: fiscalYear, dependentCount, minTaxable, maxTaxable, taxAmount</p>
          <textarea v-model="taxImport.csv" rows="6"></textarea>
          <div class="form-actions">
            <button class="primary" @click="importIncomeTaxTable"><Upload :size="16" />所得税表を取り込む</button>
          </div>
          <p class="note">{{ fiscalYearFromPeriod(period) }}年度の読込行数: {{ incomeTaxBrackets.length }}件</p>
        </div>

        <div class="divider"></div>
        <div class="panel-head"><h2>給与明細</h2></div>
        <div v-if="selectedPayroll" class="slip">
          <h3>{{ selectedPayroll.employee.name }}</h3>
          <p class="message">適用年度: {{ activeRate?.fiscalYear || fiscalYearFromPeriod(period) }}年度</p>
          <dl>
            <dt>基本給</dt><dd>{{ yen.format(selectedPayroll.regularPay) }}</dd>
            <dt>残業代</dt><dd>{{ yen.format(selectedPayroll.overtimePay) }}</dd>
            <dt>総支給額</dt><dd>{{ yen.format(selectedPayroll.grossPay) }}</dd>
            <dt>扶養人数</dt><dd>{{ selectedPayroll.dependentCount }}</dd>
            <dt>課税対象額</dt><dd>{{ yen.format(selectedPayroll.taxableIncome || 0) }}</dd>
            <dt>所得税</dt><dd>{{ yen.format(selectedPayroll.incomeTax) }}</dd>
            <dt>社会保険加入</dt><dd>{{ selectedPayroll.socialInsuranceEnrolled ? "加入" : "未加入" }}</dd>
            <dt>社会保険適用金額</dt><dd>{{ selectedPayroll.socialInsuranceBaseAmount ? yen.format(selectedPayroll.socialInsuranceBaseAmount) : "総支給額" }}</dd>
            <dt>社会保険</dt><dd>{{ yen.format(selectedPayroll.socialInsurance) }}</dd>
            <dt>雇用保険</dt><dd>{{ yen.format(selectedPayroll.employmentInsurance) }}</dd>
            <dt>控除合計</dt><dd>{{ yen.format(selectedPayroll.totalDeduction) }}</dd>
          </dl>
          <div class="net"><span>差引支給額</span><strong>{{ yen.format(selectedPayroll.netPay) }}</strong></div>
          <p class="message">メール送信: {{ selectedPayroll.emailedAt ? new Date(selectedPayroll.emailedAt).toLocaleString("ja-JP") : "未送信" }}</p>
        </div>
        <div v-else class="empty">この社員の給与はまだ保存されていません。</div>
      </section>
    </div>
  </main>
</template>
