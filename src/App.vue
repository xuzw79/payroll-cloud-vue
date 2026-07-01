<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Download, LogOut, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-vue-next";

type PayType = "MONTHLY" | "HOURLY";

type Employee = {
  id: string;
  employeeNo: string;
  name: string;
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
  grossPay: number;
  totalDeduction: number;
  netPay: number;
  regularPay: number;
  overtimePay: number;
  incomeTax: number;
  socialInsurance: number;
  employmentInsurance: number;
  employee: Employee;
};

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const today = new Date().toISOString().slice(0, 7);
const loggedIn = ref(false);
const loading = ref(false);
const message = ref("");
const query = ref("");
const period = ref(today);
const employees = ref<Employee[]>([]);
const payrolls = ref<Payroll[]>([]);
const selectedEmployeeId = ref("");

const loginForm = reactive({ email: "admin@example.com", password: "" });
const employeeForm = reactive({ id: "", employeeNo: "", name: "", payType: "MONTHLY" as PayType, basePay: 0, memo: "" });
const payrollForm = reactive({
  workDays: 20,
  workHours: 160,
  overtimeHours: 0,
  allowance: 0,
  fixedDeduction: 0,
  note: ""
});
const settings = reactive({
  overtimeRate: 1.25,
  incomeTaxRate: 0.03,
  socialInsuranceRate: 0.15,
  employmentInsuranceRate: 0.006
});

const selectedEmployee = computed(() => employees.value.find((employee) => employee.id === selectedEmployeeId.value));
const selectedPayroll = computed(() => payrolls.value.find((payroll) => payroll.employeeId === selectedEmployeeId.value));
const totals = computed(() => payrolls.value.reduce(
  (acc, payroll) => {
    acc.gross += payroll.grossPay;
    acc.deduction += payroll.totalDeduction;
    acc.net += payroll.netPay;
    return acc;
  },
  { gross: 0, deduction: 0, net: 0 }
));

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
  const target = employee || { id: "", employeeNo: nextEmployeeNo(), name: "", payType: "MONTHLY" as PayType, basePay: 0, memo: "" };
  employeeForm.id = target.id;
  employeeForm.employeeNo = target.employeeNo;
  employeeForm.name = target.name;
  employeeForm.payType = target.payType;
  employeeForm.basePay = target.basePay;
  employeeForm.memo = target.memo || "";
  selectedEmployeeId.value = target.id;
  const payroll = payrolls.value.find((item) => item.employeeId === target.id);
  if (payroll) {
    payrollForm.workDays = Number(payroll.workDays);
    payrollForm.workHours = Number(payroll.workHours);
    payrollForm.overtimeHours = Number(payroll.overtimeHours);
    payrollForm.allowance = payroll.allowance;
    payrollForm.fixedDeduction = payroll.fixedDeduction;
  }
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
    const [settingsData, employeeData, payrollData] = await Promise.all([
      request<typeof settings>("/settings"),
      request<Employee[]>(`/employees?q=${encodeURIComponent(query.value)}`),
      request<Payroll[]>(`/payrolls?period=${encodeURIComponent(period.value)}`)
    ]);
    Object.assign(settings, {
      overtimeRate: Number(settingsData.overtimeRate),
      incomeTaxRate: Number(settingsData.incomeTaxRate),
      socialInsuranceRate: Number(settingsData.socialInsuranceRate),
      employmentInsuranceRate: Number(settingsData.employmentInsuranceRate)
    });
    employees.value = employeeData;
    payrolls.value = payrollData;
    if (!selectedEmployeeId.value && employees.value[0]) applyEmployee(employees.value[0]);
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  await request("/settings", { method: "PUT", body: JSON.stringify(settings) });
  message.value = "設定を保存しました";
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
    body: JSON.stringify({
      employeeId: selectedEmployee.value.id,
      period: period.value,
      ...payrollForm,
      ...settings
    })
  });
  message.value = "給与を保存しました";
  await refresh();
}

function exportCsv() {
  const header = ["支給月", "社員番号", "氏名", "給与区分", "総支給額", "控除合計", "差引支給額"];
  const rows = payrolls.value.map((payroll) => [
    payroll.period,
    payroll.employee.employeeNo,
    payroll.employee.name,
    payroll.employee.payType === "MONTHLY" ? "月給" : "時給",
    payroll.grossPay,
    payroll.totalDeduction,
    payroll.netPay
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
        <button @click="exportCsv"><Download :size="16" />CSV</button>
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
      <div><span>対象社員</span><strong>{{ employees.length }}名</strong></div>
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
          <span>{{ employee.employeeNo }} / {{ employee.payType === "MONTHLY" ? "月給" : "時給" }}</span>
        </button>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>社員・給与入力</h2></div>
        <div class="form-grid">
          <label>社員番号<input v-model="employeeForm.employeeNo" /></label>
          <label>氏名<input v-model="employeeForm.name" /></label>
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
          <label>手当<input v-model.number="payrollForm.allowance" type="number" min="0" /></label>
          <label>固定控除<input v-model.number="payrollForm.fixedDeduction" type="number" min="0" /></label>
          <label class="wide">備考<input v-model="payrollForm.note" /></label>
          <div class="form-actions full">
            <button class="primary" @click="savePayroll"><Save :size="16" />給与保存</button>
          </div>
        </div>

        <div class="divider"></div>
        <div class="form-grid compact">
          <label>残業割増率<input v-model.number="settings.overtimeRate" type="number" step="0.001" /></label>
          <label>所得税率<input v-model.number="settings.incomeTaxRate" type="number" step="0.0001" /></label>
          <label>社会保険率<input v-model.number="settings.socialInsuranceRate" type="number" step="0.0001" /></label>
          <label>雇用保険率<input v-model.number="settings.employmentInsuranceRate" type="number" step="0.0001" /></label>
          <div class="form-actions full">
            <button @click="saveSettings"><Save :size="16" />設定保存</button>
          </div>
        </div>
      </section>

      <section class="panel payslip">
        <div class="panel-head"><h2>月別明細</h2></div>
        <div v-if="selectedPayroll" class="slip">
          <h3>{{ selectedPayroll.employee.name }}</h3>
          <dl>
            <dt>基本給</dt><dd>{{ yen.format(selectedPayroll.regularPay) }}</dd>
            <dt>残業代</dt><dd>{{ yen.format(selectedPayroll.overtimePay) }}</dd>
            <dt>総支給額</dt><dd>{{ yen.format(selectedPayroll.grossPay) }}</dd>
            <dt>所得税</dt><dd>{{ yen.format(selectedPayroll.incomeTax) }}</dd>
            <dt>社会保険</dt><dd>{{ yen.format(selectedPayroll.socialInsurance) }}</dd>
            <dt>雇用保険</dt><dd>{{ yen.format(selectedPayroll.employmentInsurance) }}</dd>
            <dt>控除合計</dt><dd>{{ yen.format(selectedPayroll.totalDeduction) }}</dd>
          </dl>
          <div class="net"><span>差引支給額</span><strong>{{ yen.format(selectedPayroll.netPay) }}</strong></div>
        </div>
        <div v-else class="empty">この社員の給与はまだ保存されていません。</div>
      </section>
    </div>
  </main>
</template>
