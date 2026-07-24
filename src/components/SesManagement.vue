<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Download, Plus, Save, Search, Trash2 } from "lucide-vue-next";

type SesSubMenu = "customers" | "projects" | "invoices" | "masters" | "revenue" | "partnerCosts" | "profit";
type MemberSource = "EMPLOYEE" | "EXTERNAL";
type BillingType = "FIXED" | "TIME_RANGE" | "HOURLY";
type ContractType = "SALES" | "PURCHASE";

type Customer = {
  id: string;
  name: string;
  code?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  invoiceNumber?: string | null;
  isSoleProprietor?: boolean | null;
  closingDay?: number | null;
  paymentSiteDays?: number | null;
  memo?: string | null;
};

type Employee = {
  id: string;
  employeeNo: string;
  name: string;
};

type ExternalMember = {
  id: string;
  customerId?: string | null;
  name: string;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  memo?: string | null;
  customer?: Customer | null;
};

type ContractMember = {
  id?: string;
  source: MemberSource;
  employeeId?: string | null;
  externalMemberId?: string | null;
  billingType: BillingType;
  itemDescription?: string | null;
  unitPrice: number;
  lowerLimitHours?: number | null;
  upperLimitHours?: number | null;
  deductionHourlyRate: number;
  excessHourlyRate: number;
  startDate?: string | null;
  endDate?: string | null;
  memo?: string | null;
  employee?: Employee | null;
  externalMember?: ExternalMember | null;
};

type Contract = {
  id: string;
  customerId: string;
  contractType: ContractType;
  contractNo?: string | null;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  memo?: string | null;
  customer: Customer;
  members: ContractMember[];
};

type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
};

type Invoice = {
  id: string;
  customerId: string;
  contractId?: string | null;
  period: string;
  invoiceNo?: string | null;
  issueDate: string;
  dueDate?: string | null;
  title: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  customer: Customer;
  contract?: Contract | null;
  items: InvoiceItem[];
};

type CompanySetting = {
  invoiceCompanyName?: string | null;
  invoicePostalCode?: string | null;
  invoiceAddress?: string | null;
  invoiceTel?: string | null;
  invoiceRegistrationNo?: string | null;
  invoiceBankName?: string | null;
  invoiceBankBranch?: string | null;
  invoiceBankAccount?: string | null;
  invoiceBankHolder?: string | null;
};

type ContractMemberForm = {
  key: string;
  source: MemberSource;
  employeeId: string;
  externalMemberId: string;
  billingType: BillingType;
  itemDescription: string;
  unitPrice: number;
  lowerLimitHours: number | null;
  upperLimitHours: number | null;
  deductionHourlyRate: number;
  excessHourlyRate: number;
  startDate: string;
  endDate: string;
  memo: string;
};

const props = defineProps<{ canEditSes: boolean }>();
const emit = defineEmits<{ message: [value: string] }>();

function currentYearMonth() {
  return new Date().toISOString().slice(0, 7);
}

function previousYearMonth(value = currentYearMonth()) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return currentYearMonth();
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

const subMenus: { key: SesSubMenu; label: string; description: string }[] = [
  { key: "customers", label: "取引先管理", description: "顧客・協力会社の基本情報を管理します。" },
  { key: "projects", label: "案件・契約管理", description: "請求契約と仕入契約、契約期間、作業者、契約先を管理します。" },
  { key: "invoices", label: "請求管理", description: "請求契約から請求書を作成し、PDFを出力します。" },
  { key: "masters", label: "マスタ管理", description: "自社情報、振込先など共通マスタを管理します。" },
  { key: "revenue", label: "月次売上入力", description: "社員別・案件別の毎月売上を登録します。" },
  { key: "partnerCosts", label: "外注費入力", description: "協力会社への月額支払を登録します。" },
  { key: "profit", label: "個人別利益", description: "売上、給与、外注費から利益を確認します。" }
];

const activeSubMenu = ref<SesSubMenu>("customers");
const loading = ref(false);
const customerQuery = ref("");
const contractQuery = ref("");
const invoiceQuery = ref("");
const defaultInvoicePeriod = previousYearMonth();
const invoiceSearchPeriod = ref(defaultInvoicePeriod);
const customers = ref<Customer[]>([]);
const employees = ref<Employee[]>([]);
const externalMembers = ref<ExternalMember[]>([]);
const contracts = ref<Contract[]>([]);
const invoices = ref<Invoice[]>([]);
const periodInvoices = ref<Invoice[]>([]);
const selectedCustomerId = ref("");
const selectedContractId = ref("");
const selectedInvoiceId = ref("");
const contractMembers = ref<ContractMemberForm[]>([]);
const invoiceWorkHours = reactive<Record<string, number | null>>({});

const activeMenuInfo = computed(() => subMenus.find((menu) => menu.key === activeSubMenu.value) || subMenus[0]);
const selectedCustomerExternalMembers = computed(() => externalMembers.value.filter((member) => member.customerId === customerForm.id));
const salesContracts = computed(() => contracts.value.filter((contract) => contract.contractType === "SALES"));
const unbilledSalesContracts = computed(() => {
  const billedContractIds = new Set(periodInvoices.value.map((invoice) => invoice.contractId).filter(Boolean));
  return salesContracts.value.filter((contract) => !billedContractIds.has(contract.id));
});
const selectedInvoiceContract = computed(() => salesContracts.value.find((contract) => contract.id === invoiceForm.contractId));
const selectedInvoiceWorkHourMembers = computed(() => selectedInvoiceContract.value?.members.filter(
  (member): member is ContractMember & { id: string } => member.billingType !== "FIXED" && !!member.id
) || []);

const customerForm = reactive({
  id: "",
  name: "",
  code: "",
  contactName: "",
  email: "",
  phone: "",
  postalCode: "",
  address: "",
  invoiceNumber: "",
  isSoleProprietor: false,
  closingDay: null as number | null,
  paymentSiteDays: null as number | null,
  memo: ""
});

const externalMemberForm = reactive({
  customerId: "",
  name: "",
  code: "",
  email: "",
  phone: "",
  memo: ""
});

const companyForm = reactive({
  invoiceCompanyName: "",
  invoicePostalCode: "",
  invoiceAddress: "",
  invoiceTel: "",
  invoiceRegistrationNo: "",
  invoiceBankName: "",
  invoiceBankBranch: "",
  invoiceBankAccount: "",
  invoiceBankHolder: ""
});

const contractForm = reactive({
  id: "",
  customerId: "",
  contractType: "SALES" as ContractType,
  contractNo: "",
  title: "",
  startDate: "",
  endDate: "",
  memo: ""
});

const invoiceForm = reactive({
  contractId: "",
  period: defaultInvoicePeriod,
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  invoiceNo: "",
  title: "",
  note: ""
});

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

function newMemberRow(): ContractMemberForm {
  return {
    key: crypto.randomUUID(),
    source: "EMPLOYEE",
    employeeId: "",
    externalMemberId: "",
    billingType: "FIXED",
    itemDescription: "",
    unitPrice: 0,
    lowerLimitHours: null,
    upperLimitHours: null,
    deductionHourlyRate: 0,
    excessHourlyRate: 0,
    startDate: contractForm.startDate,
    endDate: contractForm.endDate,
    memo: ""
  };
}

function resetCustomerForm() {
  Object.assign(customerForm, {
    id: "",
    name: "",
    code: "",
    contactName: "",
    email: "",
    phone: "",
    postalCode: "",
    address: "",
    invoiceNumber: "",
    isSoleProprietor: false,
    closingDay: null,
    paymentSiteDays: null,
    memo: ""
  });
  selectedCustomerId.value = "";
  externalMemberForm.customerId = "";
}

function applyCustomer(customer?: Customer) {
  if (!customer) {
    resetCustomerForm();
    return;
  }
  Object.assign(customerForm, {
    id: customer.id,
    name: customer.name,
    code: customer.code || "",
    contactName: customer.contactName || "",
    email: customer.email || "",
    phone: customer.phone || "",
    postalCode: customer.postalCode || "",
    address: customer.address || "",
    invoiceNumber: customer.invoiceNumber || "",
    isSoleProprietor: customer.isSoleProprietor ?? false,
    closingDay: customer.closingDay ?? null,
    paymentSiteDays: customer.paymentSiteDays ?? null,
    memo: customer.memo || ""
  });
  selectedCustomerId.value = customer.id;
  externalMemberForm.customerId = customer.id;
}

function resetContractForm() {
  Object.assign(contractForm, {
    id: "",
    customerId: "",
    contractType: "SALES",
    contractNo: "",
    title: "",
    startDate: "",
    endDate: "",
    memo: ""
  });
  selectedContractId.value = "";
  contractMembers.value = [newMemberRow()];
}

function applyContract(contract?: Contract) {
  if (!contract) {
    resetContractForm();
    return;
  }
  Object.assign(contractForm, {
    id: contract.id,
    customerId: contract.customerId,
    contractType: contract.contractType,
    contractNo: contract.contractNo || "",
    title: contract.title,
    startDate: contract.startDate || "",
    endDate: contract.endDate || "",
    memo: contract.memo || ""
  });
  selectedContractId.value = contract.id;
  contractMembers.value = contract.members.length ? contract.members.map((member) => ({
    key: member.id || crypto.randomUUID(),
    source: member.source,
    employeeId: member.employeeId || "",
    externalMemberId: member.externalMemberId || "",
    billingType: member.billingType,
    itemDescription: member.itemDescription || "",
    unitPrice: Number(member.unitPrice || 0),
    lowerLimitHours: member.lowerLimitHours == null ? null : Number(member.lowerLimitHours),
    upperLimitHours: member.upperLimitHours == null ? null : Number(member.upperLimitHours),
    deductionHourlyRate: Number(member.deductionHourlyRate || 0),
    excessHourlyRate: Number(member.excessHourlyRate || 0),
    startDate: member.startDate || "",
    endDate: member.endDate || "",
    memo: member.memo || ""
  })) : [newMemberRow()];
}

async function refreshCustomers() {
  loading.value = true;
  try {
    customers.value = await request<Customer[]>(`/customers?q=${encodeURIComponent(customerQuery.value)}`);
  } finally {
    loading.value = false;
  }
}

async function refreshContracts() {
  contracts.value = await request<Contract[]>(`/ses/contracts?q=${encodeURIComponent(contractQuery.value)}`);
}

async function refreshInvoices() {
  const params = new URLSearchParams({ q: invoiceQuery.value, period: invoiceSearchPeriod.value });
  const periodParams = new URLSearchParams({ period: invoiceSearchPeriod.value });
  const [filteredInvoices, allPeriodInvoices] = await Promise.all([
    request<Invoice[]>(`/ses/invoices?${params.toString()}`),
    request<Invoice[]>(`/ses/invoices?${periodParams.toString()}`)
  ]);
  invoices.value = filteredInvoices;
  periodInvoices.value = allPeriodInvoices;
}

async function onInvoiceSearchPeriodChange() {
  invoiceForm.period = invoiceSearchPeriod.value;
  await refreshInvoices();
}

function applyInvoiceContract(contract: Contract) {
  invoiceForm.contractId = contract.id;
  invoiceForm.period = invoiceSearchPeriod.value;
  invoiceForm.invoiceNo = "";
  invoiceForm.title = "";
  invoiceForm.note = "";
}

function showError(error: unknown, fallback: string) {
  emit("message", error instanceof Error ? error.message : fallback);
}

async function refreshCompanySetting() {
  const setting = await request<CompanySetting>("/ses/company-setting");
  Object.assign(companyForm, {
    invoiceCompanyName: setting.invoiceCompanyName || "",
    invoicePostalCode: setting.invoicePostalCode || "",
    invoiceAddress: setting.invoiceAddress || "",
    invoiceTel: setting.invoiceTel || "",
    invoiceRegistrationNo: setting.invoiceRegistrationNo || "",
    invoiceBankName: setting.invoiceBankName || "",
    invoiceBankBranch: setting.invoiceBankBranch || "",
    invoiceBankAccount: setting.invoiceBankAccount || "",
    invoiceBankHolder: setting.invoiceBankHolder || ""
  });
}

async function refreshSesMasterData() {
  const [employeeData, externalMemberData] = await Promise.all([
    request<Employee[]>("/employees"),
    request<ExternalMember[]>("/ses/external-members")
  ]);
  employees.value = employeeData;
  externalMembers.value = externalMemberData;
}

async function refreshAll() {
  await Promise.all([refreshCustomers(), refreshContracts(), refreshSesMasterData(), refreshInvoices(), refreshCompanySetting()]);
}

async function saveCustomer() {
  if (!props.canEditSes) return;
  try {
    const method = customerForm.id ? "PUT" : "POST";
    const path = customerForm.id ? `/customers/${customerForm.id}` : "/customers";
    const customer = await request<Customer>(path, { method, body: JSON.stringify(customerForm) });
    emit("message", "取引先を保存しました");
    await refreshCustomers();
    applyCustomer(customer);
  } catch (error) {
    showError(error, "取引先を保存できませんでした");
  }
}

async function deleteCustomer() {
  if (!props.canEditSes || !customerForm.id || !confirm("この取引先を非表示にしますか？")) return;
  await request(`/customers/${customerForm.id}`, { method: "DELETE" });
  emit("message", "取引先を非表示にしました");
  resetCustomerForm();
  await refreshCustomers();
}

async function saveExternalMember() {
  if (!props.canEditSes) return;
  try {
    const member = await request<ExternalMember>("/ses/external-members", {
      method: "POST",
      body: JSON.stringify({ ...externalMemberForm, customerId: externalMemberForm.customerId || customerForm.id })
    });
    emit("message", "別会社の従業員を登録しました");
    Object.assign(externalMemberForm, { customerId: customerForm.id || "", name: "", code: "", email: "", phone: "", memo: "" });
    await refreshSesMasterData();
    const lastBlank = contractMembers.value.find((row) => row.source === "EXTERNAL" && !row.externalMemberId);
    if (lastBlank) lastBlank.externalMemberId = member.id;
  } catch (error) {
    showError(error, "別会社の従業員を登録できませんでした");
  }
}

function addContractMember() {
  contractMembers.value.push(newMemberRow());
}

function removeContractMember(index: number) {
  contractMembers.value.splice(index, 1);
  if (!contractMembers.value.length) contractMembers.value.push(newMemberRow());
}

function onMemberSourceChange(member: ContractMemberForm) {
  member.employeeId = "";
  member.externalMemberId = "";
}

async function saveContract() {
  if (!props.canEditSes) return;
  try {
    const payload = {
      ...contractForm,
      members: contractMembers.value.map(({ key, ...member }) => member)
    };
    const method = contractForm.id ? "PUT" : "POST";
    const path = contractForm.id ? `/ses/contracts/${contractForm.id}` : "/ses/contracts";
    const contract = await request<Contract>(path, { method, body: JSON.stringify(payload) });
    emit("message", "契約を保存しました");
    await refreshContracts();
    applyContract(contract);
  } catch (error) {
    showError(error, "契約を保存できませんでした");
  }
}

async function deleteContract() {
  if (!props.canEditSes || !contractForm.id || !confirm("この契約を非表示にしますか？")) return;
  try {
    await request(`/ses/contracts/${contractForm.id}`, { method: "DELETE" });
    emit("message", "契約を非表示にしました");
    resetContractForm();
    await refreshContracts();
  } catch (error) {
    showError(error, "契約を非表示にできませんでした");
  }
}

async function saveCompanySetting() {
  if (!props.canEditSes) return;
  try {
    await request<CompanySetting>("/ses/company-setting", { method: "PUT", body: JSON.stringify(companyForm) });
    emit("message", "請求書用の自社情報を保存しました");
  } catch (error) {
    showError(error, "請求書用の自社情報を保存できませんでした");
  }
}

async function generateInvoice() {
  if (!props.canEditSes) return;
  try {
    const invoice = await request<Invoice>("/ses/invoices/generate", {
      method: "POST",
      body: JSON.stringify({ ...invoiceForm, workHoursByMember: invoiceWorkHours })
    });
    emit("message", "請求書を作成しました");
    selectedInvoiceId.value = invoice.id;
    await refreshInvoices();
  } catch (error) {
    showError(error, "請求書を作成できませんでした");
  }
}

async function deleteInvoice(invoice: Invoice) {
  if (!props.canEditSes || !confirm("この請求書を非表示にしますか？")) return;
  await request(`/ses/invoices/${invoice.id}`, { method: "DELETE" });
  emit("message", "請求書を非表示にしました");
  if (selectedInvoiceId.value === invoice.id) selectedInvoiceId.value = "";
  await refreshInvoices();
}

async function downloadInvoicePdf(invoice: Invoice) {
  const response = await fetch(`/api/ses/invoices/${invoice.id}/pdf`, { credentials: "include" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "請求書PDFダウンロードに失敗しました" }));
    throw new Error(error.message || "請求書PDFダウンロードに失敗しました");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `請求書_${invoice.customer.name}_${invoice.period.replace("-", "")}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  emit("message", "請求書PDFをダウンロードしました");
}

function memberName(member: ContractMember) {
  return member.source === "EMPLOYEE"
    ? member.employee?.name || "社員未設定"
    : member.externalMember?.name || "外部メンバー未設定";
}

onMounted(async () => {
  resetContractForm();
  await refreshAll();
});
</script>

<template>
  <div class="ses-workspace">
    <nav class="sub-menu" aria-label="SES管理メニュー">
      <button
        v-for="menu in subMenus"
        :key="menu.key"
        :class="{ active: activeSubMenu === menu.key }"
        @click="activeSubMenu = menu.key"
      >
        {{ menu.label }}
      </button>
    </nav>

    <section v-if="activeSubMenu === 'customers'" class="panel">
      <div class="panel-head">
        <h2>取引先管理</h2>
        <button v-if="canEditSes" @click="applyCustomer()"><Plus :size="16" />追加</button>
      </div>
      <div class="ses-layout">
        <div class="ses-list">
          <div class="filter-row ses-search">
            <label>取引先検索<input v-model="customerQuery" placeholder="会社名・コード・担当者" @keyup.enter="refreshCustomers" /></label>
            <button class="primary" @click="refreshCustomers"><Search :size="16" />検索</button>
          </div>
          <button
            v-for="customer in customers"
            :key="customer.id"
            class="employee-item"
            :class="{ active: customer.id === selectedCustomerId }"
            @click="applyCustomer(customer)"
          >
            <strong>{{ customer.name }}</strong>
            <span>{{ customer.isSoleProprietor ? "個人事業主" : "法人" }}</span>
            <span>{{ customer.code || "コードなし" }} / {{ customer.contactName || "担当者未設定" }}</span>
          </button>
          <div v-if="!customers.length" class="empty">
            {{ loading ? "読込中..." : "取引先が登録されていません。" }}
          </div>
        </div>

        <div class="form-grid">
          <label>取引先名<input v-model="customerForm.name" /></label>
          <label>取引先区分<select v-model="customerForm.isSoleProprietor"><option :value="false">法人</option><option :value="true">個人事業主</option></select></label>
          <label>取引先コード<input v-model="customerForm.code" /></label>
          <label>担当者<input v-model="customerForm.contactName" /></label>
          <label>メール<input v-model="customerForm.email" type="email" /></label>
          <label>電話番号<input v-model="customerForm.phone" /></label>
          <label>郵便番号<input v-model="customerForm.postalCode" /></label>
          <label class="wide">住所<input v-model="customerForm.address" /></label>
          <label>インボイス番号<input v-model="customerForm.invoiceNumber" /></label>
          <label>締日<input v-model.number="customerForm.closingDay" type="number" min="1" max="31" /></label>
          <label>支払サイト日数<input v-model.number="customerForm.paymentSiteDays" type="number" min="0" /></label>
          <label class="wide">メモ<input v-model="customerForm.memo" /></label>
          <div class="form-actions full">
            <button v-if="canEditSes" @click="deleteCustomer"><Trash2 :size="16" />非表示</button>
            <button v-if="canEditSes" class="primary" @click="saveCustomer"><Save :size="16" />取引先保存</button>
          </div>
          <div class="sub-panel full">
            <h3>別会社の従業員登録</h3>
            <div class="form-grid compact">
              <label>所属会社<select v-model="externalMemberForm.customerId"><option value="">未選択</option><option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.name }}</option></select></label>
              <label>氏名<input v-model="externalMemberForm.name" /></label>
              <label>コード<input v-model="externalMemberForm.code" /></label>
              <label>メール<input v-model="externalMemberForm.email" type="email" /></label>
              <label>電話番号<input v-model="externalMemberForm.phone" /></label>
              <label class="wide">メモ<input v-model="externalMemberForm.memo" /></label>
              <div class="form-actions full">
                <button v-if="canEditSes" @click="saveExternalMember"><Plus :size="16" />外部メンバー登録</button>
              </div>
            </div>
            <div v-if="customerForm.id" class="ses-cards compact-cards">
              <div v-for="member in selectedCustomerExternalMembers" :key="member.id">
                <strong>{{ member.name }}</strong>
                <span>{{ member.code || "コードなし" }} / {{ member.email || "メール未設定" }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeSubMenu === 'projects'" class="panel">
      <div class="panel-head">
        <h2>案件・契約管理</h2>
        <button v-if="canEditSes" @click="applyContract()"><Plus :size="16" />契約追加</button>
      </div>
      <div class="ses-layout contract-layout">
        <div class="ses-list">
          <div class="filter-row ses-search">
            <label>契約検索<input v-model="contractQuery" placeholder="契約名・契約番号・契約先" @keyup.enter="refreshContracts" /></label>
            <button class="primary" @click="refreshContracts"><Search :size="16" />検索</button>
          </div>
          <button
            v-for="contract in contracts"
            :key="contract.id"
            class="employee-item"
            :class="{ active: contract.id === selectedContractId }"
            @click="applyContract(contract)"
          >
            <strong>{{ contract.title }}</strong>
            <span>{{ contract.contractType === "SALES" ? "請求契約" : "仕入契約" }} / {{ contract.customer.name }}</span>
            <span>{{ contract.startDate || "-" }} - {{ contract.endDate || "-" }}</span>
            <span>メンバー {{ contract.members.length }}名</span>
          </button>
          <div v-if="!contracts.length" class="empty">契約が登録されていません。</div>
        </div>

        <div class="contract-editor">
          <div class="ses-flow-note">
            請求契約: 弊社とA社の契約、A社へ請求。仕入契約: 弊社とB社の契約、B社から弊社へ請求。別会社従業員は所属会社をB社として登録します。
          </div>
          <div class="form-grid">
            <label>契約区分<select v-model="contractForm.contractType"><option value="SALES">請求契約（弊社から契約先へ請求）</option><option value="PURCHASE">仕入契約（契約先から弊社へ請求）</option></select></label>
            <label>契約先<select v-model="contractForm.customerId"><option value="">選択</option><option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.name }}</option></select></label>
            <label>契約番号<input v-model="contractForm.contractNo" /></label>
            <label class="wide">契約名<input v-model="contractForm.title" /></label>
            <label>契約開始日<input v-model="contractForm.startDate" type="date" /></label>
            <label>契約終了日<input v-model="contractForm.endDate" type="date" /></label>
            <label class="wide">メモ<input v-model="contractForm.memo" /></label>
          </div>

          <div class="sub-panel">
            <div class="sub-panel-head">
              <h3>契約メンバー</h3>
              <button v-if="canEditSes" @click="addContractMember"><Plus :size="16" />メンバー追加</button>
            </div>
            <div class="contract-member-list">
              <div v-for="(member, index) in contractMembers" :key="member.key" class="contract-member-row">
                <div class="form-grid compact">
                  <label>区分<select v-model="member.source" @change="onMemberSourceChange(member)"><option value="EMPLOYEE">社員</option><option value="EXTERNAL">別会社従業員</option></select></label>
                  <label v-if="member.source === 'EMPLOYEE'">社員<select v-model="member.employeeId"><option value="">選択</option><option v-for="employee in employees" :key="employee.id" :value="employee.id">{{ employee.employeeNo }} / {{ employee.name }}</option></select></label>
                  <label v-else>別会社従業員<select v-model="member.externalMemberId"><option value="">選択</option><option v-for="externalMember in externalMembers" :key="externalMember.id" :value="externalMember.id">{{ externalMember.customer?.name || "所属未設定" }} / {{ externalMember.name }}</option></select></label>
                  <label>単価区分<select v-model="member.billingType"><option value="FIXED">定額</option><option value="TIME_RANGE">精算時間範囲</option><option value="HOURLY">時給</option></select></label>
                  <label class="wide">品名・摘要<input v-model="member.itemDescription" placeholder="請求書明細に印字" /></label>
                  <label>{{ member.billingType === "HOURLY" ? "通常時給" : "単価" }}<input v-model.number="member.unitPrice" type="number" min="0" /></label>
                  <label v-if="member.billingType === 'TIME_RANGE'">下限時間<input v-model.number="member.lowerLimitHours" type="number" min="0" step="0.01" /></label>
                  <label v-if="member.billingType === 'TIME_RANGE'">上限時間<input v-model.number="member.upperLimitHours" type="number" min="0" step="0.01" /></label>
                  <label v-if="member.billingType === 'HOURLY'">営業時間<input v-model.number="member.upperLimitHours" type="number" min="0" step="0.01" /></label>
                  <label v-if="member.billingType === 'TIME_RANGE'">控除時給<input v-model.number="member.deductionHourlyRate" type="number" min="0" /></label>
                  <label v-if="member.billingType !== 'FIXED'">超過時給<input v-model.number="member.excessHourlyRate" type="number" min="0" /></label>
                  <label>開始日<input v-model="member.startDate" type="date" /></label>
                  <label>終了日<input v-model="member.endDate" type="date" /></label>
                  <label class="wide">メモ<input v-model="member.memo" /></label>
                  <div class="form-actions full">
                    <button v-if="canEditSes" @click="removeContractMember(index)"><Trash2 :size="16" />行削除</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="selectedContractId" class="sub-panel">
            <h3>登録済みメンバー</h3>
            <div class="ses-cards compact-cards">
              <div v-for="member in contracts.find((contract) => contract.id === selectedContractId)?.members || []" :key="member.id">
                <strong>{{ memberName(member) }}</strong>
                <span>{{ member.billingType === "FIXED" ? "定額" : member.billingType === "HOURLY" ? "時給" : "精算時間範囲" }} / {{ Number(member.unitPrice || 0).toLocaleString("ja-JP") }}円</span>
              </div>
            </div>
          </div>

          <div class="form-actions full">
            <button v-if="canEditSes" @click="deleteContract"><Trash2 :size="16" />非表示</button>
            <button v-if="canEditSes" class="primary" @click="saveContract"><Save :size="16" />契約保存</button>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeSubMenu === 'invoices'" class="panel">
      <div class="panel-head">
        <h2>請求管理</h2>
      </div>
      <div class="filter-row ses-search invoice-search">
        <label>請求対象月<input v-model="invoiceSearchPeriod" type="month" @change="onInvoiceSearchPeriodChange" /></label>
        <label>請求検索<input v-model="invoiceQuery" placeholder="請求書番号・契約名・取引先" @keyup.enter="refreshInvoices" /></label>
        <button class="primary" @click="refreshInvoices"><Search :size="16" />検索</button>
      </div>
      <div class="ses-layout contract-layout">
        <div class="ses-list">
          <div v-if="unbilledSalesContracts.length" class="unbilled-list">
            <h3>未請求契約</h3>
            <button
              v-for="contract in unbilledSalesContracts"
              :key="contract.id"
              class="employee-item warning-item"
              @click="applyInvoiceContract(contract)"
            >
              <strong>{{ contract.title }}</strong>
              <span>{{ contract.customer.name }} / {{ invoiceSearchPeriod }} 未請求</span>
            </button>
          </div>
          <button
            v-for="invoice in invoices"
            :key="invoice.id"
            class="employee-item"
            :class="{ active: invoice.id === selectedInvoiceId }"
            @click="selectedInvoiceId = invoice.id"
          >
            <strong>{{ invoice.title }}</strong>
            <span>{{ invoice.customer.name }} / {{ invoice.invoiceNo || "番号なし" }}</span>
            <span>{{ Number(invoice.totalAmount || 0).toLocaleString("ja-JP") }}円</span>
          </button>
          <div v-if="!invoices.length" class="empty">請求書が登録されていません。</div>
        </div>

        <div class="contract-editor">
          <div class="ses-flow-note">
            請求契約から対象月の請求書を作成します。定額は作業時間入力不要、精算時間範囲は作業時間から控除・超過を自動反映します。
          </div>
          <div class="form-grid">
            <label class="wide">請求元契約<select v-model="invoiceForm.contractId"><option value="">選択</option><option v-for="contract in salesContracts" :key="contract.id" :value="contract.id">{{ contract.customer.name }} / {{ contract.title }}</option></select></label>
            <label>対象月<input v-model="invoiceForm.period" type="month" /></label>
            <label>発行日<input v-model="invoiceForm.issueDate" type="date" /></label>
            <label>支払期限<input v-model="invoiceForm.dueDate" type="date" /></label>
            <label>請求書番号<input v-model="invoiceForm.invoiceNo" /></label>
            <label class="wide">件名<input v-model="invoiceForm.title" placeholder="未入力時は契約名から自動作成" /></label>
            <label class="wide">備考<input v-model="invoiceForm.note" /></label>
            <div class="form-actions full">
              <button v-if="canEditSes" class="primary" @click="generateInvoice"><Save :size="16" />契約から請求書作成</button>
            </div>
          </div>

          <div v-if="selectedInvoiceWorkHourMembers.length" class="sub-panel">
            <h3>作業時間入力</h3>
            <div class="form-grid compact">
              <label v-for="member in selectedInvoiceWorkHourMembers" :key="member.id">
                {{ member.itemDescription || memberName(member) }}
                <input v-model.number="invoiceWorkHours[member.id]" type="number" min="0" step="0.01" />
              </label>
            </div>
          </div>

          <div class="sub-panel">
            <h3>請求書一覧</h3>
            <div class="ses-cards compact-cards">
              <div v-for="invoice in invoices" :key="invoice.id">
                <strong>{{ invoice.title }}</strong>
                <span>{{ invoice.customer.name }} / 合計 {{ Number(invoice.totalAmount || 0).toLocaleString("ja-JP") }}円</span>
                <div class="form-actions">
                  <button @click="downloadInvoicePdf(invoice)"><Download :size="16" />PDF</button>
                  <button v-if="canEditSes" @click="deleteInvoice(invoice)"><Trash2 :size="16" />非表示</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeSubMenu === 'masters'" class="panel">
      <div class="panel-head">
        <h2>マスタ管理</h2>
      </div>
      <div class="contract-editor">
        <div class="ses-flow-note">
          請求書PDFに印字する自社情報と振込先を登録します。
        </div>
        <div class="sub-panel">
          <h3>自社情報</h3>
          <div class="form-grid compact">
            <label>会社名<input v-model="companyForm.invoiceCompanyName" /></label>
            <label>郵便番号<input v-model="companyForm.invoicePostalCode" /></label>
            <label class="wide">住所<input v-model="companyForm.invoiceAddress" /></label>
            <label>電話番号<input v-model="companyForm.invoiceTel" /></label>
            <label>登録番号<input v-model="companyForm.invoiceRegistrationNo" /></label>
            <label>振込先銀行<input v-model="companyForm.invoiceBankName" /></label>
            <label>支店<input v-model="companyForm.invoiceBankBranch" /></label>
            <label>口座<input v-model="companyForm.invoiceBankAccount" /></label>
            <label>口座名義<input v-model="companyForm.invoiceBankHolder" /></label>
            <div class="form-actions full">
              <button v-if="canEditSes" class="primary" @click="saveCompanySetting"><Save :size="16" />自社情報保存</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="panel">
      <div class="panel-head"><h2>{{ activeMenuInfo.label }}</h2></div>
      <div class="ses-cards">
        <div>
          <strong>{{ activeMenuInfo.label }}</strong>
          <span>{{ activeMenuInfo.description }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
